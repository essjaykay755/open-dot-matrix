import type { DesktopBridge } from '../../shared/types'

declare global {
  interface Window {
    desktop?: DesktopBridge
    /** Called by the main process (with a user gesture) to reconnect the remembered panel. */
    __odmAutoConnect?: () => Promise<boolean>
  }
}

export {}
