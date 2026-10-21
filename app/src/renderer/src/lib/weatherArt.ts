import { encodeGif } from './gif'
import { drawText, measureText, normalizeForFont, textHeight } from './pixelFont'
import type { PreviewContent, PreviewFrame } from './preview'
import type { Rgb } from './protocol'
import { CONDITION_LABELS, type WeatherCondition, type WeatherReport } from './weather'

// Each animation is a seamless loop: every moving element is a function of (frame / FRAME_COUNT).
export const FRAME_COUNT = 20
export const FRAME_DELAY_MS = 100

const SIZE = 64
const TAU = Math.PI * 2

export interface WeatherArtOptions {
  showHighLow: boolean
  showCity: boolean
}

export interface WeatherArt {
  gifBytes: Uint8Array
  preview: PreviewContent
}

export function renderWeatherArt(report: WeatherReport, options: WeatherArtOptions): WeatherArt {
  const frames: PreviewFrame[] = []
  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    frames.push({ data: renderFrame(report, options, frame / FRAME_COUNT), delay: FRAME_DELAY_MS })
  }
  const unit = report.unit === 'fahrenheit' ? 'F' : 'C'
  return {
    gifBytes: encodeGif(frames),
    preview: {
      kind: 'gif',
      label: `Weather · ${report.location.name}`,
      detail: `${Math.round(report.temperature)}°${unit} · ${CONDITION_LABELS[report.condition]}`,
      frames
    }
  }
}

function renderFrame(report: WeatherReport, options: WeatherArtOptions, t: number): Uint8ClampedArray {
  const canvas = new Canvas()
  const storm = report.condition === 'thunder'
  const flash = storm && lightningIntensity(t) > 0

  canvas.sky(skyColors(report.condition, report.isDay, flash))
  drawScene(canvas, report.condition, report.isDay, t)

  const rows = (options.showHighLow ? 1 : 0) + (options.showCity ? 1 : 0)
  const tempY = rows === 0 ? 42 : rows === 1 ? 38 : 35
  drawTemperature(canvas, report, tempY)

  let rowY = tempY + textHeight({ size: 'large', scale: 2 }) + 2
  if (options.showHighLow) {
    drawHighLow(canvas, report, rowY)
    rowY += 7
  }
  if (options.showCity) drawCity(canvas, report.location.name, rowY)

  return canvas.data
}

// ── Scenes ────────────────────────────────────────────────────────────────

function drawScene(canvas: Canvas, condition: WeatherCondition, isDay: boolean, t: number): void {
  const bob = Math.sin(TAU * t)

  switch (condition) {
    case 'clear':
      if (isDay) drawSun(canvas, 32, 17, 8, t)
      else {
        drawStars(canvas, t)
        drawMoon(canvas, 32, 17, 9)
      }
      return
    case 'mostly-clear':
      if (isDay) drawSun(canvas, 35, 15, 7, t)
      else {
        drawStars(canvas, t)
        drawMoon(canvas, 35, 14, 8)
      }
      drawCloud(canvas, 22 + Math.round(bob * 1.5), 25, 0.6, CLOUD_LIGHT)
      return
    case 'partly-cloudy':
      if (isDay) drawSun(canvas, 39, 12, 6, t)
      else {
        drawStars(canvas, t)
        drawMoon(canvas, 39, 11, 7)
      }
      drawCloud(canvas, 28 + Math.round(bob * 1.5), 21, 0.95, CLOUD_LIGHT)
      return
    case 'cloudy':
      drawCloud(canvas, 40 - Math.round(bob * 1.5), 11, 0.72, CLOUD_GREY)
      drawCloud(canvas, 27 + Math.round(bob * 1.5), 20, 1, CLOUD_LIGHT)
      return
    case 'fog':
      if (isDay) canvas.disc(32, 14, 7, [150, 132, 70], 1)
      drawFog(canvas, t)
      return
    case 'drizzle':
      drawRain(canvas, t, { count: 7, cycles: 1, length: 1, color: [150, 200, 245] })
      drawCloud(canvas, 32 + Math.round(bob), 11, 1, CLOUD_GREY)
      return
    case 'rain':
      drawRain(canvas, t, { count: 11, cycles: 2, length: 2, color: [80, 165, 255] })
      drawCloud(canvas, 32 + Math.round(bob), 11, 1, CLOUD_GREY)
      return
    case 'heavy-rain':
      drawRain(canvas, t, { count: 16, cycles: 3, length: 3, color: [70, 140, 255] })
      drawCloud(canvas, 32 + Math.round(bob), 11, 1.05, CLOUD_DARK)
      return
    case 'snow':
      drawSnow(canvas, t)
      drawCloud(canvas, 32 + Math.round(bob), 11, 1, CLOUD_LIGHT)
      return
    case 'thunder': {
      drawRain(canvas, t, { count: 9, cycles: 2, length: 2, color: [80, 140, 230] })
      const flash = lightningIntensity(t)
      drawCloud(canvas, 32 + Math.round(bob), 11, 1.05, flash > 0 ? CLOUD_LIT : CLOUD_DARK)
      if (flash > 0) drawBolt(canvas, flash)
      return
    }
  }
}

