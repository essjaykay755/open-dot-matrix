import { encodeGif } from './gif'
import { drawText, measureText, normalizeForFont, type TextOptions } from './pixelFont'
import type { PreviewContent, PreviewFrame } from './preview'
import type { Rgb } from './protocol'
import { CONDITION_LABELS, type WeatherCondition, type WeatherReport } from './weather'

// Each animation is a seamless loop: every moving element is a function of (frame / FRAME_COUNT).
export const FRAME_COUNT = 20
export const FRAME_DELAY_MS = 100

const SIZE = 64
const TAU = Math.PI * 2

export type WeatherStyle = 'scene' | 'bold' | 'glyph' | 'phosphor' | 'dots' | 'gauge'

export const WEATHER_STYLES: { id: WeatherStyle; label: string; description: string }[] = [
  { id: 'scene', label: 'Scene', description: 'Full-colour animated sky' },
  { id: 'bold', label: 'Bold', description: 'Huge shimmering temperature' },
  { id: 'glyph', label: 'Glyph', description: 'White line art, lime accents' },
  { id: 'phosphor', label: 'Phosphor', description: 'Lime CRT glow with scanlines' },
  { id: 'dots', label: 'Dots', description: 'Lime dot matrix' },
  { id: 'gauge', label: 'Gauge', description: 'Lime dial from low to high' }
]

export interface WeatherArtOptions {
  style: WeatherStyle
  showHighLow: boolean
  showCity: boolean
}

export interface WeatherArt {
  gifBytes: Uint8Array
  preview: PreviewContent
}

// The app's lime accent and its dimmer steps for the monochrome styles.
const LIME: Rgb = [200, 245, 80]
const LIME_MID: Rgb = [110, 150, 40]
const LIME_DIM: Rgb = [46, 66, 16]
const LIME_GHOST: Rgb = [14, 22, 5]
const LIME_HOT: Rgb = [228, 255, 160]
const WHITE: Rgb = [236, 238, 240]
const GREY: Rgb = [130, 134, 140]

export function renderWeatherArt(report: WeatherReport, options: WeatherArtOptions): WeatherArt {
  const frames = renderWeatherFrames(report, options)
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

export function renderWeatherFrames(report: WeatherReport, options: WeatherArtOptions): PreviewFrame[] {
  const context = new StyleContext(report, options)
  const render = STYLE_RENDERERS[options.style] ?? STYLE_RENDERERS.scene
  const frames: PreviewFrame[] = []
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    frames.push({ data: render(context, index), delay: FRAME_DELAY_MS })
  }
  return frames
}

// ── Layers ────────────────────────────────────────────────────────────────
// Scenes are painted into a layer that remembers coverage and how much of each pixel came from
// animated "accent" elements (rays, drops, flakes, lightning). Styles then recolour, outline,
// shrink and centre that artwork independently of how it was drawn.

class Layer {
  readonly color: Float32Array
  readonly alpha: Float32Array
  readonly accent: Float32Array

  constructor(readonly size = SIZE) {
    this.color = new Float32Array(size * size * 3)
    this.alpha = new Float32Array(size * size)
    this.accent = new Float32Array(size * size)
  }

  paint(x: number, y: number, color: Rgb, alpha = 1): void {
    this.put(x, y, color, alpha, false)
  }

  glow(x: number, y: number, color: Rgb, alpha = 1): void {
    this.put(x, y, color, alpha, true)
  }

  disc(cx: number, cy: number, radius: number, color: Rgb, alpha: number): void {
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        if (Math.hypot(x - cx, y - cy) <= radius + 0.3) this.paint(x, y, color, alpha)
      }
    }
  }

  at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return -1
    return y * this.size + x
  }

  rgb(index: number): Rgb {
    return [this.color[index * 3], this.color[index * 3 + 1], this.color[index * 3 + 2]]
  }

  private put(x: number, y: number, color: Rgb, alpha: number, accent: boolean): void {
    const index = this.at(x, y)
    if (index < 0 || alpha <= 0) return
    const a = Math.min(1, alpha)
    const below = this.alpha[index] * (1 - a)
    const out = a + below
    for (let channel = 0; channel < 3; channel += 1) {
      const offset = index * 3 + channel
      this.color[offset] = (color[channel] * a + this.color[offset] * below) / out
    }
    this.accent[index] = ((accent ? a : 0) + this.accent[index] * below) / out
    this.alpha[index] = out
  }
}

interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

/** Union of the visible artwork across every frame, so centring never jitters during the loop. */
function unionBounds(layers: Layer[], threshold = 0.3): Bounds {
  const bounds: Bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  for (const layer of layers) {
    for (let y = 0; y < layer.size; y += 1) {
      for (let x = 0; x < layer.size; x += 1) {
        if (layer.alpha[y * layer.size + x] < threshold) continue
        bounds.left = Math.min(bounds.left, x)
        bounds.right = Math.max(bounds.right, x)
        bounds.top = Math.min(bounds.top, y)
        bounds.bottom = Math.max(bounds.bottom, y)
      }
    }
  }
  if (!Number.isFinite(bounds.left)) return { left: 0, top: 0, right: 0, bottom: 0 }
  return bounds
}

/** Halves a layer for small icons, keeping the most opaque pixel of each 2×2 block. */
function halve(layer: Layer): Layer {
  const half = new Layer(layer.size / 2)
  for (let y = 0; y < half.size; y += 1) {
    for (let x = 0; x < half.size; x += 1) {
      let best = -1
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const index = layer.at(x * 2 + dx, y * 2 + dy)
          if (best < 0 || layer.alpha[index] > layer.alpha[best]) best = index
        }
      }
      const target = y * half.size + x
      half.color.set(layer.color.subarray(best * 3, best * 3 + 3), target * 3)
      half.alpha[target] = layer.alpha[best]
      half.accent[target] = layer.accent[best]
    }
  }
  return half
}

// ── Output buffer ─────────────────────────────────────────────────────────

class Frame {
  readonly data: Uint8ClampedArray

  constructor(readonly size = SIZE) {
    this.data = new Uint8ClampedArray(size * size * 4)
    for (let index = 3; index < this.data.length; index += 4) this.data[index] = 255
  }

  fill(color: (x: number, y: number) => Rgb): void {
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) this.set(x, y, color(x, y))
    }
  }

  set(x: number, y: number, [r, g, b]: Rgb): void {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return
    const offset = (y * this.size + x) * 4
    this.data[offset] = r
    this.data[offset + 1] = g
    this.data[offset + 2] = b
  }

  get(x: number, y: number): Rgb {
    const offset = (y * this.size + x) * 4
    return [this.data[offset], this.data[offset + 1], this.data[offset + 2]]
  }

  blend(x: number, y: number, color: Rgb, alpha: number): void {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size || alpha <= 0) return
    this.set(x, y, mix(this.get(x, y), color, alpha))
  }

  /** Draws a layer shifted by (dx, dy); `shade` maps each covered pixel to a colour and opacity. */
  composite(
    layer: Layer,
    dx: number,
    dy: number,
    shade: (color: Rgb, alpha: number, accent: number, x: number, y: number) => [Rgb, number] | null = (c, a) => [c, a]
  ): void {
    for (let y = 0; y < layer.size; y += 1) {
      for (let x = 0; x < layer.size; x += 1) {
        const index = y * layer.size + x
        const alpha = layer.alpha[index]
        if (alpha < 0.02) continue
        const shaded = shade(layer.rgb(index), alpha, layer.accent[index], x, y)
        if (shaded) this.blend(x + dx, y + dy, shaded[0], shaded[1])
      }
    }
  }

  text(text: string, y: number, color: Rgb | ((column: number, row: number) => Rgb), options: TextOptions = {}): void {
    const width = measureText(text, options)
    drawText(this.data, text, Math.round((this.size - width) / 2), y, color, { ...options, canvasSize: this.size })
  }
}

// ── Shared state for one render ───────────────────────────────────────────

interface SceneFrame {
  art: Layer
  backdrop: Layer
  flash: number
}

class StyleContext {
  readonly scenes: SceneFrame[]
  readonly bounds: Bounds
  private miniCache: { layers: Layer[]; bounds: Bounds } | null = null

  constructor(
    readonly report: WeatherReport,
    readonly options: WeatherArtOptions
  ) {
    this.scenes = []
    for (let index = 0; index < FRAME_COUNT; index += 1) {
      const t = index / FRAME_COUNT
      const art = new Layer()
      const backdrop = new Layer()
      drawScene(art, backdrop, report.condition, report.isDay, t)
      this.scenes.push({ art, backdrop, flash: report.condition === 'thunder' ? lightningIntensity(t) : 0 })
    }
    this.bounds = unionBounds(this.scenes.map((scene) => scene.art))
  }

