import { describe, expect, it } from 'vitest'
import { measureText, normalizeForFont } from './pixelFont'
import { conditionFromCode, type WeatherReport } from './weather'
import { FRAME_COUNT, FRAME_DELAY_MS, renderWeatherArt } from './weatherArt'

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
  })
})

describe('renderWeatherArt', () => {
  it('renders a looping 64×64 GIF within the panel limits', () => {
    const art = renderWeatherArt(report(), { showHighLow: true, showCity: true })
    expect(art.preview.frames).toHaveLength(FRAME_COUNT)
    expect(FRAME_COUNT * FRAME_DELAY_MS).toBeLessThanOrEqual(2000)
    for (const frame of art.preview.frames) expect(frame.data).toHaveLength(64 * 64 * 4)
    expect(Array.from(art.gifBytes.slice(0, 6), (byte) => String.fromCharCode(byte)).join('')).toBe('GIF89a')
    expect(art.preview.detail).toBe('26°C · Rain')
  })

  it('animates every condition', () => {
    const conditions = ['clear', 'partly-cloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'snow', 'thunder'] as const
    for (const condition of conditions) {
      const frames = renderWeatherArt(report({ condition }), { showHighLow: false, showCity: false }).preview.frames
      const differs = frames.some((frame) => frame.data.some((value, index) => value !== frames[0].data[index]))
      expect(differs, condition).toBe(true)
    }
  })
})
