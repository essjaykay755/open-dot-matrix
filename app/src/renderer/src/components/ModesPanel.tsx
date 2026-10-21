import { useState, type JSX } from 'react'
import { hexToRgb } from '../lib/color'
import { createLabelFrame } from '../lib/image'
import { solidPreview, type PreviewContent } from '../lib/preview'
import type { ClockOptions, Rgb } from '../lib/protocol'
import { Icon, type IconName } from './Icons'
import { ColorField, Group, Segmented, ToggleRow, Tool } from './ui'

type Mode = 'color' | 'clock' | 'countdown' | 'stopwatch' | 'score' | 'screen'

const MODES: { id: Mode; label: string; icon: IconName; description: string }[] = [
  { id: 'color', label: 'Color', icon: 'palette', description: 'Fill the whole panel with one color.' },
  { id: 'clock', label: 'Clock', icon: 'clock', description: 'Show one of the built-in clock faces.' },
  { id: 'countdown', label: 'Countdown', icon: 'timer', description: 'Count down from a set time.' },
  { id: 'stopwatch', label: 'Stopwatch', icon: 'play', description: 'Run the on-device stopwatch.' },
  { id: 'score', label: 'Scoreboard', icon: 'scoreboard', description: 'Keep a two-sided scoreboard.' },
  { id: 'screen', label: 'Screen', icon: 'monitor', description: 'Sleep timer and the time indicator.' }
]

const CLOCK_STYLES = Array.from({ length: 8 }, (_, index) => ({
  value: index,
  label: String(index + 1)
}))

const TIMEOUT_OPTIONS = [
  { value: 0, label: 'Never' },
  { value: 30, label: '30 sec' },
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 240, label: '4 min' },
  { value: 254, label: 'Max' }
]