  /** Half-size artwork for styles where the numbers are the hero. */
  get mini(): { layers: Layer[]; bounds: Bounds } {
    if (!this.miniCache) {
      const layers = this.scenes.map((scene) => halve(scene.art))
      this.miniCache = { layers, bounds: unionBounds(layers) }
    }
    return this.miniCache
  }

  get temperature(): string {
    return `${Math.round(this.report.temperature)}°`
  }

  get city(): string {
    return normalizeForFont(this.report.location.name, 'large')
  }
}

/** Offset that centres `bounds` horizontally and puts its top edge at `top`. */
function placement(bounds: Bounds, top: number, size = SIZE): { dx: number; dy: number } {
  return {
    dx: Math.round((size - 1 - (bounds.left + bounds.right)) / 2),
    dy: top - bounds.top
  }
}

interface Block {
  height: number
  gap: number
  draw: (y: number) => void
}

/** Stacks blocks top to bottom and centres the whole stack vertically, tightening gaps to fit. */
function stack(blocks: Block[], size = SIZE): void {
  const visible = blocks.filter((block) => block.height > 0)
  const gaps = visible.map((block, index) => (index > 0 ? block.gap : 0))
  const total = (): number => visible.reduce((sum, block, index) => sum + block.height + gaps[index], 0)
  while (total() > size - 2 && gaps.some((gap) => gap > 1)) {
    const widest = gaps.indexOf(Math.max(...gaps))
    gaps[widest] -= 1
  }
  let y = Math.floor((size - total()) / 2)
  visible.forEach((block, index) => {
    y += gaps[index]
    block.draw(y)
    y += block.height
  })
}

/** City name in the 5×7 font when it fits, otherwise the 3×5 font, trimmed to the panel. */
function cityText(name: string, maxWidth: number, preferLarge: boolean): { text: string; options: TextOptions } {
  if (preferLarge && measureText(name, { size: 'large' }) <= maxWidth) {
    return { text: name, options: { size: 'large' } }
  }
  let text = normalizeForFont(name)
  while (text.length > 0 && measureText(text) > maxWidth) text = text.slice(0, -1)
  return { text: text.trimEnd(), options: { size: 'small' } }
}

function highLowText(report: WeatherReport): { high: string; low: string } {
  return { high: `H${Math.round(report.high)}`, low: `L${Math.round(report.low)}` }
}

function drawHighLow(frame: Frame, report: WeatherReport, y: number, high: Rgb, low: Rgb, gap = 5): void {
  const text = highLowText(report)
  const width = measureText(text.high) + gap + measureText(text.low)
  const x = Math.round((frame.size - width) / 2)
  drawText(frame.data, text.high, x, y, high, { canvasSize: frame.size })
  drawText(frame.data, text.low, x + measureText(text.high) + gap, y, low, { canvasSize: frame.size })
}

/** Large temperature, shrinking the scale until it fits the width. */
function temperatureOptions(text: string, maxWidth: number, scales: number[]): TextOptions {
  for (const scale of scales) {
    const options: TextOptions = { size: 'large', scale }
    if (measureText(text, options) <= maxWidth) return options
  }
  return { size: 'large', scale: scales[scales.length - 1] }
}

// ── Styles ────────────────────────────────────────────────────────────────

type StyleRenderer = (context: StyleContext, index: number) => Uint8ClampedArray

const STYLE_RENDERERS: Record<WeatherStyle, StyleRenderer> = {
  scene: renderScene,
  bold: renderBold,
  glyph: renderGlyph,
  phosphor: renderPhosphor,
  dots: renderDots,
  gauge: renderGauge
}

/** Shared vertical layout: artwork, temperature, high/low and city, centred as one block. */
function layoutStack(
  context: StyleContext,
  drawArt: (dx: number, dy: number) => void,
  drawTemperature: (y: number, options: TextOptions) => void,
  drawRows: { highLow: (y: number) => void; city: (y: number, text: string, options: TextOptions) => void }
): { artTop: number; artBottom: number } {
  const { options, bounds } = context
  const tempOptions = temperatureOptions(context.temperature, SIZE - 4, [2, 1])
  const city = cityText(context.city, SIZE - 4, !options.showHighLow)
  const artHeight = bounds.bottom - bounds.top + 1
  let artTop = 0

  stack([
    {
      height: artHeight,
      gap: 0,
      draw: (y) => {
        artTop = y
        const { dx, dy } = placement(bounds, y)
        drawArt(dx, dy)
      }
    },
    { height: 7 * (tempOptions.scale ?? 1), gap: 4, draw: (y) => drawTemperature(y, tempOptions) },
    { height: options.showHighLow ? 5 : 0, gap: 3, draw: (y) => drawRows.highLow(y) },
    {
      height: options.showCity && city.text ? (city.options.size === 'large' ? 7 : 5) : 0,
      gap: 3,
      draw: (y) => drawRows.city(y, city.text, city.options)
    }
  ])
  return { artTop, artBottom: artTop + artHeight - 1 }
}

