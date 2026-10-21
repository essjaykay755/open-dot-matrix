import { useEffect, type JSX } from 'react'
import type { BluetoothDeviceInfo } from '../../../shared/types'
import { Icon } from './Icons'
import { Spinner } from './ui'

export function DevicePicker({
  open,
  devices,
  selectingId,
  onSelect,
  onCancel
}: {
  open: boolean
  devices: BluetoothDeviceInfo[]
  selectingId: string | null
  onSelect: (deviceId: string) => void
  onCancel: () => void
}): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    function handleKey(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="device-modal" role="dialog" aria-modal="true" aria-labelledby="picker-title">
        <div className="picker-visual">
          <span className="picker-ring ring-one" />
          <span className="picker-ring ring-two" />
          <span className="picker-core">
            <Icon name="bluetooth" size={24} />
          </span>
        </div>
        <div className="picker-copy">
          <span className="eyebrow">Bluetooth discovery</span>
          <h2 id="picker-title">Choose your panel</h2>
          <p>
            Select the <strong>IDM-</strong> device. If it is missing, close the phone app or
            disconnect the panel from it, then try again.
          </p>
        </div>

        <div className="device-list">
          {devices.length === 0 ? (
            <div className="device-empty">
              <Spinner label="Scanning for nearby Bluetooth devices…" />
            </div>
          ) : (
            devices.map((device) => {
              const preferred = device.deviceName.startsWith('IDM-')
              const selecting = selectingId === device.deviceId
              return (
                <button
                  key={device.deviceId}
                  type="button"
                  className={`device-row ${preferred ? 'is-preferred' : ''}`}
                  disabled={selectingId !== null}
                  onClick={() => onSelect(device.deviceId)}
                >
                  <span className="device-icon">
                    <Icon name={preferred ? 'matrix' : 'bluetooth'} size={17} />
                  </span>
                  <span className="device-name">
                    <strong>{device.deviceName}</strong>
                    <span>{preferred ? 'iDotMatrix panel' : 'Bluetooth device'}</span>
                  </span>
                  {selecting ? (
                    <Spinner />
                  ) : (
                    <span className="device-select">
                      Select
                      <Icon name="chevron" size={14} />
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="modal-footer">
          <span className="modal-hint">Web Bluetooth · local connection only</span>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
