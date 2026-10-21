import type { JSX } from 'react'
import type { MatrixState } from '../lib/matrixClient'
import { Icon } from './Icons'

export function ConnectionCard({
  state,
  onConnect,
  onDemo,
  onDisconnect
}: {
  state: MatrixState
  onConnect: () => void
  onDemo: () => void
  onDisconnect: () => void
}): JSX.Element {
  const connected = state.mode === 'ble' || state.mode === 'demo'
  const label =
    state.mode === 'ble'
      ? 'Bluetooth online'
      : state.mode === 'demo'
        ? 'Simulation online'
        : state.mode === 'connecting'
          ? 'Opening device picker'
          : 'No panel connected'

  return (
    <section className="connection-card panel">
      <div className="connection-head">
        <span className={`connection-glyph ${connected ? 'is-on' : ''}`}>
          <Icon name="bluetooth" size={18} />
        </span>
        <div>
          <span className="eyebrow">Connection</span>
          <strong>{state.deviceName}</strong>
        </div>
        <span className={`connection-state ${connected ? 'is-on' : ''}`}>
          {state.mode === 'ble' ? 'BLE' : state.mode === 'demo' ? 'DEMO' : 'OFF'}
        </span>
      </div>
      <p className="connection-note">{label}</p>

      <div className="connection-actions">
        {state.mode === 'ble' ? (
          <button type="button" className="btn btn-secondary" onClick={onDisconnect}>
            <Icon name="close" size={15} />
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConnect}
            disabled={state.mode === 'connecting'}
          >
            <Icon name="bluetooth" size={15} />
            Connect panel
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onDemo}
          disabled={state.mode === 'demo'}
        >
          <Icon name="spark" size={15} />
          Demo
        </button>
      </div>

      <div className="connection-specs">
        <span>GATT fa02 / fa03</span>
        <span>64 × 64 RGB</span>
        <span>4096 B chunks</span>
      </div>
    </section>
  )
}
