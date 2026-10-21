// Open-Meteo is free and needs no API key: https://open-meteo.com/

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const REQUEST_TIMEOUT_MS = 15000

export type TemperatureUnit = 'celsius' | 'fahrenheit'

export type WeatherCondition =
  | 'clear'
  | 'mostly-clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'heavy-rain'
  | 'snow'
  | 'thunder'

export interface WeatherLocation {
  name: string
  region?: string
  country?: string
  latitude: number
  longitude: number
}

export interface WeatherReport {
  location: WeatherLocation
  unit: TemperatureUnit
  temperature: number
  feelsLike: number
  high: number
  low: number
  humidity: number
  windSpeed: number
  code: number
  condition: WeatherCondition
  isDay: boolean
  observedAt: string
  fetchedAt: number
}

interface GeocodingResponse {
  results?: {
    name: string
    latitude: number
    longitude: number
    country?: string
    admin1?: string
  }[]
}

interface ForecastResponse {
  current?: {
    time: string
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    weather_code: number
    is_day: number
    wind_speed_10m: number
  }
  daily?: {
    temperature_2m_max: number[]
    temperature_2m_min: number[]
  }
  reason?: string
}

export async function searchLocations(query: string, signal?: AbortSignal): Promise<WeatherLocation[]> {
  const name = query.trim()
  if (name.length < 2) return []
  const url = `${GEOCODING_URL}?${new URLSearchParams({ name, count: '8', language: 'en', format: 'json' })}`
  const body = await getJson<GeocodingResponse>(url, signal)
  return (body.results ?? []).map((result) => ({
    name: result.name,
    region: result.admin1,
    country: result.country,
    latitude: result.latitude,
    longitude: result.longitude
  }))
}

export async function fetchWeather(
  location: WeatherLocation,
  unit: TemperatureUnit,
  signal?: AbortSignal
): Promise<WeatherReport> {
  const params = new URLSearchParams({
    latitude: location.latitude.toFixed(4),
    longitude: location.longitude.toFixed(4),
    current:
      'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min',
    temperature_unit: unit,
    timezone: 'auto',
    forecast_days: '1'
  })
  const body = await getJson<ForecastResponse>(`${FORECAST_URL}?${params}`, signal)
  const current = body.current
  if (!current) throw new Error(body.reason ?? 'Open-Meteo returned no current weather')

  return {
    location,
    unit,
    temperature: current.temperature_2m,
    feelsLike: current.apparent_temperature,
    high: body.daily?.temperature_2m_max[0] ?? current.temperature_2m,
    low: body.daily?.temperature_2m_min[0] ?? current.temperature_2m,
    humidity: current.relative_humidity_2m,
    windSpeed: current.wind_speed_10m,
    code: current.weather_code,
    condition: conditionFromCode(current.weather_code),
    isDay: current.is_day === 1,
    observedAt: current.time,
    fetchedAt: Date.now()
  }
}

/** Maps WMO weather interpretation codes to the animations we can draw. */
export function conditionFromCode(code: number): WeatherCondition {
  if (code === 0) return 'clear'
  if (code === 1) return 'mostly-clear'
  if (code === 2) return 'partly-cloudy'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code === 65 || code === 67 || code === 82) return 'heavy-rain'
  if ((code >= 61 && code <= 66) || code === 80 || code === 81) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'thunder'
  return 'cloudy'
}

export const CONDITION_LABELS: Record<WeatherCondition, string> = {
  clear: 'Clear',
  'mostly-clear': 'Mostly clear',
  'partly-cloudy': 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  'heavy-rain': 'Heavy rain',
  snow: 'Snow',
  thunder: 'Thunderstorm'
}

export function describeLocation(location: WeatherLocation): string {
  return [location.name, location.region, location.country]
    .filter((part, index, parts) => part && parts.indexOf(part) === index)
    .join(', ')
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  let response: Response
  try {
    response = await fetch(url, { signal: combined })
  } catch (error) {
    if (signal?.aborted) throw error
    if (timeout.aborted) throw new Error('Weather service timed out')
    throw new Error('Could not reach the weather service. Check the internet connection.')
  }
  if (!response.ok) throw new Error(`Weather service returned HTTP ${response.status}`)
  return (await response.json()) as T
}