function renderScene(context: StyleContext, index: number): Uint8ClampedArray {
  const { report } = context
  const scene = context.scenes[index]
  const frame = new Frame()
  const [skyTop, skyBottom] = skyColors(report.condition, report.isDay, scene.flash > 0)
  const artHeight = context.bounds.bottom - context.bounds.top + 1

  // Paint the sky first with a provisional fade; the art layout decides the horizon below.
  const fadeTo = Math.min(SIZE, artHeight + 12)
  frame.fill((_x, y) => mix(skyTop, skyBottom, Math.min(1, y / fadeTo)))
  frame.composite(scene.backdrop, 0, 0)

  const base = temperatureColor(report)
  layoutStack(
    context,
    (dx, dy) => frame.composite(scene.art, dx, dy),
    (y, options) =>
      frame.text(context.temperature, y, (_column, row) => mix(base, [255, 255, 255], Math.max(0, 0.35 - row * 0.04)), options),
    {
      highLow: (y) => drawHighLow(frame, report, y, [255, 150, 90], [110, 180, 255]),
      city: (y, text, options) => frame.text(text, y, [180, 188, 204], options)
    }
  )
  return frame.data
}

function renderBold(context: StyleContext, index: number): Uint8ClampedArray {
  const { report, options } = context
  const scene = context.scenes[index]
  const t = index / FRAME_COUNT
  const frame = new Frame()
  const [skyTop] = skyColors(report.condition, report.isDay, scene.flash > 0)
  frame.fill((_x, y) => mix(mix(skyTop, [0, 0, 0], 0.35), [0, 0, 0], Math.min(1, y / 40)))
  frame.composite(scene.backdrop, 0, 0, (color, alpha) => [color, alpha * 0.6])

  const mini = context.mini
  const miniHeight = mini.bounds.bottom - mini.bounds.top + 1
  const tempOptions = temperatureOptions(context.temperature, SIZE - 2, [3, 2])
  const tempHeight = 7 * (tempOptions.scale ?? 1)
  const tempWidth = measureText(context.temperature, tempOptions)
  const city = cityText(context.city, SIZE - 4, !options.showHighLow)
  const base = temperatureColor(report)
  const highlight = mix(base, [255, 255, 255], 0.75)

  stack([
    {
      height: miniHeight,
      gap: 0,
      draw: (y) => {
        const { dx, dy } = placement(mini.bounds, y)
        frame.composite(mini.layers[index], dx, dy)
      }
    },
    {
      height: tempHeight,
      gap: 3,
      draw: (y) => {
        // A diagonal shine sweeps across the digits once per loop.
        const sweep = -12 + t * (tempWidth + 24)
        frame.text(context.temperature, y, (column, row) => {
          const shade = mix(mix(base, [255, 255, 255], 0.2), mix(base, [0, 0, 0], 0.25), row / tempHeight)
          const distance = Math.abs(column - (sweep - row * 0.6))
          return distance < 2.5 ? mix(shade, highlight, 1 - distance / 2.5) : shade
        }, tempOptions)
      }
    },
    {
      height: options.showHighLow ? 5 : 0,
      gap: 3,
      draw: (y) => drawHighLow(frame, report, y, [255, 150, 90], [110, 180, 255])
    },
    {
      height: options.showCity && city.text ? (city.options.size === 'large' ? 7 : 5) : 0,
      gap: 3,
      draw: (y) => frame.text(city.text, y, [180, 188, 204], city.options)
    }
  ])
  return frame.data
}

