import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import type { BluetoothDeviceInfo } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let pendingBluetoothSelection: ((deviceId: string) => void) | null = null

const BLUETOOTH_PERMISSIONS = new Set(['bluetooth', 'bluetoothScanning', 'bluetoothPairing'])

function settleBluetoothSelection(deviceId: string): boolean {
  const callback = pendingBluetoothSelection
  pendingBluetoothSelection = null
  if (!callback) return false
  callback(deviceId)
  return true
}

function setupBluetoothBridge(window: BrowserWindow): void {
  window.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault()
    pendingBluetoothSelection = callback

    const seen = new Set<string>()
    const devices: BluetoothDeviceInfo[] = []

    for (const device of deviceList) {
      if (!device.deviceId || seen.has(device.deviceId)) continue
      seen.add(device.deviceId)
      devices.push({
        deviceId: device.deviceId,
        deviceName: device.deviceName || 'Unnamed Bluetooth device'
      })
    }

    devices.sort((a, b) => {
      const aPreferred = a.deviceName.startsWith('IDM-') ? 0 : 1
      const bPreferred = b.deviceName.startsWith('IDM-') ? 0 : 1
      return aPreferred - bPreferred || a.deviceName.localeCompare(b.deviceName)
    })

    if (!window.isDestroyed()) {
      window.webContents.send('bluetooth:devices', devices)
    }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#08090a',
    title: 'Open Dot Matrix',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const allowedPermissions = new Set(BLUETOOTH_PERMISSIONS)
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.has(permission))
  })
  mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission) => {
    return allowedPermissions.has(permission)
  })

  setupBluetoothBridge(mainWindow)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    settleBluetoothSelection('')
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.opendotmatrix.studio')
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

ipcMain.handle('bluetooth:select', (_event, deviceId: unknown) => {
  if (typeof deviceId !== 'string') return false
  return settleBluetoothSelection(deviceId)
})

ipcMain.handle('bluetooth:cancel', () => {
  return settleBluetoothSelection('')
})

app.on('before-quit', () => {
  settleBluetoothSelection('')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
