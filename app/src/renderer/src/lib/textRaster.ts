import type { PreviewContent, PreviewFrame } from './preview'
import type { Rgb, TextGlyph, TextStyle } from './protocol'

export interface RasterizedText {
  glyphs: TextGlyph[]
  preview: PreviewContent
}

const FONT_STACK = '"Segoe UI Variable Display", "Segoe UI", "Arial Unicode MS", Arial, sans-serif'
const WIDE_CHAR = /[\u0e00-\u0eff\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]|[\u{1f000}-\u{1faff}]/u

export function textScrollDelay(speed: number): number {
  const clamped = Math.max(5, Math.min(100, speed))
  return Math.max(20, Math.round((100 - clamped) * (8 / 3)))
}

export function rasterizeText(text: string, style: TextStyle): RasterizedText {
  const source = text.replace(/[\r\n\t]/g, ' ')
  const characters = Array.from(source)
  const glyphs: TextGlyph[] = []
  const widths: number[] = []

  for (const character of characters) {
    const width = WIDE_CHAR.test(character) || character.codePointAt(0)! > 0xffff ? 64 : 32
    const glyph = rasterizeGlyph(character, width, 64)
    glyphs.push(glyph)
    widths.push(width)
  }

  const previewFrames = buildPreview(glyphs, widths, style)
  const totalWidth = widths.reduce((sum, width) => sum + width, 0)
  return {
    glyphs,
    preview: {
      kind: 'text',
      label: 'Text',
      detail: `${characters.length} glyph${characters.length === 1 ? '' : 's'} · ${totalWidth}px strip`,
      frames: previewFrames
    }
  }
}

function rasterizeGlyph(character: string, width: number, height: number): TextGlyph {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas 2D is unavailable')

  context.clearRect(0, 0, width, height)
  context.fillStyle = '#ffffff'
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  if (character.trim().length > 0) {
    let fontSize = width === 64 ? 58 : 55
    context.font = `600 ${fontSize}px ${FONT_STACK}`
    const metrics = context.measureText(character)
    const textWidth = Math.max(1, metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight)
    const textHeight = Math.max(
      1,
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
    )
    const scale = Math.min((width - 4) / textWidth, (height - 4) / textHeight, 1)
    fontSize = Math.max(8, Math.floor(fontSize * scale))
    context.font = `600 ${fontSize}px ${FONT_STACK}`
    const adjusted = context.measureText(character)
    const baselineY =
      height / 2 + (adjusted.actualBoundingBoxAscent - adjusted.actualBoundingBoxDescent) / 2
    context.fillText(character, width / 2, baselineY)
  }

  const pixels = context.getImageData(0, 0, width, height).data
  const bytes = new Uint8Array((width * height) / 8)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3]
      if (alpha > 72) {
        const bitIndex = y * width + x
        bytes[bitIndex >> 3] |= 1 << (x % 8)
      }
    }
  }

  return { data: bytes, width, height }
}

