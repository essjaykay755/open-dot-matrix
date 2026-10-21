import type { JSX } from 'react'
import type { MatrixState } from '../lib/matrixClient'
import { Icon } from './Icons'

export function ConnectionCard({
  state,
  busy,
  onConnect,
  onDemo,
  onDisconnect
}: {
  state: MatrixState
  busy: boolean
  onConnect: () => void
  onDemo: () => void
  onDisconnect: () => void
}): JSX.Element {
  const tag =
    state.mode === 'ble' ? 'Connected' : state.mode === 'demo' ? 'Demo' : state.mode === 'connecting' ? 'Scanning' : 'Offline'
  const status =
    state.mode === 'ble'
      ? 'Bluetooth LE · 64 × 64 RGB'
      : state.mode === 'demo'
        ? 'Simulated · nothing is transmitted'
        : state.mode === 'connecting'
          ? 'Looking for nearby panels…'
          : 'Connect an iDotMatrix panel'
  const name = state.mode === 'demo' ? 'Demo panel' : state.mode === 'ble' ? state.deviceName : 'No panel'

  return (
    <section className={`card device-card is-${state.mode}`} aria-label="Connection">
      <header className="card-head">
        <h2>Device</h2>
        <span className="state-tag">
          <span className="state-dot" />
          {tag}
        </span>
      </header>

      <div className="device-meta">
        <strong title={name}>{name}</strong>
        <span>{status}</span>
      </div>

      <div className="device-actions">
        {state.mode === 'ble' ? (
          <button type="button" className="btn btn-secondary grow" onClick={onDisconnect} disabled={busy}>
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary grow"
            onClick={onConnect}
            disabled={state.mode === 'connecting' || busy}
          >
            <Icon name="bluetooth" size={15} />
            {state.mode === 'connecting' ? 'Connecting…' : 'Connect panel'}
          </button>
        )}
        {state.mode !== 'ble' && (
          <button
            type="button"
            className={`btn btn-secondary ${state.mode === 'demo' ? 'is-pressed' : ''}`}
            onClick={onDemo}
            disabled={state.mode === 'demo' || state.mode === 'connecting' || busy}
            title="Try every tool against a simulated panel"
          >
            Demo
          </button>
        )}
      </div>
    </section>
  )
}
