export const MATRIX_SIZE = 64
export const CHUNK_SIZE = 4096
export const MTU_PACKET_SIZE = 509
export const FALLBACK_PACKET_SIZE = 18
export const FRAME_BYTES = MATRIX_SIZE * MATRIX_SIZE * 3

export const DIY_QUIT_NOSAVE = 0
export const DIY_ENTER_CLEAR = 1
export const DIY_QUIT_STILL = 2
export const DIY_ENTER_NO_CLEAR = 3

export const STATUS_FAILED = 0
export const STATUS_NEXT_CHUNK = 1
export const STATUS_SAVED = 3

export const GIF_TYPE_NO_TIME_SIGNATURE = 12
export const GIF_TYPE_DIY_ANIMATION = 13

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

export type Rgb = [number, number, number]
export type Chunk = Uint8Array[]

export interface StatusAck {
  type: number
  subtype: number
  status: number
  raw: Uint8Array
  statusFamily: true
}

export interface DeviceAck {
  type: number
  subtype: number
  accepted: boolean
  raw: Uint8Array
  statusFamily: false
}

export type Ack = StatusAck | DeviceAck

export interface TextGlyph {
  data: Uint8Array
  width: number
  height: number
}

export interface TextStyle {
  mode: number
  speed: number
  colorMode: number
  color: Rgb
  backgroundMode: number
  background: Rgb
}

export interface TextPacket {
  payload: Uint8Array
  chunks: Chunk[]
  charCount: number
  glyphCount: number
}

const STATUS_ACK_KEYS = new Set([
  (0x00 << 8) | 0x80,
  (0x05 << 8) | 0x80,
  (0x03 << 8) | 0x00,
  (0x01 << 8) | 0x00
])

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

export function u16le(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff])
}

export function u32le(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff
  ])
}

export function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)))
}

export function clampRgb(color: Rgb): Rgb {
  return [clampByte(color[0]), clampByte(color[1]), clampByte(color[2])]
}

export function splitIntoBlePackets(data: Uint8Array, packetSize = MTU_PACKET_SIZE): Chunk {
  const packets: Uint8Array[] = []
  for (let start = 0; start < data.length; start += packetSize) {
    packets.push(data.slice(start, start + packetSize))
  }
  return packets
}

export function buildChunkedPackets(
  payload: Uint8Array,
  headerBuilder: (chunk: Uint8Array, fullPayload: Uint8Array, isFirst: boolean) => Uint8Array,
  packetSize = MTU_PACKET_SIZE
): Chunk[] {
  const chunks: Chunk[] = []
  for (let start = 0; start < payload.length; start += CHUNK_SIZE) {
    const chunk = payload.slice(start, start + CHUNK_SIZE)
    const withHeader = concatBytes(headerBuilder(chunk, payload, start === 0), chunk)
    chunks.push(splitIntoBlePackets(withHeader, packetSize))
  }
  return chunks
}

export function parseAck(data: Uint8Array): Ack | null {
  if (data.length !== 5 || data[0] !== 0x05 || data[1] !== 0x00) return null
  const type = data[2]
  const subtype = data[3]
  const key = (type << 8) | subtype
  const raw = data.slice()
  if (STATUS_ACK_KEYS.has(key)) {
    return { type, subtype, status: data[4], raw, statusFamily: true }
  }
  return { type, subtype, accepted: data[4] === 0x01, raw, statusFamily: false }
}

export function buildFrameChunks(rgb: Uint8Array): Chunk[] {
  if (rgb.length !== FRAME_BYTES) {
    throw new Error(`Expected ${FRAME_BYTES} RGB bytes, received ${rgb.length}`)
  }

  return buildChunkedPackets(rgb, (chunk, payload, isFirst) => {
    const header = new Uint8Array(9)
    header.set(u16le(chunk.length + 9), 0)
    header[2] = 0
    header[3] = 0
    header[4] = isFirst ? 0 : 2
    header.set(u32le(payload.length), 5)
    return header
  })
}

export function convertGifTimeSign(key: number): number {
  return { 1: 5, 2: 10, 3: 30, 4: 60, 5: 300 }[key] ?? 5
}

export function buildGifChunks(
  gifData: Uint8Array,
  gifType = GIF_TYPE_NO_TIME_SIGNATURE,
  timeSign = 1
): Chunk[] {
  if (gifData.length === 0) throw new Error('GIF data is empty')

  return buildChunkedPackets(gifData, (chunk, payload, isFirst) => {
    const header = new Uint8Array(16)
    header.set(u16le(chunk.length + 16), 0)
    header[2] = 1
    header[3] = 0
    header[4] = isFirst ? 0 : 2
    header.set(u32le(payload.length), 5)
    header.set(u32le(crc32(payload)), 9)
    if (gifType !== GIF_TYPE_NO_TIME_SIGNATURE) {
      header.set(u16le(convertGifTimeSign(timeSign)), 13)
    }
    header[15] = gifType & 0xff
    return header
  })
}

export function buildTextHeader(
  chunk: Uint8Array,
  fullPayload: Uint8Array,
  isFirst: boolean
): Uint8Array {
  const header = new Uint8Array(16)
  header.set(u16le(chunk.length + 16), 0)
  header[2] = 3
  header[3] = 0
  header[4] = isFirst ? 0 : 2
  header.set(u32le(fullPayload.length), 5)
  header.set(u32le(crc32(fullPayload)), 9)
  header[15] = 12
  return header
}

