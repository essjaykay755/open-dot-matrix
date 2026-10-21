import { useEffect, useRef, useState, type JSX } from 'react'
import type { LogLevel } from '../lib/transport'
import { Icon } from './Icons'

export interface LogItem {
  id: number
  time: string
  level: LogLevel
  message: string
}

export function ActivityLog({
  entries,
  onClear
}: {
  entries: LogItem[]
  onClear: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const latest = entries[entries.length - 1]

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [entries, open])

  return (
    <section className={`activity ${open ? 'is-open' : ''}`} aria-label="Activity">
      <div className="activity-bar">
        <button type="button" className="activity-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <Icon name="activity" size={14} />
          <span className="activity-title">Activity</span>
          {latest ? (
            <span className={`activity-latest log-${latest.level}`}>
              <span className="activity-time">{latest.time}</span>
              {latest.message}
            </span>
          ) : (
            <span className="activity-latest">Nothing yet</span>
          )}
          <Icon name="chevron" size={14} className="activity-chevron" />
        </button>
        {open && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} disabled={entries.length === 0}>
            Clear
          </button>
        )}
      </div>
      {open && (
        <div className="log-list" ref={listRef} role="log" aria-live="polite">
          {entries.length === 0 ? (
            <p className="log-empty">No activity yet.</p>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className={`log-row log-${entry.level}`}>
                <span className="log-time">{entry.time}</span>
                <span className="log-level">{entry.level}</span>
                <span className="log-message">{entry.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  )
}
