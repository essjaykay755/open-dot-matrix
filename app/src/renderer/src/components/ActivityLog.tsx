import { useEffect, useRef, type JSX } from 'react'
import type { LogLevel } from '../lib/transport'

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
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [entries])

  return (
    <section className="log-panel panel">
      <header className="log-head">
        <div>
          <span className="eyebrow">Activity</span>
          <h2>Transfer bus</h2>
        </div>
        <div className="log-actions">
          <span className="live-badge">
            <span />
            Live
          </span>
          <button type="button" className="text-button" onClick={onClear}>
            Clear
          </button>
        </div>
      </header>
      <div className="log-list" ref={listRef} role="log" aria-live="polite">
        {entries.length === 0 ? (
          <p className="log-empty">Waiting for the first packet…</p>
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
    </section>
  )
}
