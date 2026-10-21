import type { BluetoothDeviceInfo } from '../../../shared/types'

const STORAGE_KEY = 'odm.lastDevice.v1'

/** The last panel picked in the device picker, used for unattended reconnects. */
export function loadLastDevice(): BluetoothDeviceInfo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BluetoothDeviceInfo>
    if (typeof parsed.deviceId !== 'string' || !parsed.deviceId) return null
    return { deviceId: parsed.deviceId, deviceName: parsed.deviceName ?? 'iDotMatrix' }
  } catch {
    return null
  }
}

export function saveLastDevice(device: BluetoothDeviceInfo): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(device))
  } catch {
    // Reconnect still works within this session.
  }
}
