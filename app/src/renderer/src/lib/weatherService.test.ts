import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WeatherService } from './weatherService'

const FORECAST = {
  current: {
    time: '2026-10-22T03:30',
    temperature_2m: 26,
    apparent_temperature: 30,
    relative_humidity_2m: 80,
    weather_code: 0,
    is_day: 0,
    wind_speed_10m: 4
  },
  daily: { temperature_2m_max: [33], temperature_2m_min: [25] }
}

const KOLKATA = { name: 'Kolkata', latitude: 22.56, longitude: 88.36 }

describe('WeatherService schedule', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    const store = new Map<string, string>()
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value)
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(FORECAST))))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('sends right away when enabled, then again after each interval', async () => {
    const send = vi.fn(async () => undefined)
    const service = new WeatherService({
      ensureConnected: async () => true,
      send,
      targetName: () => 'IDM-TEST'
    })
    service.start()
    service.update({ location: KOLKATA, intervalMinutes: 5, autoUpdate: true })

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(service.status.message).toBe('26° Clear sent to IDM-TEST.')

    await vi.advanceTimersByTimeAsync(4 * 60_000)
    expect(send).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000 + 15_000)
    expect(send).toHaveBeenCalledTimes(2)
    service.stop()
  })

  it('retries soon when no panel can be reached', async () => {
    let reachable = false
    const send = vi.fn(async () => undefined)
    const service = new WeatherService({
      ensureConnected: async () => reachable,
      send,
      targetName: () => 'IDM-TEST'
    })
    service.start()
    service.update({ location: KOLKATA, intervalMinutes: 30, autoUpdate: true })

    await vi.waitFor(() => expect(service.status.phase).toBe('error'))
    expect(send).not.toHaveBeenCalled()

    reachable = true
    await vi.advanceTimersByTimeAsync(2 * 60_000 + 15_000)
    expect(send).toHaveBeenCalledTimes(1)
    service.stop()
  })
})
