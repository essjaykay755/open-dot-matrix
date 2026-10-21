import type { Rgb } from './protocol'

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '').trim()
  const normalized =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value.padEnd(6, '0').slice(0, 6)
  const numeric = Number.parseInt(normalized, 16)
  if (!Number.isFinite(numeric)) return [255, 255, 255]
  return [(numeric >> 16) & 0xff, (numeric >> 8) & 0xff, numeric & 0xff]
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')}`
}

export function rgbaCss([r, g, b]: Rgb, alpha = 1): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
