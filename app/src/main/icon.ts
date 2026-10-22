import { app } from 'electron'
import { join } from 'node:path'

/** Shared by the window and tray; packaged builds copy the PNG into resources. */
export function appIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'build', 'icon.png')
}
