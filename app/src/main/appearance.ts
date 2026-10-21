import { app, Menu, nativeTheme, systemPreferences, type BrowserWindow, type BrowserWindowConstructorOptions, type MenuItemConstructorOptions } from 'electron'
import type { DesktopAppearance } from '../shared/types'

export function getAppearance(): DesktopAppearance {
  const desktop = (process.env.XDG_CURRENT_DESKTOP || process.env.DESKTOP_SESSION || '').toLowerCase()
  let accent = process.platform === 'linux' ? '#3584e4' : '#0078d4'
  try {
    const systemAccent = systemPreferences.getAccentColor()
    if (/^[\da-f]{8}$/i.test(systemAccent)) accent = `#${systemAccent.slice(0, 6)}`
  } catch {
    // Some Linux desktops do not expose an accent color through Electron.
  }
  return {
    platform: process.platform,
    desktop: /kde|plasma/.test(desktop) ? 'kde' : /gnome|ubuntu|unity|cinnamon/.test(desktop) ? 'gnome' : 'generic',
    dark: nativeTheme.shouldUseDarkColors,
    accent
  }
}

export function getWindowColors(): { background: string; foreground: string } {
  const dark = nativeTheme.shouldUseDarkColors
  return {
    background: dark ? '#141416' : '#fbfbfb',
    foreground: dark ? '#ededef' : '#17171a'
  }
}

export function platformWindowOptions(): BrowserWindowConstructorOptions {
  const colors = getWindowColors()
  if (process.platform === 'win32') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: colors.background, symbolColor: colors.foreground, height: 44 }
    }
  }
  if (process.platform === 'darwin') {
    return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 } }
  }
  // Let the Linux window manager place and draw its own caption buttons.
  return { titleBarStyle: 'default' }
}

export function updateWindowAppearance(window: BrowserWindow): void {
  if (window.isDestroyed()) return
  const colors = getWindowColors()
  window.setBackgroundColor(colors.background)
  if (process.platform === 'win32') {
    window.setTitleBarOverlay({ color: colors.background, symbolColor: colors.foreground, height: 44 })
  }
  window.webContents.send('appearance:changed', getAppearance())
}

export function installApplicationMenu(): void {
  const mac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(mac ? [{ role: 'appMenu' as const }] : []),
    { label: 'File', submenu: [mac ? { role: 'close' } : { role: 'quit' }] },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(!app.isPackaged ? [{ type: 'separator' as const }, { role: 'toggleDevTools' as const }] : [])
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
