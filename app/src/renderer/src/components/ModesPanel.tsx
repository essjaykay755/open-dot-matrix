import { useState, type JSX } from 'react'
import { hexToRgb } from '../lib/color'
import { createLabelFrame } from '../lib/image'
import { solidPreview, type PreviewContent } from '../lib/preview'
import type { ClockOptions, Rgb } from '../lib/protocol'
import { Icon } from './Icons'
import { ColorField, ToggleRow } from './ui'

const CLOCK_STYLES = [
  'Style 01',
  'Style 02',
  'Style 03',
  'Style 04',
  'Style 05',
  'Style 06',
  'Style 07',
  'Style 08'
]

export function ModesPanel({
  busy,
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
  onPreview: (content: PreviewContent) => void
  onColor: (color: Rgb) => Promise<void>
  onClock: (options: ClockOptions) => Promise<void>
  onCountdown: (mode: number, minutes: number, seconds: number) => Promise<void>
  onChronograph: (mode: number) => Promise<void>
  onScoreboard: (a: number, b: number) => Promise<void>
  onScreenTimeout: (value: number) => Promise<void>
  onTimeIndicator: (enabled: boolean) => Promise<void>
}): JSX.Element {
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

  return (
    <div className="work-panel">
      <header className="work-head">
        <div>
          <span className="eyebrow">04 / Modes</span>
          <h2>Native light, no uploads.</h2>
          <p>
            Clock, countdown, stopwatch, scoreboard, and fullscreen color are rendered by the panel
            itself. Open Dot Matrix only sends the command packet.
          </p>
        </div>
        <span className="work-badge">Native firmware modes</span>
      </header>

      <div className="mode-grid">
        <section className="mode-card">
          <div className="mode-title">
            <span className="mode-icon">
              <Icon name="palette" size={17} />
            </span>
            <div>
              <strong>Fullscreen color</strong>
              <span>Flood the grid</span>
            </div>
          </div>
          <ColorField label="Color" value={color} onChange={setColor} />
          <button type="button" className="btn btn-secondary full" disabled={busy} onClick={() => void applyColor()}>
            <Icon name="bolt" size={15} />
            Apply color
          </button>
        </section>

        <section className="mode-card">
          <div className="mode-title">
            <span className="mode-icon">
              <Icon name="clock" size={17} />
            </span>
            <div>
              <strong>Clock</strong>
              <span>Uses the host time</span>
            </div>
          </div>
          <label className="field compact-field">
            <span className="field-label">Clock face</span>
            <select value={clockStyle} onChange={(event) => setClockStyle(Number(event.target.value))}>
              {CLOCK_STYLES.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <ColorField label="Color" value={clockColor} onChange={setClockColor} />
          <div className="toggle-stack tight">
            <ToggleRow label="Show date" checked={showDate} onChange={setShowDate} />
            <ToggleRow label="24-hour clock" checked={hour24} onChange={setHour24} />
          </div>
          <div className="mode-actions">
            <button type="button" className="btn btn-secondary full" disabled={busy} onClick={() => void applyClock()}>
              <Icon name="clock" size={15} />
              Show clock
            </button>
          </div>
        </section>

        <section className="mode-card">
          <div className="mode-title">
            <span className="mode-icon">
              <Icon name="timer" size={17} />
            </span>
            <div>
              <strong>Countdown</strong>
              <span>Minutes and seconds</span>
            </div>
          </div>
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
          <div className="mode-actions">
            <button
              type="button"
              className="btn btn-primary grow"
              disabled={busy}
              onClick={() => void startCountdown()}
            >
              <Icon name="play" size={14} />
              Start
            </button>
            <button
              type="button"
              className="btn btn-ghost grow"
              disabled={busy}
              onClick={() => {
                showLabel('TIMER STOP')
                void onCountdown(0, 0, 0)
              }}
            >
              <Icon name="stop" size={14} />
              Stop
            </button>
          </div>
        </section>

        <section className="mode-card">
          <div className="mode-title">
            <span className="mode-icon">
              <Icon name="timer" size={17} />
            </span>
            <div>
              <strong>Stopwatch</strong>
              <span>Firmware chronograph</span>
            </div>
          </div>
          <p className="mode-copy">Start, stop, or reset the panel’s built-in stopwatch.</p>
          <div className="mode-actions">
            <button
              type="button"
              className="btn btn-primary grow"
              disabled={busy}
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
              className="btn btn-secondary grow"
              disabled={busy}
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
              className="icon-button"
              disabled={busy}
              aria-label="Reset stopwatch"
              onClick={() => {
                showLabel('RESET')
                void onChronograph(2)
              }}
            >
              <Icon name="reset" size={16} />
            </button>
          </div>
        </section>

        <section className="mode-card">
          <div className="mode-title">
            <span className="mode-icon">
              <Icon name="scoreboard" size={17} />
            </span>
            <div>
              <strong>Scoreboard</strong>
              <span>Two score counters</span>
            </div>
          </div>
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
          <button type="button" className="btn btn-secondary full" disabled={busy} onClick={() => void applyScoreboard()}>
            <Icon name="scoreboard" size={15} />
            Update score
          </button>
        </section>

        <section className="mode-card">
          <div className="mode-title">
            <span className="mode-icon">
              <Icon name="monitor" size={17} />
            </span>
            <div>
              <strong>Screen behavior</strong>
              <span>Timeout and indicator</span>
            </div>
          </div>
          <label className="field compact-field">
            <span className="field-label">Screen timeout</span>
            <select
              value={screenTimeout}
              onChange={(event) => setScreenTimeout(Number(event.target.value))}
            >
              <option value={0}>Never</option>
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
              <option value={120}>2 minutes</option>
              <option value={240}>4 minutes</option>
              <option value={254}>Maximum</option>
            </select>
          </label>
          <ToggleRow
            label="Time indicator"
            detail="Show the clock indicator dot"
            checked={timeIndicator}
            onChange={(checked) => {
              setTimeIndicator(checked)
              void onTimeIndicator(checked)
            }}
          />
          <button type="button" className="btn btn-secondary full" disabled={busy} onClick={() => void applyTimeout()}>
            <Icon name="monitor" size={15} />
            Apply timeout
          </button>
        </section>
      </div>

      <footer className="action-row">
        <span className="action-hint">
          <Icon name="spark" size={14} />
          Native modes release DIY mode so the firmware can render again.
        </span>
      </footer>
    </div>
  )
}