function drawSun(canvas: Canvas, cx: number, cy: number, radius: number, t: number): void {
  // Rays repeat every 45°, so rotating by exactly 45° over the loop is seamless.
  const rotation = t * (Math.PI / 4)
  for (let ray = 0; ray < 8; ray += 1) {
    const angle = rotation + (ray * Math.PI) / 4
    const pulse = 0.5 + 0.5 * Math.sin(TAU * 2 * t + ray * (Math.PI / 2))
    const start = radius + 3
    const end = start + 2 + pulse * 1.6
    for (let step = start; step <= end; step += 0.5) {
      canvas.blend(
        Math.round(cx + Math.cos(angle) * step),
        Math.round(cy + Math.sin(angle) * step),
        [255, 186, 40],
        0.75 + pulse * 0.25
      )
    }
  }

  for (let y = cy - radius - 2; y <= cy + radius + 2; y += 1) {
    for (let x = cx - radius - 2; x <= cx + radius + 2; x += 1) {
      const distance = Math.hypot(x - cx, y - cy)
      if (distance <= radius + 0.4) {
        const highlight = Math.max(0, 1 - Math.hypot(x - (cx - radius * 0.35), y - (cy - radius * 0.35)) / radius)
        const edge = Math.min(1, distance / radius)
        canvas.set(x, y, mix(mix([255, 222, 70], [255, 150, 30], edge * edge), [255, 250, 200], highlight * 0.6))
      } else if (distance <= radius + 1.8) {
        canvas.blend(x, y, [255, 150, 30], 0.22)
      }
    }
  }
}

function drawMoon(canvas: Canvas, cx: number, cy: number, radius: number): void {
  for (let y = cy - radius - 1; y <= cy + radius + 1; y += 1) {
    for (let x = cx - radius - 1; x <= cx + radius + 1; x += 1) {
      const inside = Math.hypot(x - cx, y - cy) <= radius + 0.3
      const shadow = Math.hypot(x - (cx + radius * 0.55), y - (cy - radius * 0.35)) <= radius * 0.85
      if (!inside || shadow) continue
      const shade = Math.min(1, Math.hypot(x - (cx - radius * 0.4), y - cy) / radius)
      canvas.set(x, y, mix([250, 244, 205], [190, 180, 140], shade))
    }
  }
  canvas.blend(cx - Math.round(radius * 0.45), cy + Math.round(radius * 0.3), [150, 142, 110], 0.8)
  canvas.blend(cx - Math.round(radius * 0.6), cy - Math.round(radius * 0.2), [170, 160, 125], 0.6)
}

const STARS: [number, number, number][] = [
  [6, 5, 0], [15, 11, 0.3], [52, 5, 0.55], [58, 15, 0.15], [45, 2, 0.8],
  [8, 22, 0.65], [57, 27, 0.4], [21, 3, 0.9], [3, 13, 0.25], [50, 24, 0.7]
]

function drawStars(canvas: Canvas, t: number): void {
  for (const [x, y, phase] of STARS) {
    const twinkle = 0.5 + 0.5 * Math.sin(TAU * (t + phase))
    const tone: Rgb = [210, 220, 255]
    canvas.blend(x, y, tone, 0.25 + twinkle * 0.75)
    if (twinkle > 0.82) {
      const arm = (twinkle - 0.82) * 3
      canvas.blend(x - 1, y, tone, arm)
      canvas.blend(x + 1, y, tone, arm)
      canvas.blend(x, y - 1, tone, arm)
      canvas.blend(x, y + 1, tone, arm)
    }
  }
}

interface CloudPalette {
  top: Rgb
  bottom: Rgb
  rim: Rgb
}

const CLOUD_LIGHT: CloudPalette = { top: [240, 244, 252], bottom: [150, 162, 186], rim: [255, 255, 255] }
const CLOUD_GREY: CloudPalette = { top: [176, 184, 198], bottom: [96, 104, 122], rim: [205, 212, 224] }
const CLOUD_DARK: CloudPalette = { top: [118, 122, 140], bottom: [58, 60, 76], rim: [150, 155, 172] }
const CLOUD_LIT: CloudPalette = { top: [210, 205, 235], bottom: [130, 120, 170], rim: [255, 250, 220] }

