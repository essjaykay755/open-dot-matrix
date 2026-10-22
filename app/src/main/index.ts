import { app, BrowserWindow, ipcMain, nativeTheme, shell, systemPreferences } from 'electron'
import { join } from 'node:path'
import type { BluetoothDeviceInfo } from '../shared/types'
import { CREATOR_PROFILES } from '../shared/creator'
import { REPOSITORY_URL } from '../shared/repository'
import { appIconPath } from './icon'
import { getAppearance, getWindowColors, installApplicationMenu, platformWindowOptions, updateWindowAppearance } from './appearance'
import { interceptWindowClose, isKeepingInTray, setupBackground, startedHidden } from './background'

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let mainWindow: BrowserWindow | null = null
let revealOnReady = !startedHidden
let pendingBluetoothSelection: ((deviceId: string) => void) | null = null
let autoConnectTarget: string | null = null
let autoConnectTimer: NodeJS.Timeout | null = null

const AUTO_CONNECT_TIMEOUT_MS = 20000

const BLUETOOTH_PERMISSIONS = new Set(['bluetooth', 'bluetoothScanning', 'bluetoothPairing'])

function settleBluetoothSelection(deviceId: string): boolean {
  const callback = pendingBluetoothSelection
  pendingBluetoothSelection = null
  if (!callback) return false
  callback(deviceId)
  return true
}

function clearAutoConnect(): void {
  autoConnectTarget = null
  if (autoConnectTimer) clearTimeout(autoConnectTimer)
  autoConnectTimer = null
}

function showWindow(): void {
  revealOnReady = true
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
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

    // An unattended reconnect picks the remembered panel as soon as the scan finds it.
    const target = autoConnectTarget
    if (target && devices.some((device) => device.deviceId === target)) {
      clearAutoConnect()
      settleBluetoothSelection(target)
      return
    }

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
    autoHideMenuBar: process.platform !== 'linux',
    backgroundColor: getWindowColors().background,
    title: 'Open Dot Matrix',
    icon: appIconPath(),
    ...platformWindowOptions(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Scheduled panel updates must keep running while the window is hidden in the tray.
      backgroundThrottling: false
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
  interceptWindowClose(mainWindow)

  mainWindow.once('ready-to-show', () => {
    if (revealOnReady) mainWindow?.show()
  })

  mainWindow.on('focus', () => {
    if (mainWindow) updateWindowAppearance(mainWindow)
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
  app.setName('Open Dot Matrix')
  app.setAppUserModelId('com.opendotmatrix.studio')
  installApplicationMenu()
  createWindow()
  setupBackground(() => mainWindow, showWindow)

  nativeTheme.on('updated', () => {
    if (mainWindow) updateWindowAppearance(mainWindow)
  })
  if (process.platform !== 'darwin') {
    systemPreferences.on('accent-color-changed', () => {
      if (mainWindow) updateWindowAppearance(mainWindow)
    })
  }

  app.on('activate', showWindow)
})

app.on('second-instance', showWindow)

ipcMain.handle('appearance:get', () => getAppearance())

ipcMain.handle('app:open-repository', async () => {
  await shell.openExternal(REPOSITORY_URL)
})

ipcMain.handle('app:open-creator-profile', async (_event, profile: unknown) => {
  if (profile !== 'github' && profile !== 'x') throw new Error('Unknown creator profile')
  await shell.openExternal(CREATOR_PROFILES[profile].url)
})

ipcMain.handle('bluetooth:select', (_event, deviceId: unknown) => {
  if (typeof deviceId !== 'string') return false
  return settleBluetoothSelection(deviceId)
})

ipcMain.handle('bluetooth:cancel', () => {
  return settleBluetoothSelection('')
})

ipcMain.handle('bluetooth:auto-connect', async (_event, deviceId: unknown) => {
  const window = mainWindow
  if (typeof deviceId !== 'string' || !deviceId || !window || window.isDestroyed()) return false
  clearAutoConnect()
  autoConnectTarget = deviceId
  autoConnectTimer = setTimeout(() => {
    clearAutoConnect()
    settleBluetoothSelection('')
  }, AUTO_CONNECT_TIMEOUT_MS)
  try {
    // Web Bluetooth only scans inside a user gesture; executeJavaScript can supply one.
    const connected = await window.webContents.executeJavaScript(
      'window.__odmAutoConnect ? window.__odmAutoConnect() : false',
      true
    )
    return connected === true
  } catch {
    return false
  } finally {
    clearAutoConnect()
  }
})

app.on('before-quit', () => {
  clearAutoConnect()
  settleBluetoothSelection('')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !isKeepingInTray()) app.quit()
})
