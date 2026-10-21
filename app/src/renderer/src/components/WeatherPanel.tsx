import { useEffect, useRef, useState, type JSX } from 'react'
import type { BackgroundState } from '../../../shared/types'
import { loadLastDevice } from '../lib/deviceMemory'
import {
  CONDITION_LABELS,
  describeLocation,
  searchLocations,
  type TemperatureUnit,
  type WeatherLocation
} from '../lib/weather'
import {
  INTERVAL_OPTIONS,
  type WeatherService,
  type WeatherSettings,
  type WeatherStatus
} from '../lib/weatherService'
import { Icon } from './Icons'
import { Group, Segmented, ToggleRow, Tool } from './ui'

const BACKGROUND_KEY = 'odm.background.v1'

const UNIT_OPTIONS: { value: TemperatureUnit; label: string }[] = [
  { value: 'celsius', label: '°C' },
  { value: 'fahrenheit', label: '°F' }
]

const INTERVAL_CHOICES = INTERVAL_OPTIONS.map((minutes) => ({
  value: minutes as number,
  label: minutes === 60 ? '1 hr' : `${minutes} min`
}))

const CLOCK = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

export function WeatherPanel({
  service,
  busy,
  connected,
  active
}: {
  service: WeatherService
  busy: boolean
  connected: boolean
  active: boolean
}): JSX.Element {
  const [settings, setSettings] = useState<WeatherSettings>(service.settings)
  const [status, setStatus] = useState<WeatherStatus>(service.status)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<WeatherLocation[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [background, setBackground] = useState<BackgroundState | null>(null)
  const previewed = useRef(false)

  useEffect(() => {
    const offSettings = service.on('settings', setSettings)
    const offStatus = service.on('status', setStatus)
    return () => {
      offSettings()
      offStatus()
    }
  }, [service])

  // Draw the saved city the first time the tab is opened.
  useEffect(() => {
    if (!active || previewed.current || !settings.location || status.report) return
    previewed.current = true
    void service.preview()
  }, [active, service, settings.location, status.report])

  // Background mode lives in the main process; restore the saved choice on startup.
  useEffect(() => {
    const desktop = window.desktop
    if (!desktop) return
    const keepInTray = loadKeepInTray()
    void desktop.setBackgroundOptions({ keepInTray }).then(setBackground)
  }, [])

  useEffect(() => {
    const name = query.trim()
    if (name.length < 2) {
      setResults([])
      setSearching(false)
      setSearchError(null)
      return
    }
    const abort = new AbortController()
    setSearching(true)
    const timer = window.setTimeout(() => {
      searchLocations(name, abort.signal)
        .then((found) => {
          setResults(found)
          setSearchError(found.length === 0 ? `No places named “${name}”.` : null)
        })
        .catch((reason) => {
          if (!abort.signal.aborted) setSearchError(reason instanceof Error ? reason.message : String(reason))
        })
        .finally(() => {
          if (!abort.signal.aborted) setSearching(false)
        })
    }, 350)
    return () => {
      abort.abort()
      window.clearTimeout(timer)
    }
  }, [query])

  function chooseLocation(location: WeatherLocation): void {
    setQuery('')
    setResults([])
    service.update({ location })
    previewed.current = true
    if (!settings.autoUpdate) void service.preview()
  }

  function changeDisplay(patch: Partial<WeatherSettings>): void {
    service.update(patch)
    if (!settings.autoUpdate && settings.location) void service.preview()
  }

  async function updateBackground(patch: { keepInTray?: boolean; launchAtLogin?: boolean }): Promise<void> {
    const desktop = window.desktop
    if (!desktop) return
    if (patch.keepInTray !== undefined) saveKeepInTray(patch.keepInTray)
    setBackground(await desktop.setBackgroundOptions(patch))
  }

  const report = status.report
  const working = status.phase === 'fetching' || status.phase === 'connecting' || status.phase === 'sending'
  const lastDevice = loadLastDevice()
  const tone = status.phase === 'error' ? 'error' : working ? 'busy' : report ? 'ready' : 'idle'
  const interval = settings.intervalMinutes === 60 ? 'hour' : `${settings.intervalMinutes} min`
  const statusLabel =
    status.phase === 'error'
      ? 'Needs attention'
      : status.phase === 'sending'
        ? 'Sending'
        : status.phase === 'connecting'
          ? 'Connecting'
          : status.phase === 'fetching'
            ? 'Updating'
            : settings.autoUpdate && settings.location
              ? `Auto · every ${interval}`
              : report
                ? 'Ready to send'
                : 'No city'

  return (
    <Tool
      title="Weather"
      description="Live conditions from Open-Meteo, drawn as an animated pixel scene that refreshes on its own."
      status={{ tone, label: statusLabel }}
      side={
        <>
          <Group label="Display">
            <Segmented
              value={settings.unit}
              options={UNIT_OPTIONS}
              onChange={(unit) => changeDisplay({ unit })}
              label="Temperature unit"
            />
            <div className="toggle-stack">
              <ToggleRow
                label="High and low"
                detail="Today’s range under the temperature"
                checked={settings.showHighLow}
                onChange={(showHighLow) => changeDisplay({ showHighLow })}
              />
              <ToggleRow
                label="City name"
                detail="Along the bottom row"
                checked={settings.showCity}
                onChange={(showCity) => changeDisplay({ showCity })}
              />
            </div>
          </Group>
          <Group label="Automatic updates">
            <div className="toggle-stack">
              <ToggleRow
                label="Update the panel"
                detail="Fetch fresh weather and re-send it on a schedule"
                checked={settings.autoUpdate}
                disabled={!settings.location}
                onChange={(autoUpdate) => service.update({ autoUpdate })}
              />
            </div>
            <Segmented
              value={settings.intervalMinutes}
              options={INTERVAL_CHOICES}
              onChange={(intervalMinutes) => service.update({ intervalMinutes })}
              label="Update interval"
              columns={5}
            />
            <div className="toggle-stack">
              <ToggleRow
                label="Reconnect automatically"
                detail={
                  lastDevice
                    ? `Find ${lastDevice.deviceName} again if it drops or the app restarts`
                    : 'Connect a panel once so it can be found again'
                }
                checked={settings.autoReconnect}
                onChange={(autoReconnect) => service.update({ autoReconnect })}
              />
            </div>
          </Group>
          {window.desktop && (
            <Group label="Background">
              <div className="toggle-stack">
                <ToggleRow
                  label="Keep running in the tray"
                  detail="Closing the window leaves updates running"
                  checked={background?.keepInTray ?? loadKeepInTray()}
                  onChange={(keepInTray) => void updateBackground({ keepInTray })}
                />
                <ToggleRow
                  label="Start when I sign in"
                  detail={
                    background?.launchAtLoginSupported === false
                      ? 'Available in the installed app'
                      : 'Opens hidden in the tray and resumes updates'
                  }
                  checked={background?.launchAtLogin ?? false}
                  disabled={!background?.launchAtLoginSupported}
                  onChange={(launchAtLogin) => void updateBackground({ launchAtLogin })}
                />
              </div>
            </Group>
          )}
        </>
      }
      summary={
        <WeatherSummary status={status} autoUpdate={settings.autoUpdate} hasLocation={Boolean(settings.location)} />
      }
      actions={
        <>
          <button
            type="button"
            className="btn btn-secondary btn-lg btn-icon"
            aria-label="Refresh preview"
            title="Refresh preview"
            disabled={!settings.location || working}
            onClick={() => void service.preview()}
          >
            <Icon name="refresh" size={16} />
          </button>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={!settings.location || working || busy || (!connected && !settings.autoReconnect)}
            onClick={() => void service.sendNow()}
          >
            {status.phase === 'sending' ? 'Sending…' : 'Send to panel'}
            <Icon name="upload" size={16} />
          </button>
        </>
      }
    >
      <Group label="Location">
        <div className="weather-search">
          <Icon name="search" size={16} />
          <input
            type="text"
            aria-label="Search for a city"
            placeholder={settings.location ? 'Change city…' : 'Search for a city…'}
            value={query}
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && results[0]) chooseLocation(results[0])
              if (event.key === 'Escape') setQuery('')
            }}
          />
          {searching && <span className="spinner" />}
        </div>

        {results.length > 0 && (
          <ul className="weather-results" aria-label="Matching places">
            {results.map((location) => (
              <li key={`${location.latitude},${location.longitude}`}>
                <button type="button" onClick={() => chooseLocation(location)}>
                  <Icon name="pin" size={15} />
                  <span>
                    <strong>{location.name}</strong>
                    <span>{[location.region, location.country].filter(Boolean).join(', ')}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {searchError && query.trim().length >= 2 && !searching && <p className="field-hint">{searchError}</p>}
      </Group>

      {settings.location ? (
        <div className="weather-card">
          <div className="weather-card-head">
            <Icon name="pin" size={14} />
            <span title={describeLocation(settings.location)}>{describeLocation(settings.location)}</span>
          </div>
          {report ? (
            <div className="weather-stats">
              <span className="weather-temp">
                {Math.round(report.temperature)}°
                <small>{CONDITION_LABELS[report.condition]}</small>
              </span>
              <dl>
                <div>
                  <dt>Feels like</dt>
                  <dd>{Math.round(report.feelsLike)}°</dd>
                </div>
                <div>
                  <dt>High / low</dt>
                  <dd>
                    {Math.round(report.high)}° / {Math.round(report.low)}°
                  </dd>
                </div>
                <div>
                  <dt>Humidity</dt>
                  <dd>{Math.round(report.humidity)}%</dd>
                </div>
                <div>
                  <dt>Wind</dt>
                  <dd>{Math.round(report.windSpeed)} km/h</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="field-hint">{working ? 'Loading the current weather…' : 'Refresh to load the current weather.'}</p>
          )}
        </div>
      ) : (
        <p className="weather-empty">Type a city name and pick it from the list. No account or API key needed.</p>
      )}

      {status.phase === 'error' && status.message && <p className="inline-error">{status.message}</p>}
    </Tool>
  )
}

function WeatherSummary({
  status,
  autoUpdate,
  hasLocation
}: {
  status: WeatherStatus
  autoUpdate: boolean
  hasLocation: boolean
}): JSX.Element {
  if (!hasLocation) return <span>Choose a city to continue</span>
  const times: string[] = []
  if (status.lastSent) times.push(`Last sent ${CLOCK.format(status.lastSent)}`)
  if (autoUpdate && status.nextUpdate) times.push(`next ${CLOCK.format(Math.max(status.nextUpdate, Date.now()))}`)
  const message = status.phase === 'error' ? 'Update failed' : status.message
  return (
    <>
      {message && <strong>{message}</strong>}
      <span>{times.length > 0 ? times.join(' · ') : autoUpdate ? 'First update starting…' : 'Automatic updates are off'}</span>
    </>
  )
}

function loadKeepInTray(): boolean {
  try {
    const raw = localStorage.getItem(BACKGROUND_KEY)
    return raw ? (JSON.parse(raw) as { keepInTray?: boolean }).keepInTray !== false : true
  } catch {
    return true
  }
}

function saveKeepInTray(keepInTray: boolean): void {
  try {
    localStorage.setItem(BACKGROUND_KEY, JSON.stringify({ keepInTray }))
  } catch {
    // The main process still has the value for this session.
  }
}
