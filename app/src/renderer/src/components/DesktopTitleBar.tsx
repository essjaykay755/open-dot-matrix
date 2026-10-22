import { useState, type JSX } from 'react'
import { BrandGlyph, DotWordmark } from './BrandMark'
import { AboutDialog } from './AboutDialog'
import { Icon } from './Icons'

/**
 * Doubles as the window title bar on Windows and macOS, where the native
 * caption is hidden. On Linux the window manager draws its own caption.
 */
export function DesktopTitleBar(): JSX.Element {
  const [aboutOpen, setAboutOpen] = useState(false)
  const platform = window.desktop?.platform
  const integrated = platform === 'win32' || platform === 'darwin'
  return (
    <>
      <header className={`titlebar ${integrated ? 'is-integrated' : ''}`}>
        <div className="titlebar-inner">
          <BrandGlyph />
          <DotWordmark text="Open Dot Matrix" highlight={['DOT']} />
          <span className="titlebar-tag">Studio</span>
          <button
            type="button"
            className="titlebar-about"
            aria-haspopup="dialog"
            onClick={() => setAboutOpen(true)}
          >
            <Icon name="info" size={14} />
            About
          </button>
        </div>
      </header>
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  )
}
