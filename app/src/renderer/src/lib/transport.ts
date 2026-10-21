import type { Ack, Chunk } from './protocol'

export type LogLevel = 'info' | 'success' | 'warn' | 'error'

export interface TransportCallbacks {
  log: (level: LogLevel, message: string) => void
  ack: (ack: Ack) => void
  disconnected: (reason: string) => void
}

export interface CommandOptions {
  expectAck?: boolean
  timeoutMs?: number
}

export interface ChunkWriteOptions {
  statusAck?: {
    type: number
    subtype: number
    timeoutMs?: number
  }
  onProgress?: (sent: number, total: number) => void
}

export interface ChunkWriteResult {
  statuses: Ack[]
}

export interface Transport {
  readonly kind: 'ble' | 'demo'
  readonly name: string
  readonly isConnected: boolean
  connect(): Promise<void>
  disconnect(): Promise<void>
  writeCommand(data: Uint8Array, options?: CommandOptions): Promise<Ack | null>
  writeChunks(chunks: Chunk[], options?: ChunkWriteOptions): Promise<ChunkWriteResult>
}

export class DeviceCommandError extends Error {
  readonly ack: Ack | null

  constructor(message: string, ack: Ack | null = null) {
    super(message)
    this.name = 'DeviceCommandError'
    this.ack = ack
  }
}

export class UploadError extends Error {
  readonly ack: Ack | null

  constructor(message: string, ack: Ack | null = null) {
    super(message)
    this.name = 'UploadError'
    this.ack = ack
  }
}

