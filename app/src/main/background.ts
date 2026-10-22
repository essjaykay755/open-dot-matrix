import { app, ipcMain, Menu, nativeImage, powerMonitor, Tray, type BrowserWindow } from 'electron'
import type { BackgroundOptions, BackgroundState } from '../shared/types'
import { appIconPath } from './icon'

// Keeps the app alive in the system tray so scheduled updates (weather) keep reaching the panel
// after the window is closed, and optionally starts it hidden at login.

const HIDDEN_ARG = '--hidden'

let tray: Tray | null = null
let quitting = false
let trayHintShown = false

export const startedHidden =
  process.argv.includes(HIDDEN_ARG) ||
  // macOS login items cannot carry arguments, so a login launch there always starts hidden.
  (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin)

// A hidden login launch has no window to close, so it must stay in the tray until the renderer
// reports the saved preference.
let keepInTray = startedHidden

function launchAtLoginSupported(): boolean {
  return app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin')
}

function backgroundState(): BackgroundState {
  const supported = launchAtLoginSupported()
  return {
    keepInTray,
    launchAtLogin: supported && app.getLoginItemSettings({ args: [HIDDEN_ARG] }).openAtLogin,
    launchAtLoginSupported: supported,
    startedHidden
  }
}

export function setupBackground(getWindow: () => BrowserWindow | null, showWindow: () => void): void {
  const send = (channel: string): void => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(channel)
  }

  const icon = nativeImage.createFromPath(appIconPath())
  tray = new Tray(icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('Open Dot Matrix')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Open Dot Matrix', click: showWindow },
      { label: 'Update weather now', click: () => send('weather:refresh') },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', showWindow)

  powerMonitor.on('resume', () => send('system:resume'))
  powerMonitor.on('unlock-screen', () => send('system:resume'))

  app.on('before-quit', () => {
    quitting = true
  })

  ipcMain.handle('background:get', () => backgroundState())
  ipcMain.handle('background:set', (_event, options: BackgroundOptions) => {
    if (typeof options?.keepInTray === 'boolean') keepInTray = options.keepInTray
    if (typeof options?.launchAtLogin === 'boolean' && launchAtLoginSupported()) {
      app.setLoginItemSettings({
        openAtLogin: options.launchAtLogin,
        args: [HIDDEN_ARG]
      })
    }
    return backgroundState()
  })
  ipcMain.handle('tray:status', (_event, text: unknown) => {
    if (typeof text === 'string') tray?.setToolTip(text.slice(0, 120) || 'Open Dot Matrix')
  })
}

/** Hides the window instead of closing it while background mode is on. */
export function interceptWindowClose(window: BrowserWindow): void {
  window.on('close', (event) => {
    if (quitting || !keepInTray) return
    event.preventDefault()
    window.hide()
    if (!trayHintShown && process.platform === 'win32' && tray) {
      trayHintShown = true
      tray.displayBalloon({
        iconType: 'info',
        title: 'Open Dot Matrix is still running',
        content: 'Scheduled updates keep reaching your panel. Right-click the tray icon to quit.'
      })
    }
  })
}

export function isKeepingInTray(): boolean {
  return keepInTray && !quitting
}
