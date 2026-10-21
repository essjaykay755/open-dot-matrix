import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from 'react'
import type { BluetoothDeviceInfo } from '../../shared/types'
import { ActivityLog, type LogItem } from './components/ActivityLog'
import { ConnectionCard } from './components/ConnectionCard'
import { DevicePicker } from './components/DevicePicker'
import { DesktopTitleBar } from './components/DesktopTitleBar'
import { GifPanel } from './components/GifPanel'
import { Icon } from './components/Icons'
import { ImagePanel } from './components/ImagePanel'
import { MatrixPreview } from './components/MatrixPreview'
import { ModesPanel } from './components/ModesPanel'
import { QuickControls } from './components/QuickControls'
import { TextPanel } from './components/TextPanel'
import { WeatherPanel } from './components/WeatherPanel'
import { saveLastDevice } from './lib/deviceMemory'
import { idlePreview, type PreviewContent } from './lib/preview'
import {
  MatrixClient,
  type MatrixState,
  type ProgressEvent
} from './lib/matrixClient'
import type { LogLevel } from './lib/transport'
import { useWeatherService } from './lib/useWeatherService'

type Tab = 'image' | 'gif' | 'text' | 'weather' | 'modes'

const TABS: { id: Tab; label: string }[] = [
  { id: 'image', label: 'Image' },
  { id: 'gif', label: 'GIF' },
  { id: 'text', label: 'Text' },
  { id: 'weather', label: 'Weather' },
  { id: 'modes', label: 'Modes' }
]

const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
})

