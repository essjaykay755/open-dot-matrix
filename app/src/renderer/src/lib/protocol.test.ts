import { describe, expect, it } from 'vitest'
import {
  FRAME_BYTES,
  GIF_TYPE_DIY_ANIMATION,
  GIF_TYPE_NO_TIME_SIGNATURE,
  buildClock,
  buildFrameChunks,
  buildGifChunks,
  buildTextPacket,
  crc32,
  parseAck,
  splitIntoBlePackets,
  type TextGlyph,
  type TextStyle
} from './protocol'

const STYLE: TextStyle = {
  mode: 1,
  speed: 70,
  colorMode: 0,
  color: [216, 255, 99],
  backgroundMode: 0,
  background: [0, 0, 0]
}

describe('protocol packet builders', () => {
  it('computes the standard CRC32 value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('splits data into 509-byte BLE packets', () => {
    const packets = splitIntoBlePackets(new Uint8Array(1200))
    expect(packets.map((packet) => packet.length)).toEqual([509, 509, 182])
  })

  it('builds three 64x64 image chunks with 9-byte headers', () => {
    const chunks = buildFrameChunks(new Uint8Array(FRAME_BYTES))
    expect(chunks).toHaveLength(3)
    expect(chunks.map((chunk) => chunk.length)).toEqual([9, 9, 9])

    const first = chunks[0][0]
    const continuation = chunks[1][0]
    expect(first[0] | (first[1] << 8)).toBe(4105)
    expect(first[2]).toBe(0)
    expect(first[3]).toBe(0)
    expect(first[4]).toBe(0)
    expect(first.slice(5, 9)).toEqual(new Uint8Array([0, 48, 0, 0]))
    expect(continuation[4]).toBe(2)
    expect(chunks.flat()).toHaveLength(27)
  })

  it('parses status and boolean acknowledgements', () => {
    const saved = parseAck(new Uint8Array([5, 0, 1, 0, 3]))
    const accepted = parseAck(new Uint8Array([5, 0, 7, 1, 1]))
    const rejected = parseAck(new Uint8Array([5, 0, 7, 1, 0]))

    expect(saved?.statusFamily).toBe(true)
    expect(saved?.statusFamily ? saved.status : null).toBe(3)
    expect(accepted?.statusFamily).toBe(false)
    expect(accepted !== null && !accepted.statusFamily && accepted.accepted).toBe(true)
    expect(rejected !== null && !rejected.statusFamily && rejected.accepted).toBe(false)
    expect(parseAck(new Uint8Array([4, 0, 1, 0, 3]))).toBeNull()
  })

  it('builds a 14-byte text metadata header and glyph records', () => {
    const glyph: TextGlyph = { data: new Uint8Array(256), width: 32, height: 64 }
    const packet = buildTextPacket('AB', [glyph, glyph], STYLE)

    expect(packet.charCount).toBe(2)
    expect(packet.payload.length).toBe(14 + (4 + 256) * 2)
    expect(packet.payload.slice(0, 7)).toEqual(new Uint8Array([2, 0, 1, 1, 1, 70, 0]))
    expect(packet.payload[7]).toBe(216)
    expect(packet.payload[8]).toBe(255)
    expect(packet.payload[9]).toBe(99)
    expect(packet.payload[14]).toBe(7)
    expect(packet.payload.slice(15, 18)).toEqual(new Uint8Array([255, 255, 255]))
    expect(packet.chunks).toHaveLength(1)

    const bleHeader = packet.chunks[0][0]
    expect(bleHeader[0] | (bleHeader[1] << 8)).toBe(packet.payload.length + 16)
    expect(bleHeader[2]).toBe(3)
    expect(bleHeader[4]).toBe(0)
    expect(bleHeader[15]).toBe(12)
  })

  it('nudges pure black text to blue 1', () => {
    const packet = buildTextPacket('X', [{ data: new Uint8Array(256), width: 32, height: 64 }], {
      ...STYLE,
      color: [0, 0, 0]
    })
    expect(packet.payload[7]).toBe(0)
    expect(packet.payload[8]).toBe(0)
    expect(packet.payload[9]).toBe(1)
  })

  it('clamps text speed to the firmware range', () => {
    const glyph: TextGlyph = { data: new Uint8Array(256), width: 32, height: 64 }
    const slow = buildTextPacket('X', [glyph], { ...STYLE, speed: 0 })
    const fast = buildTextPacket('X', [glyph], { ...STYLE, speed: 250 })
    expect(slow.payload[5]).toBe(5)
    expect(fast.payload[5]).toBe(100)
  })

  it('builds GIF headers with and without a time signature', () => {
    const data = new Uint8Array(100)
    const plain = buildGifChunks(data, GIF_TYPE_NO_TIME_SIGNATURE)
    expect(plain).toHaveLength(1)
    expect(plain[0][0][2]).toBe(1)
    expect(plain[0][0][15]).toBe(12)
    expect(plain[0][0].slice(13, 15)).toEqual(new Uint8Array([0, 0]))

    const animation = buildGifChunks(data, GIF_TYPE_DIY_ANIMATION, 2)
    expect(animation[0][0][15]).toBe(13)
    expect(animation[0][0].slice(13, 15)).toEqual(new Uint8Array([10, 0]))
  })

  it('builds native control packets exactly', () => {
    expect(Array.from(buildClock({ style: 2, showDate: true, hour24: true, color: [1, 2, 3] }))).toEqual([
      8, 0, 6, 1, 0xc2, 1, 2, 3
    ])
  })
})
