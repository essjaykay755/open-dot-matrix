import { useEffect, useRef, useState, type JSX } from 'react'
import { Icon, type IconName } from './Icons'
import { PillSlider } from './ui'

export function QuickControls({
  disabled,
  onBrightness,
  onPower,
  onFlip,
  onSyncTime
}: {
  disabled: boolean
  onBrightness: (value: number) => void
  onPower: (on: boolean) => void
  onFlip: (on: boolean) => void
  onSyncTime: () => void
}): JSX.Element {
  const [brightness, setBrightness] = useState(100)
  const [flipped, setFlipped] = useState(false)
  const [powered, setPowered] = useState(true)
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

  function handlePower(on: boolean): void {
    setPowered(on)
    onPower(on)
  }

  function handleFlip(): void {
    const next = !flipped
    setFlipped(next)
    onFlip(next)
  }

  const keys: { icon: IconName; label: string; title: string; active?: boolean; onClick: () => void }[] = [
    { icon: 'power', label: 'On', title: 'Turn display on', active: powered, onClick: () => handlePower(true) },
    { icon: 'power-off', label: 'Off', title: 'Turn display off', active: !powered, onClick: () => handlePower(false) },
    { icon: 'flip', label: 'Flip', title: 'Rotate display 180°', active: flipped, onClick: handleFlip },
    { icon: 'clock', label: 'Sync', title: 'Sync panel clock to this computer', onClick: onSyncTime }
  ]

  return (
    <section className="card display-card" aria-label="Display">
      <header className="card-head">
        <h2>Display</h2>
      </header>
      <fieldset className="display-fields" disabled={disabled}>
        <div className="brightness">
          <span className="brightness-head">
            <span>Brightness</span>
            <span className="brightness-value dot-figure">
              {brightness}
              <small>%</small>
            </span>
          </span>
          <PillSlider label="Brightness" icon="sun" value={brightness} min={5} max={100} onChange={handleBrightness} />
        </div>

        <div className="keys">
          {keys.map((key) => (
            <button
              key={key.label}
              type="button"
              className={`key ${key.active && !disabled ? 'is-on' : ''}`}
              title={key.title}
              aria-label={key.title}
              aria-pressed={key.active}
              onClick={key.onClick}
            >
              <span className="key-cap">
                <Icon name={key.icon} size={18} />
              </span>
              <span className="key-label">{key.label}</span>
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  )
}