function renderGlyph(context: StyleContext, index: number): Uint8ClampedArray {
  const { report } = context
  const scene = context.scenes[index]
  const frame = new Frame()
  const art = scene.art
  const solid = (x: number, y: number): boolean => {
    const at = art.at(x, y)
    return at >= 0 && art.alpha[at] > 0.45 && art.accent[at] < 0.5
  }

  frame.composite(scene.backdrop, 0, 0, (_color, alpha) => [GREY, alpha * 0.8])
  if (scene.flash > 0) frame.fill(() => mix([0, 0, 0], LIME_GHOST, scene.flash))

  layoutStack(
    context,
    (dx, dy) =>
      frame.composite(art, dx, dy, (color, alpha, accent, x, y) => {
        if (accent >= 0.5) return [mix(LIME_MID, LIME, luminance(color)), Math.min(1, alpha * 1.2)]
        if (!solid(x, y)) return null
        const edge = !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)
        return edge ? [WHITE, 1] : [[22, 23, 25], 1]
      }),
    (y, options) => {
      const digits = context.temperature.slice(0, -1)
      const degreeWidth = measureText('°', options) + (options.scale ?? 1)
      const width = measureText(digits, options) + degreeWidth
      const x = Math.round((SIZE - width) / 2)
      const after = drawText(frame.data, digits, x, y, WHITE, options)
      drawText(frame.data, '°', after, y, LIME, options)
    },
    {
      highLow: (y) => drawHighLow(frame, report, y, WHITE, GREY),
      city: (y, text, options) => frame.text(text, y, LIME, options)
    }
  )
  return frame.data
}

function renderPhosphor(context: StyleContext, index: number): Uint8ClampedArray {
  const { report } = context
  const scene = context.scenes[index]
  const frame = new Frame()
  frame.composite(scene.backdrop, 0, 0)
  layoutStack(
    context,
    (dx, dy) => frame.composite(scene.art, dx, dy),
    (y, options) => frame.text(context.temperature, y, WHITE, options),
    {
      highLow: (y) => drawHighLow(frame, report, y, [200, 200, 200], [140, 140, 140]),
      city: (y, text, options) => frame.text(text, y, [170, 170, 170], options)
    }
  )

  // Map everything to the lime ramp, then add scanlines and a soft bloom on lit pixels.
  const glow = 0.06 + scene.flash * 0.2
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const level = Math.min(1, luminance(frame.get(x, y)) + glow * (y % 2 === 0 ? 1 : 0.5))
      const scan = y % 2 === 0 ? 1 : 0.72
      frame.set(x, y, scale(limeRamp(level), scan))
    }
  }
  return frame.data
}

function renderDots(context: StyleContext, index: number): Uint8ClampedArray {
  const { report, options } = context
  const grid = 32
  const logical = new Frame(grid)
  const mini = context.mini
  const scene = context.scenes[index]

  const tempOptions: TextOptions = { size: 'large', scale: 1 }
  const city = cityText(context.city, grid, false)
  const miniHeight = mini.bounds.bottom - mini.bounds.top + 1

  // Twinkling stars become single sparks on the grid.
  logical.composite(halve(scene.backdrop), 0, 0, (_color, alpha) => [LIME_MID, alpha])

  stack(
    [
      {
        height: miniHeight,
        gap: 0,
        draw: (y) => {
          const { dx, dy } = placement(mini.bounds, y, grid)
          logical.composite(mini.layers[index], dx, dy, (color, alpha, accent) => [
            accent >= 0.5 ? LIME_HOT : mix(LIME_MID, LIME, luminance(color)),
            alpha > 0.35 ? 1 : 0
          ])
        }
      },
      { height: 7, gap: 2, draw: (y) => logical.text(context.temperature, y, LIME_HOT, tempOptions) },
      {
        height: options.showHighLow && !options.showCity ? 5 : 0,
        gap: 2,
        draw: (y) => {
          const text = `${Math.round(report.low)}-${Math.round(report.high)}`
          logical.text(text, y, LIME_MID)
        }
      },
      {
        height: options.showCity && city.text ? 5 : 0,
        gap: 2,
        draw: (y) => logical.text(city.text, y, LIME, city.options)
      }
    ],
    grid
  )

  // Every logical pixel becomes one LED with a dark gap around it; unlit LEDs glow faintly.
  const frame = new Frame()
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      const lit = logical.get(x, y)
      const on = lit[0] + lit[1] + lit[2] > 30
      frame.set(x * 2 + 1, y * 2 + 1, on ? lit : [9, 15, 3])
    }
  }
  if (scene.flash > 0) frame.fill((x, y) => (x % 2 === 1 && y % 2 === 1 ? frame.get(x, y) : scale(LIME_DIM, scene.flash * 0.6)))
  return frame.data
}

