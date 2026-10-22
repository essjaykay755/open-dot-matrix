import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { adaptSource, type AdaptOptions } from './image'
import type { PreviewContent, PreviewFrame } from './preview'

export interface AdaptedGif {
  gifBytes: Uint8Array
  preview: PreviewContent
  sourceWidth: number
  sourceHeight: number
  sourceFrameCount: number
  outputFrameCount: number
  durationMs: number
}

const MAX_FRAMES = 64
const MAX_TOTAL_DURATION_MS = 2000

export async function adaptGif(file: File, options: AdaptOptions): Promise<AdaptedGif> {
  if (typeof ImageDecoder === 'undefined') {
    throw new Error('This Electron build does not expose the ImageDecoder API')
  }

  const supported = await ImageDecoder.isTypeSupported('image/gif')
  if (!supported) throw new Error('GIF decoding is not supported by this runtime')

  const decoder = new ImageDecoder({
    data: await file.arrayBuffer(),
    type: 'image/gif',
    preferAnimation: true
  })

  try {
    await decoder.tracks.ready
    const track = decoder.tracks.selectedTrack
    if (!track) throw new Error('The GIF has no decodable image track')
    const sourceFrameCount = Math.max(1, track.frameCount)
    const indices = sampleIndices(sourceFrameCount, MAX_FRAMES)
    const frames: PreviewFrame[] = []
    let sourceWidth = 0
    let sourceHeight = 0
    let previousIndex = -1

    for (const frameIndex of indices) {
      const result = await decoder.decode({ frameIndex, completeFramesOnly: true })
      const image = result.image
      sourceWidth = image.displayWidth
      sourceHeight = image.displayHeight

      const gap = Math.max(1, frameIndex - previousIndex)
      const durationUs = image.duration ?? 100_000
      const delay = Math.max(20, Math.round((durationUs / 1000) * gap))
      const adapted = adaptSource(image, image.displayWidth, image.displayHeight, options)
      frames.push({ data: adapted.data.slice(), delay })
      previousIndex = frameIndex

      image.close()
    }

    const limited = limitFrames(frames)
    const gifBytes = encodeGif(limited)
    const durationMs = limited.reduce((sum, frame) => sum + frame.delay, 0)

    return {
      gifBytes,
      preview: {
        kind: 'gif',
        label: 'Animated GIF',
        detail: `${limited.length} frames · ${(durationMs / 1000).toFixed(1)}s · ${formatBytes(gifBytes.length)}`,
        frames: limited
      },
      sourceWidth,
      sourceHeight,
      sourceFrameCount,
      outputFrameCount: limited.length,
      durationMs
    }
  } finally {
    decoder.close()
  }
}

function sampleIndices(frameCount: number, maxFrames: number): number[] {
  if (frameCount <= maxFrames) {
    return Array.from({ length: frameCount }, (_, index) => index)
  }
  const indices = new Set<number>()
  for (let index = 0; index < maxFrames; index += 1) {
    indices.add(Math.round((index / (maxFrames - 1)) * (frameCount - 1)))
  }
  return [...indices].sort((a, b) => a - b)
}

function limitFrames(frames: PreviewFrame[]): PreviewFrame[] {
  let result = frames
  if (result.length > MAX_FRAMES) {
    const indices = sampleIndices(result.length, MAX_FRAMES)
    result = indices.map((index) => result[index])
  }

  const total = result.reduce((sum, frame) => sum + frame.delay, 0)
  if (total > MAX_TOTAL_DURATION_MS) {
    const scale = MAX_TOTAL_DURATION_MS / total
    result = result.map((frame) => ({
      data: frame.data,
      delay: Math.max(20, Math.round(frame.delay * scale))
    }))
  }

  return result
}

export function encodeGif(frames: PreviewFrame[]): Uint8Array {
  // Keep colour indices consistent throughout playback. In particular, subtle LED
  // animations should change pixels rather than depend on per-frame palette updates.
  const pixels = new Uint8Array(frames.reduce((size, frame) => size + frame.data.length, 0))
  let offset = 0
  for (const frame of frames) {
    pixels.set(frame.data, offset)
    offset += frame.data.length
  }
  const palette = quantize(pixels, 256)
  const encoder = GIFEncoder()
  frames.forEach((frame, index) => {
    const indexed = applyPalette(frame.data, palette)
    encoder.writeFrame(indexed, 64, 64, {
      palette: index === 0 ? palette : undefined,
      delay: Math.round(frame.delay),
      repeat: index === 0 ? 0 : undefined,
      dispose: 2
    })
  })
  encoder.finish()
  return encoder.bytes()
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  return `${(value / 1024).toFixed(1)} KB`
}
