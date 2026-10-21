export interface BluetoothDeviceInfo {
  deviceId: string
  deviceName: string
}

export interface DesktopBridge {
  selectBluetoothDevice: (deviceId: string) => Promise<boolean>
  cancelBluetoothSelection: () => Promise<boolean>
  onBluetoothDevices: (callback: (devices: BluetoothDeviceInfo[]) => void) => () => void
  platform: string
}