function renderGauge(context: StyleContext, index: number): Uint8ClampedArray {
  const { report, options } = context
  const t = index / FRAME_COUNT
  const frame = new Frame()
  const center = (SIZE - 1) / 2
  const radius = 29
  const ticks = 45
  const start = Math.PI * 0.75
  const sweep = Math.PI * 1.5

  // The dial spans just beyond today's low and high; the lit arc ends at the current temperature.
  const low = Math.min(report.low, report.temperature) - 2
  const high = Math.max(report.high, report.temperature) + 2
  const fill = Math.min(1, Math.max(0, (report.temperature - low) / Math.max(1, high - low)))
  const head = Math.round(fill * (ticks - 1))
  const pulse = 0.5 + 0.5 * Math.sin(TAU * t)

  for (let tick = 0; tick < ticks; tick += 1) {
    const angle = start + (sweep * tick) / (ticks - 1)
    const x = Math.round(center + Math.cos(angle) * radius)
    const y = Math.round(center + Math.sin(angle) * radius)
    let tone: Rgb = [30, 44, 11]
    if (tick < head) {
      // A brightness wave runs along the lit arc toward the current temperature.
      const wave = 0.5 + 0.5 * Math.sin(TAU * (t * 2 - tick / 12))
      tone = mix(LIME_MID, LIME, 0.3 + 0.7 * wave)
    } else if (tick === head) {
      tone = mix(LIME, [255, 255, 255], pulse * 0.6)
    }
    frame.set(x, y, tone)
    if (tick <= head) {
      frame.set(Math.round(center + Math.cos(angle) * (radius - 1)), Math.round(center + Math.sin(angle) * (radius - 1)), scale(tone, 0.55))
    }
    if (tick === head) {
      frame.blend(x + 1, y, LIME, 0.4 * pulse)
      frame.blend(x - 1, y, LIME, 0.4 * pulse)
      frame.blend(x, y + 1, LIME, 0.4 * pulse)
      frame.blend(x, y - 1, LIME, 0.4 * pulse)
    }
  }

  const mini = context.mini
  const miniHeight = mini.bounds.bottom - mini.bounds.top + 1
  const tempOptions: TextOptions = { size: 'large', scale: 2 }
  const fitsLarge = measureText(context.temperature, tempOptions) <= 40
  const temperature = fitsLarge ? tempOptions : { size: 'large' as const, scale: 1 }

  stack([
    {
      height: miniHeight,
      gap: 0,
      draw: (y) => {
        const { dx, dy } = placement(mini.bounds, y)
        frame.composite(mini.layers[index], dx, dy, (color, alpha, accent) => [
          accent >= 0.5 ? LIME : mix(LIME_DIM, WHITE, luminance(color) * 0.8),
          alpha
        ])
      }
    },
    { height: 7 * (temperature.scale ?? 1), gap: 3, draw: (y) => frame.text(context.temperature, y, WHITE, temperature) },
    {
      height: options.showHighLow ? 5 : 0,
      gap: 3,
      draw: (y) => drawHighLow(frame, report, y, LIME, LIME_MID, 3)
    }
  ])

  if (options.showCity) {
    // The city sits below the dial's opening, where the full width is free.
    let text = normalizeForFont(report.location.name)
    while (text.length > 0 && measureText(text) > SIZE - 4) text = text.slice(0, -1)
    frame.text(text.trimEnd(), SIZE - 7, GREY)
  }
  return frame.data
}

// ── Scenes ────────────────────────────────────────────────────────────────

