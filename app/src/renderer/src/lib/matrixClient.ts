import { BleTransport } from './bleTransport'
import { DemoTransport } from './demoTransport'
import {
  DIY_ENTER_CLEAR,
  GIF_TYPE_NO_TIME_SIGNATURE,
  buildChronograph,
  buildClock,
  buildCountdown,
  buildDiyMode,
  buildFrameChunks,
  buildFullscreenColor,
  buildGifChunks,
  buildScoreboard,
  buildScreenTimeout,
  buildSetBrightness,
  buildSetFlipped,
  buildSetPower,
  buildSetTimeIndicator,
  buildSyncTime,
  type Ack,
  type ClockOptions,
  type Rgb,
  type TextPacket
} from './protocol'
import type { LogLevel, Transport } from './transport'

export type MatrixMode = 'demo' | 'connecting' | 'ble' | 'disconnected'

export interface MatrixState {
  mode: MatrixMode
  deviceName: string
  message?: string
}

export interface LogEntryEvent {
  level: LogLevel
  message: string
}

export interface ProgressEvent {
  label: string
  done: number
  total: number
}

interface MatrixEventMap {
  log: LogEntryEvent
  state: MatrixState
  progress: ProgressEvent | null
  ack: Ack
}

type Listener<T> = (payload: T) => void

export class MatrixClient {
  private transport: Transport | null = null
  private diyActive = false
  private queue: Promise<unknown> = Promise.resolve()
  private state: MatrixState = {
    mode: 'disconnected',
    deviceName: 'No device'
  }
  private listeners = new Map<keyof MatrixEventMap, Set<Listener<unknown>>>()

  on<K extends keyof MatrixEventMap>(event: K, listener: Listener<MatrixEventMap[K]>): () => void {
    const set = this.listeners.get(event) ?? new Set<Listener<unknown>>()
    const wrapped = listener as Listener<unknown>
    set.add(wrapped)
    this.listeners.set(event, set)
    return () => {
      set.delete(wrapped)
      if (set.size === 0) this.listeners.delete(event)
    }
  }

  get currentState(): MatrixState {
    return this.state
  }

  get isConnected(): boolean {
    return this.transport?.isConnected ?? false
  }

  get isDemo(): boolean {
    return this.transport?.kind === 'demo'
  }

  async useDemo(): Promise<void> {
    if (this.transport?.kind === 'ble') {
      await this.transport.disconnect().catch(() => undefined)
    }
    this.diyActive = false
    const transport = new DemoTransport(this.transportCallbacks())
    this.transport = transport
    this.setState({ mode: 'demo', deviceName: transport.name })
    await transport.connect()
  }