function buildPreview(glyphs: TextGlyph[], widths: number[], style: TextStyle): PreviewFrame[] {
  if (glyphs.length === 0) {
    return [{ data: backgroundFrame(resolveBackground(style), 0), delay: 0 }]
  }

  const stripWidth = widths.reduce((sum, width) => sum + width, 0)
  const foreground = style.colorMode === 0 ? ([255, 255, 255] as Rgb) : style.color
  const background = resolveBackground(style)
  const strip = new Uint8ClampedArray(stripWidth * 64 * 4)

  for (let i = 0; i < strip.length; i += 4) {
    strip[i] = background[0]
    strip[i + 1] = background[1]
    strip[i + 2] = background[2]
    strip[i + 3] = 255
  }

  let xOffset = 0
  for (let glyphIndex = 0; glyphIndex < glyphs.length; glyphIndex += 1) {
    const glyph = glyphs[glyphIndex]
    for (let y = 0; y < glyph.height; y += 1) {
      for (let x = 0; x < glyph.width; x += 1) {
        const bitIndex = y * glyph.width + x
        const set = (glyph.data[bitIndex >> 3] >> (x % 8)) & 1
        if (!set) continue
        const target = (y * stripWidth + xOffset + x) * 4
        strip[target] = foreground[0]
        strip[target + 1] = foreground[1]
        strip[target + 2] = foreground[2]
        strip[target + 3] = 255
      }
    }
    xOffset += glyph.width
  }

  const staticFrame = composeStripFrame(strip, stripWidth, background, Math.round((64 - stripWidth) / 2))
  const mode = style.mode
  const delay = textScrollDelay(style.speed)

  if (mode === 0) {
    return [{ data: staticFrame, delay: 0 }]
  }

  if (mode === 5) {
    const off = backgroundFrame(background, 64 * 64)
    return [
      { data: staticFrame, delay: 380 },
      { data: off, delay: 260 }
    ]
  }

  if (mode === 6) {
    return Array.from({ length: 10 }, (_, index) => {
      const alpha = index < 5 ? index / 4 : (9 - index) / 4
      const frame = new Uint8ClampedArray(64 * 64 * 4)
      for (let pixel = 0; pixel < 64 * 64; pixel += 1) {
        const offset = pixel * 4
        frame[offset] = Math.round(background[0] + (staticFrame[offset] - background[0]) * alpha)
        frame[offset + 1] = Math.round(
          background[1] + (staticFrame[offset + 1] - background[1]) * alpha
        )
        frame[offset + 2] = Math.round(
          background[2] + (staticFrame[offset + 2] - background[2]) * alpha
        )
        frame[offset + 3] = 255
      }
      return { data: frame, delay: 90 }
    })
  }

  if (mode === 7 || mode === 8) {
    return Array.from({ length: 14 }, (_, index) => {
      const reveal = Math.round((index / 13) * 64)
      const frame = backgroundFrame(background, 64 * 64)
      copyRect(staticFrame, frame, 0, 0, reveal, 64)
      return { data: frame, delay: 65 }
    })
  }

  const reverse = mode === 2
  const travel = 64 + stripWidth + 8
  const step = Math.max(1, Math.ceil(travel / 1500))
  const frameCount = Math.min(1500, Math.max(2, Math.ceil(travel / step)))
  const frames: PreviewFrame[] = []
  for (let index = 0; index < frameCount; index += 1) {
    const progress = index / (frameCount - 1)
    const x = reverse
      ? Math.round(-stripWidth + progress * travel)
      : Math.round(64 - progress * travel)
    frames.push({
      data: composeStripFrame(strip, stripWidth, background, x),
      delay: delay * step
    })
  }
  return frames
}

function resolveBackground(style: TextStyle): Rgb {
  return style.backgroundMode === 1 ? style.background : [0, 0, 0]
}

function backgroundFrame(background: Rgb, pixels: number): Uint8ClampedArray {
  const frame = new Uint8ClampedArray(pixels * 4)
  for (let i = 0; i < pixels; i += 1) {
    frame[i * 4] = background[0]
    frame[i * 4 + 1] = background[1]
    frame[i * 4 + 2] = background[2]
    frame[i * 4 + 3] = 255
  }
  return frame
}

function composeStripFrame(
  strip: Uint8ClampedArray,
  stripWidth: number,
  background: Rgb,
  xOffset: number
): Uint8ClampedArray {
  const frame = backgroundFrame(background, 64 * 64)
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const stripX = x - xOffset
      if (stripX < 0 || stripX >= stripWidth) continue
      const source = (y * stripWidth + stripX) * 4
      const target = (y * 64 + x) * 4
      frame[target] = strip[source]
      frame[target + 1] = strip[source + 1]
      frame[target + 2] = strip[source + 2]
      frame[target + 3] = 255
    }
  }
  return frame
}

function copyRect(
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      if (column < 0 || column >= 64 || row < 0 || row >= 64) continue
      const offset = (row * 64 + column) * 4
      target[offset] = source[offset]
      target[offset + 1] = source[offset + 1]
      target[offset + 2] = source[offset + 2]
      target[offset + 3] = 255
    }
  }
}
