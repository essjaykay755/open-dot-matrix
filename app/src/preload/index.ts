import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { BluetoothDeviceInfo, DesktopBridge } from '../shared/types'

const bridge: DesktopBridge = {
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
  platform: process.platform
}

contextBridge.exposeInMainWorld('desktop', bridge)