  async connectBle(): Promise<void> {
    if (this.transport) {
      await this.transport.disconnect().catch(() => undefined)
    }

    this.diyActive = false
    this.setState({ mode: 'connecting', deviceName: 'Scanning…', message: 'Choose a Bluetooth device' })

    const transport = new BleTransport(this.transportCallbacks())
    this.transport = transport

    try {
      await transport.connect()
      this.setState({ mode: 'ble', deviceName: transport.name })
    } catch (error) {
      await transport.disconnect().catch(() => undefined)
      this.transport = null
      this.setState({
        mode: 'disconnected',
        deviceName: 'No device',
        message: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  async disconnect(): Promise<void> {
    const transport = this.transport
    this.transport = null
    this.diyActive = false
    if (transport) await transport.disconnect().catch(() => undefined)
    this.setState({ mode: 'disconnected', deviceName: 'No device' })
  }

  async sendImage(rgb: Uint8Array): Promise<void> {
    await this.runExclusive('Uploading image', async () => {
      const transport = this.requireTransport()
      const chunks = buildFrameChunks(rgb)

      if (!this.diyActive) {
        await this.writeCommand(buildDiyMode(DIY_ENTER_CLEAR), 'Enter DIY mode')
        this.diyActive = true
      }

      this.emit('progress', { label: 'Uploading full frame', done: 0, total: chunks.length })
      try {
        await transport.writeChunks(chunks, {
          onProgress: (done, total) => {
            this.emit('progress', { label: 'Uploading full frame', done, total })
          }
        })
      } finally {
        this.emit('progress', null)
      }

      this.log('success', `Frame sent: ${chunks.length} protocol chunks, ${rgb.length} RGB bytes.`)
    })
  }

  async sendGif(gifBytes: Uint8Array): Promise<void> {
    await this.runExclusive('Uploading GIF', async () => {
      const transport = this.requireTransport()
      const chunks = buildGifChunks(gifBytes, GIF_TYPE_NO_TIME_SIGNATURE)
      this.diyActive = false

      this.emit('progress', { label: 'Uploading GIF', done: 0, total: chunks.length })

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await transport.writeChunks(chunks, {
            statusAck: { type: 1, subtype: 0 },
            onProgress: (done, total) => {
              this.emit('progress', { label: 'Uploading GIF', done, total })
            }
          })
          this.log('success', `GIF saved: ${chunks.length} protocol chunks, ${gifBytes.length} bytes.`)
          return
        } catch (error) {
          if (attempt === 1) {
            this.log('warn', 'GIF transfer did not reach SAVED; retrying once from chunk 1.')
            continue
          }
          throw error
        }
      }
    })
  }

  async sendText(packet: TextPacket): Promise<void> {
    await this.runExclusive('Uploading text', async () => {
      const transport = this.requireTransport()
      this.diyActive = false
      this.emit('progress', { label: 'Uploading text', done: 0, total: packet.chunks.length })
      try {
        await transport.writeChunks(packet.chunks, {
          onProgress: (done, total) => {
            this.emit('progress', { label: 'Uploading text', done, total })
          }
        })
      } finally {
        this.emit('progress', null)
      }
      this.log(
        'success',
        `Text sent: ${packet.glyphCount} glyphs, ${packet.payload.length} payload bytes, ${packet.chunks.length} protocol chunk(s).`
      )
    })
  }

  async setBrightness(percent: number): Promise<void> {
    await this.runExclusive(undefined, () => this.writeCommand(buildSetBrightness(percent), 'Brightness'))
  }

  async setPower(on: boolean): Promise<void> {
    await this.runExclusive(undefined, () =>
      this.writeCommand(buildSetPower(on), on ? 'Power on' : 'Power off')
    )
  }

  async setFlipped(flipped: boolean): Promise<void> {
    await this.runExclusive(undefined, () =>
      this.writeCommand(buildSetFlipped(flipped), flipped ? 'Flip 180°' : 'Restore orientation')
    )
  }

  async syncTime(): Promise<void> {
    await this.runExclusive(undefined, () =>
      this.writeCommand(buildSyncTime(), 'Sync clock', { expectAck: false })
    )
  }

  async showColor(color: Rgb): Promise<void> {
    await this.runExclusive(undefined, async () => {
      this.diyActive = false
      await this.writeCommand(buildFullscreenColor(color), 'Fullscreen color')
    })
  }

  async showClock(options: ClockOptions): Promise<void> {
    await this.runExclusive(undefined, async () => {
      this.diyActive = false
      await this.writeCommand(buildClock(options), 'Clock')
    })
  }

  async setCountdown(mode: number, minutes: number, seconds: number): Promise<void> {
    await this.runExclusive(undefined, async () => {
      this.diyActive = false
      await this.writeCommand(buildCountdown(mode, minutes, seconds), 'Countdown')
    })
  }

  async setChronograph(mode: number): Promise<void> {
    await this.runExclusive(undefined, async () => {
      this.diyActive = false
      await this.writeCommand(buildChronograph(mode), 'Stopwatch')
    })
  }

  async showScoreboard(scoreA: number, scoreB: number): Promise<void> {
    await this.runExclusive(undefined, async () => {
      this.diyActive = false
      await this.writeCommand(buildScoreboard(scoreA, scoreB), 'Scoreboard')
    })
  }

  async setScreenTimeout(value: number): Promise<void> {
    await this.runExclusive(undefined, () =>
      this.writeCommand(buildScreenTimeout(value), 'Screen timeout')
    )
  }

  async setTimeIndicator(enabled: boolean): Promise<void> {
    await this.runExclusive(undefined, () =>
      this.writeCommand(buildSetTimeIndicator(enabled), 'Time indicator')
    )
  }

  private requireTransport(): Transport {
    if (!this.transport || !this.transport.isConnected) {
      throw new Error('Connect a panel or switch to demo mode first')
    }
    return this.transport
  }

  private async writeCommand(
    data: Uint8Array,
    label: string,
    options: { expectAck?: boolean } = {}
  ): Promise<Ack | null> {
    const transport = this.requireTransport()
    const ack = await transport.writeCommand(data, options)
    if (!ack && options.expectAck !== false) {
      this.log('warn', `${label}: command sent, but no device ack arrived.`)
    } else if (ack?.statusFamily) {
      this.log('info', `${label}: status ack ${ack.status}.`)
    } else {
      this.log('info', `${label}: sent.`)
    }
    return ack
  }

  private async runExclusive<T>(
    progressLabel: string | undefined,
    task: () => Promise<T>
  ): Promise<T> {
    const run = async (): Promise<T> => {
      if (progressLabel) {
        this.emit('progress', { label: progressLabel, done: 0, total: 0 })
      }
      try {
        return await task()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.log('error', message)
        throw error
      } finally {
        if (progressLabel) this.emit('progress', null)
      }
    }

    const result = this.queue.then(run, run)
    this.queue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private transportCallbacks() {
    return {
      log: (level: LogLevel, message: string) => this.log(level, message),
      ack: (ack: Ack) => this.emit('ack', ack),
      disconnected: (reason: string) => {
        this.transport = null
        this.diyActive = false
        this.log('error', reason)
        this.setState({ mode: 'disconnected', deviceName: 'No device', message: reason })
      }
    }
  }

  private log(level: LogLevel, message: string): void {
    this.emit('log', { level, message })
  }

  private setState(state: MatrixState): void {
    this.state = state
    this.emit('state', state)
  }

  private emit<K extends keyof MatrixEventMap>(event: K, payload: MatrixEventMap[K]): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const listener of set) listener(payload)
  }
}
