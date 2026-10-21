import type { JSX } from 'react'
import { BrandGlyph, DotWordmark } from './BrandMark'

/**
 * Doubles as the window title bar on Windows and macOS, where the native
 * caption is hidden. On Linux the window manager draws its own caption.
 */
export function DesktopTitleBar(): JSX.Element {
  const platform = window.desktop?.platform
  const integrated = platform === 'win32' || platform === 'darwin'
  return (
    <header className={`titlebar ${integrated ? 'is-integrated' : ''}`}>
      <div className="titlebar-inner">
        <BrandGlyph />
        <DotWordmark text="Open Dot Matrix" highlight={['DOT']} />
        <span className="titlebar-tag">Studio</span>
      </div>
    </header>
  )
}