const CLOUD_PUFFS: [number, number, number][] = [
  [-8, 2, 5],
  [-1, -2, 7],
  [7, 1, 5.5],
  [12, 4, 3.2]
]

function insideCloud(x: number, y: number, cx: number, cy: number, scale: number): boolean {
  const dx = (x + 0.5 - cx) / scale
  const dy = (y + 0.5 - cy) / scale
  if (dx >= -12 && dx <= 14 && dy >= 2 && dy <= 7) return true
  return CLOUD_PUFFS.some(([px, py, radius]) => Math.hypot(dx - px, dy - py) <= radius)
}

function drawCloud(canvas: Canvas, cx: number, cy: number, scale: number, palette: CloudPalette): void {
  const top = Math.floor(cy - 9 * scale)
  const bottom = Math.ceil(cy + 7 * scale)
  for (let y = top; y <= bottom; y += 1) {
    for (let x = Math.floor(cx - 14 * scale); x <= Math.ceil(cx + 16 * scale); x += 1) {
      if (!insideCloud(x, y, cx, cy, scale)) continue
      const shade = Math.min(1, Math.max(0, (y - top) / (bottom - top)))
      let tone = mix(palette.top, palette.bottom, shade * shade)
      if (!insideCloud(x, y - 1, cx, cy, scale)) tone = palette.rim
      else if (!insideCloud(x, y + 1, cx, cy, scale)) tone = mix(tone, [0, 0, 0], 0.25)
      canvas.set(x, y, tone)
    }
  }
}

interface RainStyle {
  count: number
  cycles: number
  length: number
  color: Rgb
}

function drawRain(canvas: Canvas, t: number, style: RainStyle): void {
  const top = 17
  const fall = 17
  for (let drop = 0; drop < style.count; drop += 1) {
    const column = 19 + Math.round((drop / style.count) * 26)
    const phase = (drop * 0.618) % 1
    const progress = (phase + t * style.cycles) % 1
    const y = Math.round(top + progress * fall)
    const x = column - Math.round(progress * 3)
    for (let tail = 0; tail < style.length; tail += 1) {
      canvas.blend(x + (tail > 1 ? 1 : 0), y - tail, style.color, 1 - tail * 0.3)
    }
  }
}

function drawSnow(canvas: Canvas, t: number): void {
  const flakes = 12
  for (let flake = 0; flake < flakes; flake += 1) {
    const phase = (flake * 0.618) % 1
    const progress = (phase + t) % 1
    const sway = Math.round(1.5 * Math.sin(TAU * (t + flake * 0.37)))
    const x = 19 + Math.round((flake / flakes) * 26) + sway
    const y = Math.round(18 + progress * 16)
    const tone: Rgb = [235, 242, 255]
    canvas.blend(x, y, tone, 1)
    if (flake % 3 === 0) {
      canvas.blend(x - 1, y, tone, 0.45)
      canvas.blend(x + 1, y, tone, 0.45)
      canvas.blend(x, y - 1, tone, 0.45)
      canvas.blend(x, y + 1, tone, 0.45)
    }
  }
}

const FOG_ROWS: { y: number; dashes: [number, number][]; direction: number; tone: Rgb }[] = [
  { y: 7, dashes: [[0, 12], [17, 9]], direction: 1, tone: [140, 146, 158] },
  { y: 12, dashes: [[3, 15], [22, 6]], direction: -1, tone: [176, 182, 194] },
  { y: 17, dashes: [[0, 9], [13, 14]], direction: 1, tone: [196, 202, 212] },
  { y: 22, dashes: [[5, 13], [23, 6]], direction: -1, tone: [168, 174, 186] },
  { y: 27, dashes: [[1, 11], [16, 10]], direction: 1, tone: [132, 138, 150] }
]

function drawFog(canvas: Canvas, t: number): void {
  const period = 32
  for (const row of FOG_ROWS) {
    const shift = Math.round(t * period) * row.direction
    for (let x = 0; x < SIZE; x += 1) {
      const local = (((x - shift) % period) + period) % period
      const lit = row.dashes.some(([start, length]) => local >= start && local < start + length)
      if (lit) {
        canvas.set(x, row.y, row.tone)
        canvas.blend(x, row.y + 1, row.tone, 0.35)
      }
    }
  }
}

function lightningIntensity(t: number): number {
  const frame = Math.round(t * FRAME_COUNT)
  if (frame === 6 || frame === 9) return 1
  if (frame === 7 || frame === 10) return 0.55
  return 0
}

