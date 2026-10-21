import { useEffect, useRef, type JSX } from 'react'
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
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement
    dialogRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
    function handleKey(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') onCancel()
      if (event.key !== 'Tab') return
      const controls = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div ref={dialogRef} className="device-modal" role="dialog" aria-modal="true" aria-labelledby="picker-title">
        <div className="picker-copy">
          <h2 id="picker-title">Choose your panel</h2>
          <p>Choose an IDM device. Disconnect it from the phone app if it doesn’t appear.</p>
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
                    <strong title={device.deviceName}>{device.deviceName}</strong>
                    {preferred && <span>iDotMatrix panel</span>}
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
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
