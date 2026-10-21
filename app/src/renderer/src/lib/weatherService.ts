import type { PreviewContent } from './preview'
import { renderWeatherArt } from './weatherArt'
import {
  CONDITION_LABELS,
  fetchWeather,
  type TemperatureUnit,
  type WeatherLocation,
  type WeatherReport
} from './weather'

const STORAGE_KEY = 'odm.weather.v1'
const TICK_MS = 15_000
const RETRY_MS = 2 * 60_000

export const INTERVAL_OPTIONS = [5, 10, 15, 30, 60] as const

export interface WeatherSettings {
  location: WeatherLocation | null
  unit: TemperatureUnit
  intervalMinutes: number
  autoUpdate: boolean
  autoReconnect: boolean
  showHighLow: boolean
  showCity: boolean
}

export type WeatherPhase = 'idle' | 'fetching' | 'connecting' | 'sending' | 'waiting' | 'error'

export interface WeatherStatus {
  phase: WeatherPhase
  message: string
  report: WeatherReport | null
  lastSent: number | null
  nextUpdate: number | null
}

export interface WeatherDelivery {
  /** Makes sure a panel (or demo) is ready. Returns false when nothing could be reached. */
  ensureConnected: (autoReconnect: boolean) => Promise<boolean>
  send: (gifBytes: Uint8Array) => Promise<void>
  /** Short text describing where the GIF went, e.g. the panel name. */
  targetName: () => string
}

interface WeatherEventMap {
  settings: WeatherSettings
  status: WeatherStatus
  preview: PreviewContent
}

type Listener<T> = (payload: T) => void

const DEFAULT_SETTINGS: WeatherSettings = {
  location: null,
  unit: 'celsius',
  intervalMinutes: 15,
  autoUpdate: false,
  autoReconnect: true,
  showHighLow: true,
  showCity: true
}

/**
 * Fetches the weather, renders it as an animated GIF and pushes it to the panel on a schedule.
 * The schedule is checked on a short tick rather than one long timeout so it recovers promptly
 * after the PC sleeps.
 */
export class WeatherService {
  private settingsValue: WeatherSettings = loadSettings()
  private statusValue: WeatherStatus = {
    phase: 'idle',
    message: '',
    report: null,
    lastSent: null,
    nextUpdate: null
  }
  private listeners = new Map<keyof WeatherEventMap, Set<Listener<unknown>>>()
  private ticker = 0
  private running: Promise<void> | null = null
  private abort: AbortController | null = null

  constructor(private readonly delivery: WeatherDelivery) {}

  get settings(): WeatherSettings {
    return this.settingsValue
  }

  get status(): WeatherStatus {
    return this.statusValue
  }

  on<K extends keyof WeatherEventMap>(event: K, listener: Listener<WeatherEventMap[K]>): () => void {
    const set = this.listeners.get(event) ?? new Set<Listener<unknown>>()
    const wrapped = listener as Listener<unknown>
    set.add(wrapped)
    this.listeners.set(event, set)
    return () => set.delete(wrapped)
  }

  start(): void {
    if (this.ticker) return
    this.ticker = window.setInterval(() => this.checkSchedule(), TICK_MS)
    if (this.settingsValue.autoUpdate && this.settingsValue.location) {
      this.setStatus({ nextUpdate: Date.now() })
      this.checkSchedule()
    }
  }

  stop(): void {
    window.clearInterval(this.ticker)
    this.ticker = 0
    this.abort?.abort()
  }

  update(patch: Partial<WeatherSettings>): void {
    const previous = this.settingsValue
    const next = { ...previous, ...patch }
    this.settingsValue = next
    saveSettings(next)
    this.emit('settings', next)

    if (!next.autoUpdate || !next.location) {
      this.setStatus({ nextUpdate: null, phase: this.running ? this.statusValue.phase : 'idle' })
      return
    }

    const contentChanged =
      previous.location !== next.location ||
      previous.unit !== next.unit ||
      previous.showCity !== next.showCity ||
      previous.showHighLow !== next.showHighLow

    if (!previous.autoUpdate || contentChanged) {
      // Turning updates on, or changing what is shown, pushes right away.
      this.setStatus({ nextUpdate: Date.now() })
      this.checkSchedule()
    } else if (previous.intervalMinutes !== next.intervalMinutes) {
      const base = this.statusValue.lastSent ?? Date.now()
      this.setStatus({ nextUpdate: base + next.intervalMinutes * 60_000 })
      this.checkSchedule()
    }
  }

  /** Re-checks the schedule, e.g. after the PC wakes from sleep. */
  wake(): void {
    this.checkSchedule()
  }

  /** Fetches and renders without touching the panel. */
  async preview(): Promise<void> {
    await this.run(false)
  }

  /** Fetches, renders and sends now; the next scheduled update counts from here. */
  async sendNow(): Promise<void> {
    await this.run(true)
  }

  private checkSchedule(): void {
    const { autoUpdate, location } = this.settingsValue
    const due = this.statusValue.nextUpdate
    if (!autoUpdate || !location || due === null || this.running) return
    if (Date.now() >= due) void this.run(true)
  }

  private run(send: boolean): Promise<void> {
    if (this.running) return this.running
    this.running = this.execute(send).finally(() => {
      this.running = null
    })
    return this.running
  }

  private async execute(send: boolean): Promise<void> {
    const settings = this.settingsValue
    const location = settings.location
    if (!location) {
      this.setStatus({ phase: 'error', message: 'Choose a city first.' })
      return
    }

    this.abort?.abort()
    const abort = new AbortController()
    this.abort = abort

    try {
      this.setStatus({ phase: 'fetching', message: `Checking the weather in ${location.name}…` })
      const report = await fetchWeather(location, settings.unit, abort.signal)
      const art = renderWeatherArt(report, settings)
      this.emit('preview', art.preview)
      this.setStatus({ report })

      if (!send) {
        this.setStatus({ phase: this.settingsValue.autoUpdate ? 'waiting' : 'idle', message: 'Preview updated.' })
        return
      }

      this.setStatus({ phase: 'connecting', message: 'Checking the panel connection…' })
      const ready = await this.delivery.ensureConnected(settings.autoReconnect)
      if (!ready) throw new Error('No panel connected. Connect one, or turn on auto-reconnect.')

      this.setStatus({ phase: 'sending', message: 'Sending the weather animation…' })
      await this.delivery.send(art.gifBytes)

      const now = Date.now()
      this.setStatus({
        phase: this.settingsValue.autoUpdate ? 'waiting' : 'idle',
        message: `${Math.round(report.temperature)}° ${CONDITION_LABELS[report.condition]} sent to ${this.delivery.targetName()}.`,
        lastSent: now,
        nextUpdate: this.settingsValue.autoUpdate ? now + this.settingsValue.intervalMinutes * 60_000 : null
      })
    } catch (error) {
      if (abort.signal.aborted) return
      const message = error instanceof Error ? error.message : String(error)
      const retry = this.settingsValue.autoUpdate
        ? Date.now() + Math.min(RETRY_MS, this.settingsValue.intervalMinutes * 60_000)
        : null
      this.setStatus({ phase: 'error', message, nextUpdate: retry })
    }
  }

  private setStatus(patch: Partial<WeatherStatus>): void {
    this.statusValue = { ...this.statusValue, ...patch }
    this.emit('status', this.statusValue)
  }

  private emit<K extends keyof WeatherEventMap>(event: K, payload: WeatherEventMap[K]): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const listener of set) listener(payload)
  }
}

function loadSettings(): WeatherSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<WeatherSettings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(settings: WeatherSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Settings still apply for this session.
  }
}
