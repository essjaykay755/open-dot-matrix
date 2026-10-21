import {
  MTU_PACKET_SIZE,
  STATUS_FAILED,
  STATUS_NEXT_CHUNK,
  STATUS_SAVED,
  parseAck,
  type Ack,
  type Chunk
} from './protocol'
import {
  DeviceCommandError,
  UploadError,
  type ChunkWriteOptions,
  type ChunkWriteResult,
  type CommandOptions,
  type Transport,
  type TransportCallbacks
} from './transport'

const SERVICE_UUIDS = [
  '0000fa00-0000-1000-8000-00805f9b34fb',
  '000000fa-0000-1000-8000-00805f9b34fb'
]
const WRITE_UUID = '0000fa02-0000-1000-8000-00805f9b34fb'
const NOTIFY_UUID = '0000fa03-0000-1000-8000-00805f9b34fb'
const DEVICE_NAME_PREFIX = 'IDM-'
const WRITE_SIZE = MTU_PACKET_SIZE
const COMMAND_ACK_TIMEOUT_MS = 1800
const CHUNK_ACK_TIMEOUT_MS = 7000

interface AckWaiter {
  resolve: (ack: Ack | null) => void
  timer: number
}

export class BleTransport implements Transport {
  readonly kind = 'ble' as const
  name = 'iDotMatrix'

  private device: BluetoothDevice | null = null
  private server: BluetoothRemoteGATTServer | null = null
  private writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null
  private notifyCharacteristic: BluetoothRemoteGATTCharacteristic | null = null
  private connected = false
  private ackWaiters = new Map<number, AckWaiter[]>()
  private ackQueues = new Map<number, Ack[]>()
  private callbacks: TransportCallbacks

  constructor(callbacks: TransportCallbacks) {
    this.callbacks = callbacks
  }

  get isConnected(): boolean {
    return this.connected
  }

  async connect(): Promise<void> {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth is unavailable in this runtime')
    }

