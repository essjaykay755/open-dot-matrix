export interface BluetoothDeviceInfo {
  deviceId: string
  deviceName: string
}

export interface DesktopAppearance {
  platform: string
  desktop: 'gnome' | 'kde' | 'generic'
  dark: boolean
  accent: string
}

export interface DesktopBridge {
  getAppearance: () => Promise<DesktopAppearance>
  onAppearanceChanged: (callback: (appearance: DesktopAppearance) => void) => () => void
  selectBluetoothDevice: (deviceId: string) => Promise<boolean>
  cancelBluetoothSelection: () => Promise<boolean>
  onBluetoothDevices: (callback: (devices: BluetoothDeviceInfo[]) => void) => () => void
  /** Scans for and connects to a remembered panel without showing the picker. */
  autoConnectBluetooth: (deviceId: string) => Promise<boolean>
  getBackgroundState: () => Promise<BackgroundState>
  setBackgroundOptions: (options: BackgroundOptions) => Promise<BackgroundState>
  setTrayStatus: (text: string) => Promise<void>
  onWeatherRefreshRequest: (callback: () => void) => () => void
  onSystemResume: (callback: () => void) => () => void
  platform: string
}

export interface BackgroundOptions {
  keepInTray?: boolean
  launchAtLogin?: boolean
}

export interface BackgroundState {
  keepInTray: boolean
  launchAtLogin: boolean
  launchAtLoginSupported: boolean
  startedHidden: boolean
}