function drawBolt(canvas: Canvas, intensity: number): void {
  const points: [number, number][] = [[35, 17], [30, 25], [34, 25], [29, 34]]
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x0, y0] = points[index]
    const [x1, y1] = points[index + 1]
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
    for (let step = 0; step <= steps; step += 1) {
      const x = Math.round(x0 + ((x1 - x0) * step) / steps)
      const y = Math.round(y0 + ((y1 - y0) * step) / steps)
      canvas.blend(x, y, [255, 246, 150], intensity)
      canvas.blend(x + 1, y, [255, 210, 70], intensity * 0.6)
    }
  }
}

// ── Text ──────────────────────────────────────────────────────────────────

function drawTemperature(canvas: Canvas, report: WeatherReport, y: number): void {
  const text = `${Math.round(report.temperature)}°`
  const options = { size: 'large' as const, scale: 2, spacing: 1 }
  const width = measureText(text, options)
  const base = temperatureColor(report)
  const shine = (_column: number, row: number): Rgb =>
    mix(base, [255, 255, 255], Math.max(0, 0.35 - row * 0.04))
  drawText(canvas.data, text, Math.round((SIZE - width) / 2), y, shine, options)
}

function drawHighLow(canvas: Canvas, report: WeatherReport, y: number): void {
  const high = `H${Math.round(report.high)}`
  const low = `L${Math.round(report.low)}`
  const gap = 5
  const width = measureText(high) + gap + measureText(low)
  const x = Math.round((SIZE - width) / 2)
  drawText(canvas.data, high, x, y, [255, 150, 90])
  drawText(canvas.data, low, x + measureText(high) + gap, y, [110, 180, 255])
}

function drawCity(canvas: Canvas, name: string, y: number): void {
  let text = normalizeForFont(name)
  while (text.length > 0 && measureText(text) > SIZE - 2) text = text.slice(0, -1)
  text = text.trimEnd()
  const width = measureText(text)
  drawText(canvas.data, text, Math.round((SIZE - width) / 2), y, [175, 184, 200])
}

function temperatureColor(report: WeatherReport): Rgb {
  const celsius = report.unit === 'fahrenheit' ? ((report.temperature - 32) * 5) / 9 : report.temperature
  const stops: [number, Rgb][] = [
    [-15, [170, 200, 255]],
    [0, [110, 200, 255]],
    [12, [120, 240, 190]],
    [22, [255, 225, 110]],
    [30, [255, 160, 60]],
    [40, [255, 80, 60]]
  ]
  if (celsius <= stops[0][0]) return stops[0][1]
  for (let index = 1; index < stops.length; index += 1) {
    const [limit, tone] = stops[index]
    if (celsius <= limit) {
      const [previousLimit, previousTone] = stops[index - 1]
      return mix(previousTone, tone, (celsius - previousLimit) / (limit - previousLimit))
    }
  }
  return stops[stops.length - 1][1]
}

function skyColors(condition: WeatherCondition, isDay: boolean, flash: boolean): [Rgb, Rgb] {
  if (flash) return [[44, 40, 70], [6, 6, 14]]
  if (condition === 'thunder' || condition === 'heavy-rain') return [[14, 14, 24], [2, 2, 6]]
  if (!isDay) return [[6, 8, 26], [0, 0, 4]]
  if (condition === 'clear' || condition === 'mostly-clear') return [[8, 26, 58], [1, 4, 12]]
  return [[14, 20, 34], [2, 3, 8]]
}

// ── Pixel buffer ──────────────────────────────────────────────────────────

class Canvas {
  readonly data = new Uint8ClampedArray(SIZE * SIZE * 4)

  sky([top, bottom]: [Rgb, Rgb]): void {
    for (let y = 0; y < SIZE; y += 1) {
      // The sky fades to black behind the text so the numbers stay legible.
      const tone = mix(top, bottom, Math.min(1, y / 34))
      for (let x = 0; x < SIZE; x += 1) this.set(x, y, tone)
    }
  }

  set(x: number, y: number, [r, g, b]: Rgb): void {
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return
    const offset = (y * SIZE + x) * 4
    this.data[offset] = r
    this.data[offset + 1] = g
    this.data[offset + 2] = b
    this.data[offset + 3] = 255
  }

  blend(x: number, y: number, color: Rgb, alpha: number): void {
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE || alpha <= 0) return
    const offset = (y * SIZE + x) * 4
    const amount = Math.min(1, alpha)
    this.data[offset] += (color[0] - this.data[offset]) * amount
    this.data[offset + 1] += (color[1] - this.data[offset + 1]) * amount
    this.data[offset + 2] += (color[2] - this.data[offset + 2]) * amount
    this.data[offset + 3] = 255
  }

  disc(cx: number, cy: number, radius: number, color: Rgb, alpha: number): void {
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        if (Math.hypot(x - cx, y - cy) <= radius + 0.3) this.blend(x, y, color, alpha)
      }
    }
  }
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = Math.min(1, Math.max(0, amount))
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ]
}