export function buildTextPacket(text: string, glyphs: TextGlyph[], style: TextStyle): TextPacket {
  if (glyphs.length === 0) throw new Error('Text must contain at least one glyph')

  const foreground = clampRgb(style.color)
  if (foreground[0] === 0 && foreground[1] === 0 && foreground[2] === 0) {
    foreground[2] = 1
  }
  const background = clampRgb(style.background)
  const metadata = new Uint8Array(14)
  const charCount = Math.min(0xffff, text.length)
  metadata.set(u16le(charCount), 0)
  metadata[2] = 1
  metadata[3] = 1
  metadata[4] = style.mode & 0xff
  metadata[5] = Math.max(5, Math.min(100, Math.round(style.speed))) & 0xff
  metadata[6] = style.colorMode & 0xff
  metadata[7] = foreground[0]
  metadata[8] = foreground[1]
  metadata[9] = foreground[2]
  metadata[10] = style.backgroundMode & 0xff
  metadata[11] = background[0]
  metadata[12] = background[1]
  metadata[13] = background[2]

  const glyphParts: Uint8Array[] = []
  for (const glyph of glyphs) {
    const packedSize = (glyph.width * glyph.height) / 8
    if (!Number.isInteger(packedSize) || glyph.data.length !== packedSize) {
      throw new Error(
        `Invalid glyph: ${glyph.width}x${glyph.height} needs ${packedSize} bytes, got ${glyph.data.length}`
      )
    }
    const tag = packedSize === 256 ? 7 : 8
    if (packedSize !== 256 && packedSize !== 512) {
      throw new Error(`64x64 text only supports 32x64 or 64x64 glyphs, got ${glyph.width}x${glyph.height}`)
    }
    glyphParts.push(new Uint8Array([tag, 0xff, 0xff, 0xff]), glyph.data)
  }

  const payload = concatBytes(metadata, ...glyphParts)
  return {
    payload,
    chunks: buildChunkedPackets(payload, buildTextHeader),
    charCount,
    glyphCount: glyphs.length
  }
}

export function buildDiyMode(mode: number): Uint8Array {
  if (![0, 1, 2, 3].includes(mode)) throw new Error(`Invalid DIY mode: ${mode}`)
  return new Uint8Array([5, 0, 4, 1, mode])
}

export function buildSetBrightness(percent: number): Uint8Array {
  if (!Number.isFinite(percent)) throw new Error('Brightness must be a number')
  const value = Math.max(5, Math.min(100, Math.round(percent)))
  return new Uint8Array([5, 0, 4, 0x80, value])
}

export function buildSetPower(on: boolean): Uint8Array {
  return new Uint8Array([5, 0, 7, 1, on ? 1 : 0])
}

export function buildSetFlipped(flipped: boolean): Uint8Array {
  return new Uint8Array([5, 0, 6, 0x80, flipped ? 1 : 0])
}

export function buildSyncTime(date = new Date()): Uint8Array {
  const jsDay = date.getDay()
  const weekday = jsDay === 0 ? 7 : jsDay
  return new Uint8Array([
    11,
    0,
    1,
    0x80,
    date.getFullYear() % 100,
    date.getMonth() + 1,
    date.getDate(),
    weekday,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds()
  ])
}

export function buildFullscreenColor(color: Rgb): Uint8Array {
  const [r, g, b] = clampRgb(color)
  return new Uint8Array([7, 0, 2, 2, r, g, b])
}

export interface ClockOptions {
  style: number
  showDate: boolean
  hour24: boolean
  color: Rgb
}

export function buildClock(options: ClockOptions): Uint8Array {
  if (!Number.isInteger(options.style) || options.style < 0 || options.style > 7) {
    throw new Error(`Clock style must be 0..7, got ${options.style}`)
  }
  const [r, g, b] = clampRgb(options.color)
  let flags = options.style
  if (options.showDate) flags |= 0x80
  if (options.hour24) flags |= 0x40
  return new Uint8Array([8, 0, 6, 1, flags, r, g, b])
}

export function buildCountdown(mode: number, minutes: number, seconds: number): Uint8Array {
  if (![0, 1, 2, 3].includes(mode)) throw new Error(`Countdown mode must be 0..3, got ${mode}`)
  if (minutes < 0 || minutes > 59) throw new Error('Countdown minutes must be 0..59')
  if (seconds < 0 || seconds > 59) throw new Error('Countdown seconds must be 0..59')
  return new Uint8Array([7, 0, 8, 0x80, mode, minutes, seconds])
}

export function buildChronograph(mode: number): Uint8Array {
  if (![0, 1, 2, 3].includes(mode)) throw new Error(`Chronograph mode must be 0..3, got ${mode}`)
  return new Uint8Array([5, 0, 9, 0x80, mode])
}

export function buildScoreboard(scoreA: number, scoreB: number): Uint8Array {
  const a = Math.max(0, Math.min(999, Math.round(scoreA)))
  const b = Math.max(0, Math.min(999, Math.round(scoreB)))
  return new Uint8Array([8, 0, 10, 0x80, a & 0xff, (a >>> 8) & 0xff, b & 0xff, (b >>> 8) & 0xff])
}

export function buildScreenTimeout(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 254) {
    throw new Error('Screen timeout must be 0..254')
  }
  return new Uint8Array([5, 0, 15, 0x80, value])
}

export function buildSetTimeIndicator(enabled: boolean): Uint8Array {
  return new Uint8Array([5, 0, 7, 0x80, enabled ? 1 : 0])
}