export default function App(): JSX.Element {
  const clientRef = useRef<MatrixClient | null>(null)
  if (!clientRef.current) clientRef.current = new MatrixClient()
  const client = clientRef.current

  const [state, setState] = useState<MatrixState>(client.currentState)
  const [tab, setTab] = useState<Tab>('image')
  const [previews, setPreviews] = useState<Record<Tab, PreviewContent>>(() => ({
    image: idlePreview(),
    gif: idlePreview(),
    text: idlePreview(),
    weather: idlePreview(),
    modes: idlePreview()
  }))
  const [logs, setLogs] = useState<LogItem[]>([])
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerDevices, setPickerDevices] = useState<BluetoothDeviceInfo[]>([])
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [indicator, setIndicator] = useState<CSSProperties>({ opacity: 0 })
  const logId = useRef(0)
  const studioScrollRef = useRef<HTMLDivElement>(null)
  const tabbarRef = useRef<HTMLElement>(null)

  useEffect(() => {
    studioScrollRef.current?.scrollTo(0, 0)
  }, [tab])

  useLayoutEffect(() => {
    const bar = tabbarRef.current
    if (!bar) return
    const measure = (): void => {
      const active = bar.querySelector<HTMLElement>(`[data-tab="${tab}"]`)
      if (!active) return
      setIndicator({ width: active.offsetWidth, transform: `translateX(${active.offsetLeft}px)` })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [tab])

  const appendLog = useCallback((level: LogLevel, message: string) => {
    logId.current += 1
    const entry: LogItem = {
      id: logId.current,
      time: TIME_FORMAT.format(new Date()),
      level,
      message
    }
    setLogs((current) => [...current.slice(-119), entry])
  }, [])

  useEffect(() => {
    const offLog = client.on('log', ({ level, message }) => appendLog(level, message))
    const offState = client.on('state', setState)
    const offProgress = client.on('progress', setProgress)
    const offDevices = window.desktop?.onBluetoothDevices((devices) => {
      setPickerDevices(devices)
    })

    void client.useDemo().catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })

    return () => {
      offLog()
      offState()
      offProgress()
      offDevices?.()
      void client.disconnect()
    }
  }, [appendLog, client])

  useEffect(() => {
    if (!error) return
    const timer = window.setTimeout(() => setError(null), 10000)
    return () => window.clearTimeout(timer)
  }, [error])

  const previewHandlers = useMemo(
    () => ({
      image: (content: PreviewContent) =>
        setPreviews((current) => ({ ...current, image: content })),
      gif: (content: PreviewContent) => setPreviews((current) => ({ ...current, gif: content })),
      text: (content: PreviewContent) => setPreviews((current) => ({ ...current, text: content })),
      weather: (content: PreviewContent) =>
        setPreviews((current) => ({ ...current, weather: content })),
      modes: (content: PreviewContent) =>
        setPreviews((current) => ({ ...current, modes: content }))
    }),
    []
  )

  const weather = useWeatherService(client, previewHandlers.weather)
  const chosenDeviceRef = useRef<BluetoothDeviceInfo | null>(null)

  const run = useCallback(
    async (task: () => Promise<unknown>): Promise<void> => {
      setError(null)
      try {
        await task()
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    },
    []
  )

  const connect = useCallback(async () => {
    if (!window.desktop) {
      setError('Bluetooth device selection is available in the Electron desktop window.')
      return
    }
    setError(null)
    setPickerDevices([])
    setSelectingId(null)
    setPickerOpen(true)
    chosenDeviceRef.current = null
    try {
      await client.connectBle()
      // Remembered so scheduled updates can reconnect to this panel without the picker.
      if (chosenDeviceRef.current) saveLastDevice(chosenDeviceRef.current)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      if (!/cancel|chooser|not found/i.test(message)) setError(message)
    } finally {
      setPickerOpen(false)
      setSelectingId(null)
    }
  }, [client])

  const cancelPicker = useCallback(() => {
    void window.desktop?.cancelBluetoothSelection()
    setPickerOpen(false)
    setSelectingId(null)
  }, [])

  const chooseDevice = useCallback(async (deviceId: string) => {
    setSelectingId(deviceId)
    const device = pickerDevices.find((entry) => entry.deviceId === deviceId)
    chosenDeviceRef.current = device ?? { deviceId, deviceName: 'iDotMatrix' }
    const accepted = await window.desktop?.selectBluetoothDevice(deviceId)
    if (!accepted) setSelectingId(null)
  }, [pickerDevices])

  const startDemo = useCallback(() => {
    void run(() => client.useDemo())
  }, [client, run])

  const disconnect = useCallback(() => {
    void run(() => client.disconnect())
  }, [client, run])

  const busy = progress !== null
  const connected = state.mode === 'ble' || state.mode === 'demo'
  const progressPercent =
    progress && progress.total > 0
      ? Math.round((Math.min(progress.done, progress.total) / progress.total) * 100)
      : 0

  return (
    <div className="app-shell">
      <DesktopTitleBar />

      <main className="workspace">
        <aside className="rail">
          <ConnectionCard
            state={state}
            busy={busy}
            onConnect={() => void connect()}
            onDemo={startDemo}
            onDisconnect={disconnect}
          />
          <MatrixPreview content={previews[tab]} live={connected} />
          <QuickControls
            disabled={!connected || busy}
            onBrightness={(value) => void run(() => client.setBrightness(value))}
            onPower={(on) => void run(() => client.setPower(on))}
            onFlip={(on) => void run(() => client.setFlipped(on))}
            onSyncTime={() => void run(() => client.syncTime())}
          />
        </aside>

        <section className="studio">
          <nav className="tabbar" role="tablist" aria-label="Studio tools" ref={tabbarRef}>
            <span className="tab-indicator" style={indicator} aria-hidden="true" />
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`tab-${item.id}`}
                data-tab={item.id}
                aria-controls={`panel-${item.id}`}
                aria-selected={tab === item.id}
                tabIndex={tab === item.id ? 0 : -1}
                className={`tab ${tab === item.id ? 'is-active' : ''}`}
                onClick={() => setTab(item.id)}
                onKeyDown={(event) => {
                  const index = TABS.findIndex((entry) => entry.id === item.id)
                  const next = event.key === 'ArrowRight'
                    ? (index + 1) % TABS.length
                    : event.key === 'ArrowLeft'
                      ? (index + TABS.length - 1) % TABS.length
                      : event.key === 'Home'
                        ? 0
                        : event.key === 'End' ? TABS.length - 1 : null
                  if (next === null) return
                  event.preventDefault()
                  setTab(TABS[next].id)
                  document.getElementById(`tab-${TABS[next].id}`)?.focus()
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="studio-scroll" ref={studioScrollRef}>
            <div className="tab-pane" id="panel-image" role="tabpanel" aria-labelledby="tab-image" hidden={tab !== 'image'}>
              <ImagePanel
                busy={busy}
                connected={connected}
                onPreview={previewHandlers.image}
                onSend={(rgb) => run(() => client.sendImage(rgb))}
              />
            </div>
            <div className="tab-pane" id="panel-gif" role="tabpanel" aria-labelledby="tab-gif" hidden={tab !== 'gif'}>
              <GifPanel
                busy={busy}
                connected={connected}
                onPreview={previewHandlers.gif}
                onSend={(bytes) => run(() => client.sendGif(bytes))}
              />
            </div>
            <div className="tab-pane" id="panel-text" role="tabpanel" aria-labelledby="tab-text" hidden={tab !== 'text'}>
              <TextPanel
                busy={busy}
                connected={connected}
                onPreview={previewHandlers.text}
                onSend={(packet) => run(() => client.sendText(packet))}
              />
            </div>
            <div className="tab-pane" id="panel-weather" role="tabpanel" aria-labelledby="tab-weather" hidden={tab !== 'weather'}>
              <WeatherPanel service={weather} busy={busy} connected={connected} active={tab === 'weather'} />
            </div>
            <div className="tab-pane" id="panel-modes" role="tabpanel" aria-labelledby="tab-modes" hidden={tab !== 'modes'}>
              <ModesPanel
                busy={busy}
                connected={connected}
                onPreview={previewHandlers.modes}
                onColor={(color) => run(() => client.showColor(color))}
                onClock={(options) => run(() => client.showClock(options))}
                onCountdown={(mode, minutes, seconds) =>
                  run(() => client.setCountdown(mode, minutes, seconds))
                }
                onChronograph={(mode) => run(() => client.setChronograph(mode))}
                onScoreboard={(a, b) => run(() => client.showScoreboard(a, b))}
                onScreenTimeout={(value) => run(() => client.setScreenTimeout(value))}
                onTimeIndicator={(enabled) => run(() => client.setTimeIndicator(enabled))}
              />
            </div>
          </div>

          <ActivityLog entries={logs} onClear={() => setLogs([])} />

          <div className="toasts">
            {progress && (
              <div
                className={`toast is-progress ${progress.total === 0 ? 'is-indeterminate' : ''}`}
                role="progressbar"
                aria-label={progress.label}
                aria-valuenow={progress.total > 0 ? progressPercent : undefined}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span className="spinner" />
                <span className="toast-message">{progress.label}</span>
                <span className="progress-track">
                  <span style={{ width: `${progressPercent}%` }} />
                </span>
                <span className="progress-count">
                  {progress.total > 0 ? `${progress.done}/${progress.total}` : '…'}
                </span>
              </div>
            )}
            {error && (
              <div className="toast is-error" role="alert">
                <Icon name="bolt" size={15} />
                <span className="toast-message">{error}</span>
                <button type="button" className="icon-button" aria-label="Dismiss error" onClick={() => setError(null)}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      <DevicePicker
        open={pickerOpen}
        devices={pickerDevices}
        selectingId={selectingId}
        onSelect={(deviceId) => void chooseDevice(deviceId)}
        onCancel={cancelPicker}
      />
    </div>
  )
}
