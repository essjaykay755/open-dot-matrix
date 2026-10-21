import type { DesktopAppearance } from '../../../shared/types'

function applyAppearance(appearance: DesktopAppearance): void {
  const root = document.documentElement
  root.dataset.platform = appearance.platform
  root.dataset.desktop = appearance.desktop
  root.dataset.theme = appearance.dark ? 'dark' : 'light'
  if (/^#[\da-f]{6}$/i.test(appearance.accent)) {
    root.style.setProperty('--system-accent', appearance.accent)
    const channels = [1, 3, 5].map((start) => parseInt(appearance.accent.slice(start, start + 2), 16) / 255)
    const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
    root.style.setProperty('--on-accent', luminance <= 0.183 ? '#ffffff' : '#000000')
  }
}

export function initializeAppearance(): void {
  const dark = window.matchMedia('(prefers-color-scheme: dark)')
  const platform = window.desktop?.platform || 'linux'
  applyAppearance({ platform, desktop: 'generic', dark: dark.matches, accent: '#0078d4' })
  if (window.desktop) {
    const unsubscribe = window.desktop.onAppearanceChanged(applyAppearance)
    void window.desktop.getAppearance().then(applyAppearance).catch(() => {
      // The system color scheme remains available if the desktop bridge is unavailable.
    })
    window.addEventListener('beforeunload', unsubscribe, { once: true })
  } else {
    dark.addEventListener('change', () => {
      document.documentElement.dataset.theme = dark.matches ? 'dark' : 'light'
    })
  }
}
