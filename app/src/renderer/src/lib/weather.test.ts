import { describe, expect, it } from 'vitest'
import { measureText, normalizeForFont } from './pixelFont'
import { conditionFromCode, type WeatherReport } from './weather'
import { FRAME_COUNT, FRAME_DELAY_MS, renderWeatherArt, WEATHER_STYLES } from './weatherArt'

function report(overrides: Partial<WeatherReport> = {}): WeatherReport {
  return {
    location: { name: 'Kolkata', latitude: 22.56, longitude: 88.36 },
    unit: 'celsius',
    temperature: 26.4,
    feelsLike: 30,
    high: 31,
    low: 24,
    humidity: 80,
    windSpeed: 5,
    code: 61,
    condition: 'rain',
    isDay: true,
    observedAt: '2026-10-21T23:30',
    fetchedAt: 0,
    ...overrides
  }
}

describe('conditionFromCode', () => {
  it('maps WMO codes to animations', () => {
    expect(conditionFromCode(0)).toBe('clear')
    expect(conditionFromCode(2)).toBe('partly-cloudy')
    expect(conditionFromCode(45)).toBe('fog')
    expect(conditionFromCode(53)).toBe('drizzle')
    expect(conditionFromCode(63)).toBe('rain')
    expect(conditionFromCode(65)).toBe('heavy-rain')
    expect(conditionFromCode(81)).toBe('rain')
    expect(conditionFromCode(75)).toBe('snow')
    expect(conditionFromCode(86)).toBe('snow')
    expect(conditionFromCode(99)).toBe('thunder')
  })
})

describe('pixel font', () => {
  it('strips accents and characters it cannot draw', () => {
    expect(normalizeForFont('São Paulo!')).toBe('SAO PAULO')
  })

  it('measures glyph widths with spacing', () => {
    expect(measureText('AB')).toBe(7)
    expect(measureText('23°', { size: 'large', scale: 2 })).toBe(32)
    expect(normalizeForFont('Kolkata', 'large')).toBe('KOLKATA')
  })
})

describe('renderWeatherArt', () => {
  it('renders a looping 64×64 GIF within the panel limits', () => {
    const art = renderWeatherArt(report(), { style: 'scene', showHighLow: true, showCity: true })
    expect(art.preview.frames).toHaveLength(FRAME_COUNT)
    expect(FRAME_COUNT * FRAME_DELAY_MS).toBeLessThanOrEqual(2000)
    for (const frame of art.preview.frames) expect(frame.data).toHaveLength(64 * 64 * 4)
    expect(Array.from(art.gifBytes.slice(0, 6), (byte) => String.fromCharCode(byte)).join('')).toBe('GIF89a')
    expect(art.preview.detail).toBe('26°C · Rain')
  })

  it('animates every condition', () => {
    const conditions = ['clear', 'partly-cloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'snow', 'thunder'] as const
    for (const condition of conditions) {
      for (const style of WEATHER_STYLES) {
        const options = { style: style.id, showHighLow: true, showCity: true }
        const frames = renderWeatherArt(report({ condition }), options).preview.frames
        const differs = frames.some((frame) => frame.data.some((value, index) => value !== frames[0].data[index]))
        expect(differs, `${style.id} ${condition}`).toBe(true)
      }
    }
  })

  it('centres the artwork and text on both axes', () => {
    for (const style of WEATHER_STYLES) {
      if (style.id === 'gauge' || style.id === 'dots') continue
      for (const condition of ['clear', 'rain', 'snow'] as const) {
        const frame = renderWeatherArt(report({ condition }), { style: style.id, showHighLow: true, showCity: true })
          .preview.frames[0].data
        const lit = litBounds(frame)
        const label = `${style.id} ${condition}`
        expect(Math.abs(lit.left - (63 - lit.right)), label).toBeLessThanOrEqual(2)
        expect(Math.abs(lit.top - (63 - lit.bottom)), label).toBeLessThanOrEqual(2)
        expect(lit.top, label).toBeGreaterThanOrEqual(0)
        expect(lit.bottom, label).toBeLessThanOrEqual(63)
      }
    }
  })
})

/** Bounds of clearly lit pixels, ignoring the dark sky gradient and faint stars. */
function litBounds(data: Uint8ClampedArray): { left: number; top: number; right: number; bottom: number } {
  const bounds = { left: 64, top: 64, right: -1, bottom: -1 }
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const offset = (y * 64 + x) * 4
      if (Math.max(data[offset], data[offset + 1], data[offset + 2]) < 120) continue
      bounds.left = Math.min(bounds.left, x)
      bounds.right = Math.max(bounds.right, x)
      bounds.top = Math.min(bounds.top, y)
      bounds.bottom = Math.max(bounds.bottom, y)
    }
  }
  return bounds
}