    this.callbacks.log('info', 'Opening Bluetooth device picker…')
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: SERVICE_UUIDS
    })

    this.device = device
    this.name = device.name || 'iDotMatrix'
    this.callbacks.log('info', `Connecting to ${this.name}…`)

    device.addEventListener('gattserverdisconnected', this.handleGattDisconnect)

    if (!device.gatt) throw new Error('This device does not expose a GATT server')
    const server = await device.gatt.connect()
    this.server = server

    const characteristics = await this.findCharacteristics(server)
    this.writeCharacteristic = characteristics.write
    this.notifyCharacteristic = characteristics.notify

    this.notifyCharacteristic.addEventListener(
      'characteristicvaluechanged',
      this.handleNotification
    )
    await this.notifyCharacteristic.startNotifications()
    this.connected = true

    this.callbacks.log(
      'success',
      `Connected to ${this.name}. Write ${shortUuid(characteristics.write.uuid)} · Notify ${shortUuid(characteristics.notify.uuid)}`
    )
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.rejectAllWaiters()

    if (this.notifyCharacteristic) {
      try {
        this.notifyCharacteristic.removeEventListener(
          'characteristicvaluechanged',
          this.handleNotification
        )
        await this.notifyCharacteristic.stopNotifications()
      } catch {
        // The device may already be gone.
      }
    }

    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.handleGattDisconnect)
    }

    if (this.server?.connected) {
      this.server.disconnect()
    }

    this.ackQueues.clear()
    this.device = null
    this.server = null
    this.writeCharacteristic = null
    this.notifyCharacteristic = null
  }

  async writeCommand(data: Uint8Array, options: CommandOptions = {}): Promise<Ack | null> {
    const expectAck = options.expectAck ?? true
    const timeout = options.timeoutMs ?? COMMAND_ACK_TIMEOUT_MS
    const type = data[2]
    const subtype = data[3]
    const ackPromise = expectAck ? this.waitForAck(type, subtype, timeout) : null

    await this.writeBytes(data)
    const ack = ackPromise ? await ackPromise : null

    if (ack) this.callbacks.ack(ack)
    if (ack && !ack.statusFamily && !ack.accepted) {
      throw new DeviceCommandError(
        `Device rejected command type=${type} subtype=${subtype}`,
        ack
      )
    }
    if (ack?.statusFamily && ack.status === STATUS_FAILED) {
      throw new DeviceCommandError(
        `Device failed command type=${type} subtype=${subtype}`,
        ack
      )
    }
    return ack
  }

  async writeChunks(chunks: Chunk[], options: ChunkWriteOptions = {}): Promise<ChunkWriteResult> {
    if (!this.connected) throw new Error('Bluetooth device is not connected')
    if (chunks.length === 0) return { statuses: [] }

    const statuses: Ack[] = []
    const total = chunks.length
    let saved = false

    for (let index = 0; index < chunks.length; index += 1) {
      const status = options.statusAck
      if (status) this.drainAcks(status.type, status.subtype)

      await this.writeChunk(chunks[index])

      if (status) {
        const ack = await this.waitForAck(
          status.type,
          status.subtype,
          status.timeoutMs ?? CHUNK_ACK_TIMEOUT_MS
        )
        if (!ack) {
          throw new UploadError(
            `No device acknowledgment after chunk ${index + 1}/${total}`
          )
        }
        statuses.push(ack)
        this.callbacks.ack(ack)

        if (!ack.statusFamily) {
          throw new UploadError('Received a boolean ack where a status ack was expected', ack)
        }
        if (ack.status === STATUS_FAILED) {
          throw new UploadError(`Device rejected chunk ${index + 1}/${total}`, ack)
        }
        if (ack.status === STATUS_SAVED) {
          saved = true
          options.onProgress?.(total, total)
          break
        }
        if (ack.status !== STATUS_NEXT_CHUNK) {
          throw new UploadError(`Unknown status ${ack.status} after chunk ${index + 1}/${total}`, ack)
        }
      }

      options.onProgress?.(index + 1, total)
    }

    if (options.statusAck && !saved) {
      throw new UploadError('All chunks were sent but the device never reported SAVED')
    }
    if (!options.statusAck) {
      options.onProgress?.(total, total)
    }

    return { statuses }
  }

  private async findCharacteristics(
    server: BluetoothRemoteGATTServer
  ): Promise<{
    write: BluetoothRemoteGATTCharacteristic
    notify: BluetoothRemoteGATTCharacteristic
  }> {
    const services = new Map<string, BluetoothRemoteGATTService>()

    for (const uuid of SERVICE_UUIDS) {
      try {
        const found = await server.getPrimaryServices(uuid)
        for (const service of found) services.set(service.uuid, service)
      } catch {
        // Try the next known service UUID.
      }
    }

    try {
      const all = await server.getPrimaryServices()
      for (const service of all) services.set(service.uuid, service)
    } catch {
      // Some Chromium builds only expose explicitly requested services.
    }

    const discovered: string[] = []
    let write: BluetoothRemoteGATTCharacteristic | null = null
    let notify: BluetoothRemoteGATTCharacteristic | null = null

    for (const service of services.values()) {
      let characteristics: BluetoothRemoteGATTCharacteristic[] = []
      try {
        characteristics = await service.getCharacteristics()
      } catch {
        continue
      }
      for (const characteristic of characteristics) {
        const uuid = characteristic.uuid.toLowerCase()
        discovered.push(uuid)
        if (uuid === WRITE_UUID) write = characteristic
        if (uuid === NOTIFY_UUID) notify = characteristic
      }
    }

    if (!write || !notify) {
      const list = discovered.length > 0 ? discovered.map(shortUuid).join(', ') : 'none'
      throw new Error(
        `Could not find the iDotMatrix write/notify characteristics. Found: ${list}`
      )
    }

    if (!write.properties.write && !write.properties.writeWithoutResponse) {
      throw new Error('The write characteristic is not writable')
    }

    return { write, notify }
  }

  private async writeBytes(data: Uint8Array, withResponse = true): Promise<void> {
    for (let start = 0; start < data.length; start += WRITE_SIZE) {
      await this.writeRaw(data.slice(start, start + WRITE_SIZE), withResponse)
    }
  }

  private async writeChunk(chunk: Chunk): Promise<void> {
    for (let index = 0; index < chunk.length; index += 1) {
      await this.writeBytes(chunk[index], index === chunk.length - 1)
    }
  }

  private async writeRaw(piece: Uint8Array, withResponse: boolean): Promise<void> {
    try {
      await this.writePiece(piece, withResponse)
    } catch (error) {
      if (piece.length > 20) {
        this.callbacks.log(
          'warn',
          `A ${piece.length}-byte write failed; retrying in 20-byte pieces`
        )
        for (let start = 0; start < piece.length; start += 20) {
          await this.writePiece(piece.slice(start, start + 20), true)
        }
        return
      }
      throw error
    }
  }

  private async writePiece(piece: Uint8Array, withResponse: boolean): Promise<void> {
    const characteristic = this.writeCharacteristic
    if (!characteristic) throw new Error('Bluetooth is not connected')

    if (!withResponse && characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(piece as unknown as BufferSource)
      return
    }
    if (characteristic.properties.write) {
      await characteristic.writeValueWithResponse(piece as unknown as BufferSource)
      return
    }
    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(piece as unknown as BufferSource)
      return
    }
    throw new Error('The write characteristic is not writable')
  }

  private handleNotification = (event: Event): void => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic
    const value = characteristic.value
    if (!value) return

    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    const ack = parseAck(bytes)
    if (!ack) {
      this.callbacks.log(
        'info',
        `Notification: ${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ')}`
      )
      return
    }

    const key = ackKey(ack.type, ack.subtype)
    const waiters = this.ackWaiters.get(key)
    if (waiters && waiters.length > 0) {
      const waiter = waiters.shift()
      if (waiter) {
        window.clearTimeout(waiter.timer)
        waiter.resolve(ack)
      }
      if (waiters.length === 0) this.ackWaiters.delete(key)
      return
    }

    const queue = this.ackQueues.get(key) ?? []
    queue.push(ack)
    this.ackQueues.set(key, queue)
  }

  private handleGattDisconnect = (): void => {
    if (!this.connected) return
    this.connected = false
    this.rejectAllWaiters()
    this.callbacks.disconnected('Bluetooth device disconnected')
  }

  private waitForAck(type: number, subtype: number, timeoutMs: number): Promise<Ack | null> {
    const key = ackKey(type, subtype)
    const queued = this.ackQueues.get(key)
    if (queued && queued.length > 0) {
      const ack = queued.shift()
      if (queued.length === 0) this.ackQueues.delete(key)
      if (ack) return Promise.resolve(ack)
    }

    return new Promise((resolve) => {
      const waiter: AckWaiter = {
        resolve,
        timer: window.setTimeout(() => {
          const waiters = this.ackWaiters.get(key)
          if (waiters) {
            const index = waiters.indexOf(waiter)
            if (index >= 0) waiters.splice(index, 1)
            if (waiters.length === 0) this.ackWaiters.delete(key)
          }
          resolve(null)
        }, timeoutMs)
      }
      const waiters = this.ackWaiters.get(key) ?? []
      waiters.push(waiter)
      this.ackWaiters.set(key, waiters)
    })
  }

  private drainAcks(type: number, subtype: number): void {
    this.ackQueues.delete(ackKey(type, subtype))
  }

  private rejectAllWaiters(): void {
    for (const waiters of this.ackWaiters.values()) {
      for (const waiter of waiters) {
        window.clearTimeout(waiter.timer)
        waiter.resolve(null)
      }
    }
    this.ackWaiters.clear()
  }
}

function ackKey(type: number, subtype: number): number {
  return (type << 8) | subtype
}

function shortUuid(uuid: string): string {
  return uuid.length > 8 ? uuid.slice(4, 8) : uuid
}

export { DEVICE_NAME_PREFIX }

