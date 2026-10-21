import type { Rgb } from './protocol'

export type PreviewKind = 'idle' | 'image' | 'gif' | 'text' | 'color' | 'native'

export interface PreviewFrame {
  data: Uint8ClampedArray
  delay: number
}

export interface PreviewContent {
  kind: PreviewKind
  label: string
  detail?: string
  frames: PreviewFrame[]
}

export function previewFromRgba(
  data: Uint8ClampedArray,
  label: string,
  detail: string | undefined,
  kind: PreviewKind
): PreviewContent {
  return { kind, label, detail, frames: [{ data, delay: 0 }] }
}

export function solidPreview(color: Rgb, label = 'Solid color'): PreviewContent {
  const data = new Uint8ClampedArray(64 * 64 * 4)
  for (let i = 0; i < 64 * 64; i += 1) {
    data[i * 4] = color[0]
    data[i * 4 + 1] = color[1]
    data[i * 4 + 2] = color[2]
    data[i * 4 + 3] = 255
  }
  return previewFromRgba(data, label, 'Native output', 'color')
}

export function idlePreview(): PreviewContent {
  const data = new Uint8ClampedArray(64 * 64 * 4)
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const offset = (y * 64 + x) * 4
      const dx = x - 31.5
      const dy = y - 31.5
      const distance = Math.hypot(dx, dy)
      const gridDot = x % 8 === 0 && y % 8 === 0
      const ring = distance > 19.4 && distance < 20.6
      const cross = (Math.abs(dx) < 0.8 && Math.abs(dy) < 7) || (Math.abs(dy) < 0.8 && Math.abs(dx) < 7)
      const center = Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5
      const corner = (x < 4 && y < 4) || (x > 59 && y < 4) || (x < 4 && y > 59) || (x > 59 && y > 59)
      const tone: Rgb = center
        ? [216, 255, 99]
        : ring
          ? [48, 65, 36]
          : cross
            ? [79, 103, 50]
            : gridDot || corner
              ? [31, 38, 27]
              : [3, 5, 4]
      data[offset] = tone[0]
      data[offset + 1] = tone[1]
      data[offset + 2] = tone[2]
      data[offset + 3] = 255
    }
  }
  return previewFromRgba(data, 'Standby', 'Connect a panel or start creating', 'idle')
}
