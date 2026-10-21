import {
  STATUS_NEXT_CHUNK,
  STATUS_SAVED,
  type Ack,
  type Chunk
} from './protocol'
import type {
  ChunkWriteOptions,
  ChunkWriteResult,
  CommandOptions,
  Transport,
  TransportCallbacks
} from './transport'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms))

export class DemoTransport implements Transport {
  readonly kind = 'demo' as const
  readonly name = 'Demo panel · 64×64'
  private connected = false
  private callbacks: TransportCallbacks

  constructor(callbacks: TransportCallbacks) {
    this.callbacks = callbacks
  }

  get isConnected(): boolean {
    return this.connected
  }

  async connect(): Promise<void> {
    this.callbacks.log('info', 'Starting simulated 64×64 panel…')
    await sleep(180)
    this.connected = true
    this.callbacks.log('success', 'Demo panel ready. Every send is simulated locally.')
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  async writeCommand(data: Uint8Array, options: CommandOptions = {}): Promise<Ack | null> {
    if (!this.connected) throw new Error('Demo panel is not connected')
    await sleep(45)
    if (options.expectAck === false) return null

    const ack: Ack = {
      type: data[2],
      subtype: data[3],
      accepted: true,
      raw: new Uint8Array([5, 0, data[2], data[3], 1]),
      statusFamily: false
    }
    this.callbacks.ack(ack)
    return ack
  }

  async writeChunks(chunks: Chunk[], options: ChunkWriteOptions = {}): Promise<ChunkWriteResult> {
    if (!this.connected) throw new Error('Demo panel is not connected')
    const statuses: Ack[] = []
    let saved = false

    for (let index = 0; index < chunks.length; index += 1) {
      await sleep(options.statusAck ? 110 : 60)
      if (options.statusAck) {
        const isLast = index === chunks.length - 1
        const ack: Ack = {
          type: options.statusAck.type,
          subtype: options.statusAck.subtype,
          status: isLast ? STATUS_SAVED : STATUS_NEXT_CHUNK,
          raw: new Uint8Array([5, 0, options.statusAck.type, options.statusAck.subtype, isLast ? 3 : 1]),
          statusFamily: true
        }
        statuses.push(ack)
        this.callbacks.ack(ack)
        if (isLast) {
          saved = true
          options.onProgress?.(index + 1, chunks.length)
          break
        }
      }
      options.onProgress?.(index + 1, chunks.length)
    }

    if (options.statusAck && !saved) {
      options.onProgress?.(chunks.length, chunks.length)
    }
    if (!options.statusAck) {
      options.onProgress?.(chunks.length, chunks.length)
    }

    return { statuses }
  }
}

