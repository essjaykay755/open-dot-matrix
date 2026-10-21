import { useEffect, useRef, useState, type JSX } from 'react'
import { Icon } from './Icons'

export function QuickControls({
  onBrightness,
  onPower,
  onFlip,
  onSyncTime
}: {
  onBrightness: (value: number) => void
  onPower: (on: boolean) => void
  onFlip: (on: boolean) => void
  onSyncTime: () => void
}): JSX.Element {
  const [brightness, setBrightness] = useState(100)
  const [flipped, setFlipped] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  function handleBrightness(value: number): void {
    setBrightness(value)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onBrightness(value), 180)
  }

  function handleFlip(): void {
    const next = !flipped
    setFlipped(next)
    onFlip(next)
  }

  return (
    <section className="quick-panel panel">
      <header className="panel-head compact">
        <div>
          <span className="eyebrow">Quick controls</span>
          <h2>Panel utility</h2>
        </div>
        <Icon name="sliders" size={17} />
      </header>

      <label className="brightness-control">
        <span className="range-head">
          <span className="field-label">
            <Icon name="bolt" size={13} />
            Brightness
          </span>
          <span className="range-value">{brightness}%</span>
        </span>
        <input
          type="range"
          min={5}
          max={100}
          step={1}
          value={brightness}
          onChange={(event) => handleBrightness(Number(event.target.value))}
        />
      </label>

      <div className="quick-grid">
        <button type="button" className="quick-action" onClick={() => onPower(true)}>
          <Icon name="power" size={17} />
          <span>On</span>
        </button>
        <button type="button" className="quick-action" onClick={() => onPower(false)}>
          <Icon name="power-off" size={17} />
          <span>Off</span>
        </button>
        <button
          type="button"
          className={`quick-action ${flipped ? 'is-on' : ''}`}
          onClick={handleFlip}
          aria-pressed={flipped}
        >
          <Icon name="flip" size={17} />
          <span>Flip</span>
        </button>
        <button type="button" className="quick-action" onClick={onSyncTime}>
          <Icon name="clock" size={17} />
          <span>Sync</span>
        </button>
      </div>
    </section>
  )
}
