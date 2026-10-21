import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { BluetoothDeviceInfo } from '../../shared/types'
import { ActivityLog, type LogItem } from './components/ActivityLog'
import { ConnectionCard } from './components/ConnectionCard'
import { DevicePicker } from './components/DevicePicker'
import { GifPanel } from './components/GifPanel'
import { Icon, type IconName } from './components/Icons'
import { ImagePanel } from './components/ImagePanel'
import { MatrixPreview } from './components/MatrixPreview'
import { ModesPanel } from './components/ModesPanel'
import { QuickControls } from './components/QuickControls'
import { TextPanel } from './components/TextPanel'
import { idlePreview, type PreviewContent } from './lib/preview'
import {
  MatrixClient,
  type MatrixState,
  type ProgressEvent
} from './lib/matrixClient'
import type { LogLevel } from './lib/transport'

type Tab = 'image' | 'gif' | 'text' | 'modes'

const TABS: { id: Tab; index: string; label: string; icon: IconName }[] = [
  { id: 'image', index: '01', label: 'Image', icon: 'image' },
  { id: 'gif', index: '02', label: 'GIF', icon: 'gif' },
  { id: 'text', index: '03', label: 'Text', icon: 'text' },
  { id: 'modes', index: '04', label: 'Modes', icon: 'sliders' }
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
    modes: idlePreview()
  }))
  const [logs, setLogs] = useState<LogItem[]>([])
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerDevices, setPickerDevices] = useState<BluetoothDeviceInfo[]>([])
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const logId = useRef(0)

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
      modes: (content: PreviewContent) =>
        setPreviews((current) => ({ ...current, modes: content }))
    }),
    []
  )

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
    try {
      await client.connectBle()
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
    const accepted = await window.desktop?.selectBluetoothDevice(deviceId)
    if (!accepted) setSelectingId(null)
  }, [])

  const startDemo = useCallback(() => {
    void run(() => client.useDemo())
  }, [client, run])

  const disconnect = useCallback(() => {
    void run(() => client.disconnect())
  }, [client, run])

  const busy = progress !== null
  const previewStatus = state.mode === 'ble' ? 'live' : state.mode === 'demo' ? 'demo' : 'idle'
  const progressPercent =
    progress && progress.total > 0
      ? Math.round((Math.min(progress.done, progress.total) / progress.total) * 100)
      : 0

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <div>
            <strong>OPEN DOT MATRIX</strong>
            <span>Desktop LED studio</span>
          </div>
        </div>

        <div className="topbar-center">
          <span className={`top-status ${state.mode === 'ble' ? 'is-live' : ''}`}>
            <span className="status-dot" />
            {state.mode === 'ble'
              ? 'Panel online'
              : state.mode === 'demo'
                ? 'Simulation'
                : state.mode === 'connecting'
                  ? 'Scanning'
                  : 'Offline'}
          </span>
          <span className="top-device">{state.deviceName}</span>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="icon-button"
            title="Sync panel clock"
            aria-label="Sync panel clock"
            onClick={() => void run(() => client.syncTime())}
          >
            <Icon name="clock" size={17} />
          </button>
          {state.mode === 'ble' ? (
            <button type="button" className="btn btn-ghost" onClick={disconnect}>
              <Icon name="close" size={15} />
              Disconnect
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => void connect()}>
              <Icon name="bluetooth" size={15} />
              Connect
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          <span>
            <Icon name="bolt" size={16} />
            {error}
          </span>
          <button type="button" className="icon-button" onClick={() => setError(null)}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}

      {progress && (
        <div className={`operation-bar ${progress.total === 0 ? 'is-indeterminate' : ''}`}>
          <span className="operation-label">{progress.label}</span>
          <span className="operation-track">
            <span style={{ width: `${progressPercent}%` }} />
          </span>
          <span className="operation-count">
            {progress.total > 0 ? `${progress.done}/${progress.total}` : '…'}
          </span>
        </div>
      )}

      <main className="workspace">
        <aside className="rail">
          <MatrixPreview content={previews[tab]} status={previewStatus} />
          <ConnectionCard
            state={state}
            onConnect={() => void connect()}
            onDemo={startDemo}
            onDisconnect={disconnect}
          />
          <QuickControls
            onBrightness={(value) => void run(() => client.setBrightness(value))}
            onPower={(on) => void run(() => client.setPower(on))}
            onFlip={(on) => void run(() => client.setFlipped(on))}
            onSyncTime={() => void run(() => client.syncTime())}
          />
        </aside>

        <section className="studio">
          <div className="tabbar" role="tablist" aria-label="Studio tools">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`studio-tab ${tab === item.id ? 'is-active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                <span className="tab-index">{item.index}</span>
                <Icon name={item.icon} size={16} />
                <span>{item.label}</span>
              </button>
            ))}
            <span className="tabbar-note">64 × 64 · RGB</span>
          </div>

          <div className="studio-scroll">
            <div className="tab-pane" hidden={tab !== 'image'}>
              <ImagePanel
                busy={busy}
                onPreview={previewHandlers.image}
                onSend={(rgb) => run(() => client.sendImage(rgb))}
              />
            </div>
            <div className="tab-pane" hidden={tab !== 'gif'}>
              <GifPanel
                busy={busy}
                onPreview={previewHandlers.gif}
                onSend={(bytes) => run(() => client.sendGif(bytes))}
              />
            </div>
            <div className="tab-pane" hidden={tab !== 'text'}>
              <TextPanel
                busy={busy}
                onPreview={previewHandlers.text}
                onSend={(packet) => run(() => client.sendText(packet))}
              />
            </div>
            <div className="tab-pane" hidden={tab !== 'modes'}>
              <ModesPanel
                busy={busy}
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

            <ActivityLog entries={logs} onClear={() => setLogs([])} />
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