function drawScene(layer: Layer, backdrop: Layer, condition: WeatherCondition, isDay: boolean, t: number): void {
  const bob = Math.sin(TAU * t)

  switch (condition) {
    case 'clear':
      if (isDay) drawSun(layer, 32, 17, 8, t)
      else {
        drawStars(backdrop, t)
        drawMoon(layer, 32, 17, 9)
      }
      return
    case 'mostly-clear':
      if (isDay) drawSun(layer, 35, 15, 7, t)
      else {
        drawStars(backdrop, t)
        drawMoon(layer, 35, 14, 8)
      }
      drawCloud(layer, 22 + Math.round(bob * 1.5), 25, 0.6, CLOUD_LIGHT)
      return
    case 'partly-cloudy':
      if (isDay) drawSun(layer, 39, 12, 6, t)
      else {
        drawStars(backdrop, t)
        drawMoon(layer, 39, 11, 7)
      }
      drawCloud(layer, 28 + Math.round(bob * 1.5), 21, 0.95, CLOUD_LIGHT)
      return
    case 'cloudy':
      drawCloud(layer, 40 - Math.round(bob * 1.5), 11, 0.72, CLOUD_GREY)
      drawCloud(layer, 27 + Math.round(bob * 1.5), 20, 1, CLOUD_LIGHT)
      return
    case 'fog':
      if (isDay) layer.disc(32, 14, 7, [150, 132, 70], 1)
      drawFog(layer, t)
      return
    case 'drizzle':
      drawRain(layer, t, { count: 7, cycles: 1, length: 1, color: [150, 200, 245] })
      drawCloud(layer, 32 + Math.round(bob), 11, 1, CLOUD_GREY)
      return
    case 'rain':
      drawRain(layer, t, { count: 11, cycles: 2, length: 2, color: [80, 165, 255] })
      drawCloud(layer, 32 + Math.round(bob), 11, 1, CLOUD_GREY)
      return
    case 'heavy-rain':
      drawRain(layer, t, { count: 16, cycles: 3, length: 3, color: [70, 140, 255] })
      drawCloud(layer, 32 + Math.round(bob), 11, 1.05, CLOUD_DARK)
      return
    case 'snow':
      drawSnow(layer, t)
      drawCloud(layer, 32 + Math.round(bob), 11, 1, CLOUD_LIGHT)
      return
    case 'thunder': {
      drawRain(layer, t, { count: 9, cycles: 2, length: 2, color: [80, 140, 230] })
      const flash = lightningIntensity(t)
      drawCloud(layer, 32 + Math.round(bob), 11, 1.05, flash > 0 ? CLOUD_LIT : CLOUD_DARK)
      if (flash > 0) drawBolt(layer, flash)
      return
    }
  }
}

function drawSun(layer: Layer, cx: number, cy: number, radius: number, t: number): void {
  // Rays repeat every 45°, so rotating by exactly 45° over the loop is seamless.
  const rotation = t * (Math.PI / 4)
  for (let ray = 0; ray < 8; ray += 1) {
    const angle = rotation + (ray * Math.PI) / 4
    const pulse = 0.5 + 0.5 * Math.sin(TAU * 2 * t + ray * (Math.PI / 2))
    const start = radius + 3
    const end = start + 2 + pulse * 1.6
    for (let step = start; step <= end; step += 0.5) {
      layer.glow(
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
        layer.paint(x, y, mix(mix([255, 222, 70], [255, 150, 30], edge * edge), [255, 250, 200], highlight * 0.6))
      } else if (distance <= radius + 1.8) {
        layer.paint(x, y, [255, 150, 30], 0.22)
      }
    }
  }
}

function drawMoon(layer: Layer, cx: number, cy: number, radius: number): void {
  for (let y = cy - radius - 1; y <= cy + radius + 1; y += 1) {
    for (let x = cx - radius - 1; x <= cx + radius + 1; x += 1) {
      const inside = Math.hypot(x - cx, y - cy) <= radius + 0.3
      const shadow = Math.hypot(x - (cx + radius * 0.55), y - (cy - radius * 0.35)) <= radius * 0.85
      if (!inside || shadow) continue
      const shade = Math.min(1, Math.hypot(x - (cx - radius * 0.4), y - cy) / radius)
      layer.paint(x, y, mix([250, 244, 205], [190, 180, 140], shade))
    }
  }
  layer.paint(cx - Math.round(radius * 0.45), cy + Math.round(radius * 0.3), [150, 142, 110], 0.8)
  layer.paint(cx - Math.round(radius * 0.6), cy - Math.round(radius * 0.2), [170, 160, 125], 0.6)
}

// Mirrored pairs keep the starfield balanced around the centre line.
const STARS: [number, number, number][] = [
  [6, 5, 0], [57, 5, 0.5], [14, 12, 0.3], [49, 12, 0.8], [3, 20, 0.65], [60, 20, 0.15],
  [21, 3, 0.9], [42, 3, 0.4], [9, 28, 0.25], [54, 28, 0.7]
]

