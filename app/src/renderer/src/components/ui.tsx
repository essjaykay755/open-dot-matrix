import { useRef, useState, type CSSProperties, type JSX, type KeyboardEvent, type ReactNode } from 'react'
import { Icon, type IconName } from './Icons'

export type ToolTone = 'idle' | 'ready' | 'busy' | 'error'

export function Tool({
  title,
  description,
  status,
  side,
  summary,
  actions,
  children
}: {
  title: string
  description: string
  status?: { tone: ToolTone; label: string }
  side?: ReactNode
  summary?: ReactNode
  actions?: ReactNode
  children: ReactNode
}): JSX.Element {
  return (
    <article className="tool">
      <header className="tool-head">
        <div className="tool-title">
          <h1 className="dot-title">{title}</h1>
          <p>{description}</p>
        </div>
        {status && (
          <span className={`tool-status is-${status.tone}`}>
            <span className="tool-status-dot" />
            {status.label}
          </span>
        )}
      </header>
      <div className={`tool-body ${side ? 'has-side' : ''}`}>
        <div className="tool-main">{children}</div>
        {side && <div className="tool-side">{side}</div>}
      </div>
      {(summary || actions) && (
        <footer className="tool-foot">
          <div className="tool-summary">{summary}</div>
          <div className="tool-actions">{actions}</div>
        </footer>
      )}
    </article>
  )
}

export function Group({
  label,
  aside,
  children
}: {
  label: string
  aside?: ReactNode
  children: ReactNode
}): JSX.Element {
  return (
    <section className="group">
      <header className="group-head">
        <h2>{label}</h2>
        {aside}
      </header>
      <div className="group-body">{children}</div>
    </section>
  )
}

export function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}): JSX.Element {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export interface SegmentedOption<T extends string | number> {
  value: T
  label: string
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  columns
}: {
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  label: string
  columns?: number
}): JSX.Element {
  return (
    <div
      className={`segmented ${columns ? 'is-grid' : ''}`}
      style={columns ? ({ '--columns': columns } as CSSProperties) : undefined}
      role="group"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={option.value === value ? 'is-active' : ''}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function ColorField({
  label,
  value,
  onChange,
  disabled = false
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <label className={`color-field ${disabled ? 'is-disabled' : ''}`}>
      <span className="field-label">{label}</span>
      <span className="color-control">
        <span className="color-swatch" style={{ background: value }} />
        <span className="color-value">{value.toUpperCase()}</span>
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  )
}

export function PillSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  icon
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  label: string
  icon?: IconName
}): JSX.Element {
  const fraction = (value - min) / (max - min)
  return (
    <span className="pill-slider" style={{ '--f': fraction } as CSSProperties}>
      <span className="pill-slider-fill">{icon && <Icon name={icon} size={16} />}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </span>
  )
}

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  display: string
}): JSX.Element {
  return (
    <div className="range-field">
      <span className="range-head">
        <span className="field-label">{label}</span>
        <span className="range-value">{display}</span>
      </span>
      <PillSlider label={label} value={value} min={min} max={max} step={step} onChange={onChange} />
    </div>
  )
}

export function ToggleRow({
  label,
  detail,
  checked,
  onChange,
  disabled = false
}: {
  label: string
  detail?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <label className={`toggle-row ${disabled ? 'is-disabled' : ''}`}>
      <span>
        <span className="toggle-label">{label}</span>
        {detail && <span className="toggle-detail">{detail}</span>}
      </span>
      <span className={`switch ${checked ? 'is-on' : ''}`}>
        <input
          type="checkbox"
          disabled={disabled}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="switch-thumb" />
      </span>
    </label>
  )
}

export function DropZone({
  accept,
  file,
  icon,
  title,
  hint,
  onFile,
  onClear
}: {
  accept: string
  file: File | null
  icon: IconName
  title: string
  hint: string
  onFile: (file: File) => void
  onClear: () => void
}): JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      input.current?.click()
    }
  }

  return (
    <div
      className={`drop-zone ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
      role="button"
      aria-label={file ? `Replace ${file.name}` : title}
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={handleKeyDown}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const dropped = event.dataTransfer.files[0]
        if (dropped) onFile(dropped)
      }}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          const selected = event.target.files?.[0]
          if (selected) onFile(selected)
          event.target.value = ''
        }}
      />
      <span className="drop-icon">
        <Icon name={file ? 'check' : icon} size={file ? 16 : 20} />
      </span>
      <div className="drop-copy">
        <strong>{file ? file.name : title}</strong>
        <span>{file ? `${formatBytes(file.size)} · click to replace` : hint}</span>
      </div>
      {file && (
        <button
          type="button"
          className="icon-button drop-clear"
          aria-label="Remove file"
          onClick={(event) => {
            event.stopPropagation()
            onClear()
          }}
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  )
}

export function Spinner({ label }: { label?: string }): JSX.Element {
  return (
    <span className="spinner-wrap" role="status">
      <span className="spinner" />
      {label && <span>{label}</span>}
    </span>
  )
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}