export function ModesPanel({
  busy,
  connected,
  onPreview,
  onColor,
  onClock,
  onCountdown,
  onChronograph,
  onScoreboard,
  onScreenTimeout,
  onTimeIndicator
}: {
  busy: boolean
  connected: boolean
  onPreview: (content: PreviewContent) => void
  onColor: (color: Rgb) => Promise<void>
  onClock: (options: ClockOptions) => Promise<void>
  onCountdown: (mode: number, minutes: number, seconds: number) => Promise<void>
  onChronograph: (mode: number) => Promise<void>
  onScoreboard: (a: number, b: number) => Promise<void>
  onScreenTimeout: (value: number) => Promise<void>
  onTimeIndicator: (enabled: boolean) => Promise<void>
}): JSX.Element {
  const [active, setActive] = useState<Mode>('color')
  const [color, setColor] = useState('#ff5a36')
  const [clockStyle, setClockStyle] = useState(0)
  const [showDate, setShowDate] = useState(true)
  const [hour24, setHour24] = useState(true)
  const [clockColor, setClockColor] = useState('#d8ff63')
  const [countdownMinutes, setCountdownMinutes] = useState(5)
  const [countdownSeconds, setCountdownSeconds] = useState(0)
  const [scoreA, setScoreA] = useState(0)
  const [scoreB, setScoreB] = useState(0)
  const [screenTimeout, setScreenTimeout] = useState(60)
  const [timeIndicator, setTimeIndicator] = useState(true)

  const disabled = busy || !connected
  const current = MODES.find((mode) => mode.id === active) ?? MODES[0]

  function showLabel(label: string): void {
    onPreview({
      kind: 'native',
      label,
      detail: 'Native output · DIY mode released',
      frames: [{ data: createLabelFrame(label).data, delay: 0 }]
    })
  }

  async function applyColor(): Promise<void> {
    const rgb = hexToRgb(color)
    onPreview(solidPreview(rgb, 'Fullscreen color'))
    await onColor(rgb)
  }

  async function applyClock(): Promise<void> {
    showLabel('CLOCK')
    await onClock({
      style: clockStyle,
      showDate,
      hour24,
      color: hexToRgb(clockColor)
    })
  }

  async function startCountdown(): Promise<void> {
    onPreview({
      kind: 'native',
      label: 'Countdown',
      detail: `${countdownMinutes}m ${String(countdownSeconds).padStart(2, '0')}s`,
      frames: [{ data: createLabelFrame('COUNTDOWN').data, delay: 0 }]
    })
    await onCountdown(1, countdownMinutes, countdownSeconds)
  }

  async function applyScoreboard(): Promise<void> {
    showLabel(`${scoreA}-${scoreB}`)
    await onScoreboard(scoreA, scoreB)
  }

  async function applyTimeout(): Promise<void> {
    showLabel(screenTimeout === 0 ? 'NO SLEEP' : `${screenTimeout}S SLEEP`)
    await onScreenTimeout(screenTimeout)
  }

  const footer: Record<Mode, JSX.Element> = {
    color: (
      <button type="button" className="btn btn-primary btn-lg" disabled={disabled} onClick={() => void applyColor()}>
        <Icon name="bolt" size={15} />
        Apply color
      </button>
    ),
    clock: (
      <button type="button" className="btn btn-primary btn-lg" disabled={disabled} onClick={() => void applyClock()}>
        <Icon name="clock" size={15} />
        Show clock
      </button>
    ),
    countdown: (
      <div className="button-row">
        <button type="button" className="btn btn-primary btn-lg" disabled={disabled} onClick={() => void startCountdown()}>
          <Icon name="play" size={14} />
          Start
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-lg"
          disabled={disabled}
          onClick={() => {
            showLabel('TIMER STOP')
            void onCountdown(0, 0, 0)
          }}
        >
          <Icon name="stop" size={14} />
          Stop
        </button>
      </div>
    ),
    stopwatch: (
      <div className="button-row">
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={disabled}
          onClick={() => {
            showLabel('RUN')
            void onChronograph(1)
          }}
        >
          <Icon name="play" size={14} />
          Start
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-lg"
          disabled={disabled}
          onClick={() => {
            showLabel('STOP')
            void onChronograph(0)
          }}
        >
          <Icon name="stop" size={14} />
          Stop
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-lg btn-icon"
          disabled={disabled}
          aria-label="Reset stopwatch"
          title="Reset"
          onClick={() => {
            showLabel('RESET')
            void onChronograph(2)
          }}
        >
          <Icon name="reset" size={16} />
        </button>
      </div>
    ),
    score: (
      <button type="button" className="btn btn-primary btn-lg" disabled={disabled} onClick={() => void applyScoreboard()}>
        <Icon name="scoreboard" size={15} />
        Update score
      </button>
    ),
    screen: (
      <button type="button" className="btn btn-primary btn-lg" disabled={disabled} onClick={() => void applyTimeout()}>
        <Icon name="monitor" size={15} />
        Apply timeout
      </button>
    )
  }

  return (
    <Tool
      title="Modes"
      description="Hand the panel over to its built-in apps. They keep running after you disconnect."
      status={connected ? { tone: 'ready', label: current.label } : { tone: 'idle', label: 'Offline' }}
      summary={
        <>
          <strong>{current.label}</strong>
          <span>{current.description}</span>
        </>
      }
      actions={footer[active]}
      side={
        <Group label={`${current.label} settings`}>
        {active === 'color' && (
          <>
            <div className="color-hero" style={{ background: color, color }} aria-hidden="true" />
            <ColorField label="Color" value={color} onChange={setColor} />
          </>
        )}

        {active === 'clock' && (
          <>
            <div className="field">
              <span className="field-label">Clock face</span>
              <Segmented label="Clock face" value={clockStyle} options={CLOCK_STYLES} onChange={setClockStyle} columns={4} />
            </div>
            <ColorField label="Color" value={clockColor} onChange={setClockColor} />
            <div className="toggle-stack">
              <ToggleRow label="Show date" checked={showDate} onChange={setShowDate} />
              <ToggleRow label="24-hour clock" checked={hour24} onChange={setHour24} />
            </div>
          </>
        )}

        {active === 'countdown' && (
          <div className="number-pair">
            <label>
              <span className="field-label">Minutes</span>
              <input
                type="number"
                min={0}
                max={59}
                value={countdownMinutes}
                onChange={(event) => setCountdownMinutes(Number(event.target.value))}
              />
            </label>
            <span className="number-sep" aria-hidden="true">:</span>
            <label>
              <span className="field-label">Seconds</span>
              <input
                type="number"
                min={0}
                max={59}
                value={countdownSeconds}
                onChange={(event) => setCountdownSeconds(Number(event.target.value))}
              />
            </label>
          </div>
        )}

        {active === 'stopwatch' && (
          <div className="mode-empty">
            <Icon name="timer" size={24} />
            <span>No settings needed. Start, stop or reset from the bar below.</span>
          </div>
        )}

        {active === 'score' && (
          <div className="number-pair">
            <label>
              <span className="field-label">Home</span>
              <input
                type="number"
                min={0}
                max={999}
                value={scoreA}
                onChange={(event) => setScoreA(Number(event.target.value))}
              />
            </label>
            <span className="number-sep" aria-hidden="true">–</span>
            <label>
              <span className="field-label">Away</span>
              <input
                type="number"
                min={0}
                max={999}
                value={scoreB}
                onChange={(event) => setScoreB(Number(event.target.value))}
              />
            </label>
          </div>
        )}

        {active === 'screen' && (
          <>
            <div className="field">
              <span className="field-label">Turn screen off after</span>
              <Segmented label="Screen timeout" value={screenTimeout} options={TIMEOUT_OPTIONS} onChange={setScreenTimeout} columns={3} />
            </div>
            <ToggleRow
              label="Time indicator"
              detail="Applies immediately"
              disabled={disabled}
              checked={timeIndicator}
              onChange={(checked) => {
                setTimeIndicator(checked)
                void onTimeIndicator(checked)
              }}
            />
          </>
        )}
        </Group>
      }
    >
      <div className="mode-picker" role="group" aria-label="Panel mode">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={`mode-tile ${active === mode.id ? 'is-active' : ''}`}
            aria-pressed={active === mode.id}
            onClick={() => setActive(mode.id)}
          >
            <span className="mode-tile-icon">
              <Icon name={mode.icon} size={18} />
            </span>
            <strong>{mode.label}</strong>
            <span>{mode.description}</span>
          </button>
        ))}
      </div>
    </Tool>
  )
}
