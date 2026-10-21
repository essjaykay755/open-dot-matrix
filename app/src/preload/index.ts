import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { BluetoothDeviceInfo, DesktopAppearance, DesktopBridge } from '../shared/types'

function subscribe(channel: string, callback: () => void): () => void {
  const listener = (): void => callback()
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const bridge: DesktopBridge = {
  getAppearance: () => ipcRenderer.invoke('appearance:get'),
  onAppearanceChanged: (callback) => {
    const listener = (_event: IpcRendererEvent, appearance: DesktopAppearance): void => callback(appearance)
    ipcRenderer.on('appearance:changed', listener)
    return () => ipcRenderer.removeListener('appearance:changed', listener)
  },
  selectBluetoothDevice: (deviceId) => ipcRenderer.invoke('bluetooth:select', deviceId),
  cancelBluetoothSelection: () => ipcRenderer.invoke('bluetooth:cancel'),
  onBluetoothDevices: (callback) => {
    const listener = (_event: IpcRendererEvent, devices: BluetoothDeviceInfo[]): void => {
      callback(devices)
    }
    ipcRenderer.on('bluetooth:devices', listener)
    return () => {
      ipcRenderer.removeListener('bluetooth:devices', listener)
    }
  },
  autoConnectBluetooth: (deviceId) => ipcRenderer.invoke('bluetooth:auto-connect', deviceId),
  getBackgroundState: () => ipcRenderer.invoke('background:get'),
  setBackgroundOptions: (options) => ipcRenderer.invoke('background:set', options),
  setTrayStatus: (text) => ipcRenderer.invoke('tray:status', text),
  onWeatherRefreshRequest: (callback) => subscribe('weather:refresh', callback),
  onSystemResume: (callback) => subscribe('system:resume', callback),
  platform: process.platform
}

contextBridge.exposeInMainWorld('desktop', bridge)