function drawStars(layer: Layer, t: number): void {
  for (const [x, y, phase] of STARS) {
    const twinkle = 0.5 + 0.5 * Math.sin(TAU * (t + phase))
    const tone: Rgb = [210, 220, 255]
    layer.glow(x, y, tone, 0.25 + twinkle * 0.75)
    if (twinkle > 0.82) {
      const arm = (twinkle - 0.82) * 3
      layer.glow(x - 1, y, tone, arm)
      layer.glow(x + 1, y, tone, arm)
      layer.glow(x, y - 1, tone, arm)
      layer.glow(x, y + 1, tone, arm)
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

function drawCloud(layer: Layer, cx: number, cy: number, scale: number, palette: CloudPalette): void {
  const top = Math.floor(cy - 9 * scale)
  const bottom = Math.ceil(cy + 7 * scale)
  for (let y = top; y <= bottom; y += 1) {
    for (let x = Math.floor(cx - 14 * scale); x <= Math.ceil(cx + 16 * scale); x += 1) {
      if (!insideCloud(x, y, cx, cy, scale)) continue
      const shade = Math.min(1, Math.max(0, (y - top) / (bottom - top)))
      let tone = mix(palette.top, palette.bottom, shade * shade)
      if (!insideCloud(x, y - 1, cx, cy, scale)) tone = palette.rim
      else if (!insideCloud(x, y + 1, cx, cy, scale)) tone = mix(tone, [0, 0, 0], 0.25)
      layer.paint(x, y, tone)
    }
  }
}

interface RainStyle {
  count: number
  cycles: number
  length: number
  color: Rgb
}

function drawRain(layer: Layer, t: number, style: RainStyle): void {
  const top = 17
  const fall = 12
  for (let drop = 0; drop < style.count; drop += 1) {
    const column = 21 + Math.round((drop / Math.max(1, style.count - 1)) * 24)
    const phase = (drop * 0.618) % 1
    const progress = (phase + t * style.cycles) % 1
    const y = Math.round(top + progress * fall)
    const x = column - Math.round(progress * 3)
    for (let tail = 0; tail < style.length; tail += 1) {
      layer.glow(x + (tail > 1 ? 1 : 0), y - tail, style.color, 1 - tail * 0.3)
    }
  }
}

function drawSnow(layer: Layer, t: number): void {
  const flakes = 12
  for (let flake = 0; flake < flakes; flake += 1) {
    const phase = (flake * 0.618) % 1
    const progress = (phase + t) % 1
    const sway = Math.round(1.5 * Math.sin(TAU * (t + flake * 0.37)))
    const x = 20 + Math.round((flake / (flakes - 1)) * 24) + sway
    const y = Math.round(18 + progress * 12)
    const tone: Rgb = [235, 242, 255]
    layer.glow(x, y, tone, 1)
    if (flake % 3 === 0) {
      layer.glow(x - 1, y, tone, 0.45)
      layer.glow(x + 1, y, tone, 0.45)
      layer.glow(x, y - 1, tone, 0.45)
      layer.glow(x, y + 1, tone, 0.45)
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

function drawFog(layer: Layer, t: number): void {
  const period = 32
  for (const row of FOG_ROWS) {
    const shift = Math.round(t * period) * row.direction
    for (let x = 4; x < SIZE - 4; x += 1) {
      const local = (((x - shift) % period) + period) % period
      const lit = row.dashes.some(([start, length]) => local >= start && local < start + length)
      if (lit) {
        layer.glow(x, row.y, row.tone)
        layer.glow(x, row.y + 1, row.tone, 0.35)
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

function drawBolt(layer: Layer, intensity: number): void {
  const points: [number, number][] = [[35, 17], [31, 23], [34, 23], [30, 30]]
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x0, y0] = points[index]
    const [x1, y1] = points[index + 1]
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
    for (let step = 0; step <= steps; step += 1) {
      const x = Math.round(x0 + ((x1 - x0) * step) / steps)
      const y = Math.round(y0 + ((y1 - y0) * step) / steps)
      layer.glow(x, y, [255, 246, 150], intensity)
      layer.glow(x + 1, y, [255, 210, 70], intensity * 0.6)
    }
  }
}

// ── Colour helpers ────────────────────────────────────────────────────────

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

function limeRamp(level: number): Rgb {
  if (level < 0.5) return mix([0, 0, 0], [70, 110, 22], level * 2)
  return mix([70, 110, 22], [225, 255, 150], (level - 0.5) * 2)
}

function luminance([r, g, b]: Rgb): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function scale([r, g, b]: Rgb, amount: number): Rgb {
  return [Math.round(r * amount), Math.round(g * amount), Math.round(b * amount)]
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = Math.min(1, Math.max(0, amount))
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ]
}
