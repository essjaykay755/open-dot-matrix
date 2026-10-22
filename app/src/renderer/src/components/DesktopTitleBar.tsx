import { useState, type JSX, type MouseEvent } from 'react'
import { version } from '../../../../package.json'
import { REPOSITORY_URL } from '../../../shared/repository'
import { BrandGlyph, DotWordmark } from './BrandMark'
import { AboutDialog } from './AboutDialog'
import { Icon } from './Icons'

/**
 * Doubles as the window title bar on Windows and macOS, where the native
 * caption is hidden. On Linux the window manager draws its own caption.
 */
export function DesktopTitleBar({ onError }: { onError: (message: string) => void }): JSX.Element {
  const [aboutOpen, setAboutOpen] = useState(false)
  const platform = window.desktop?.platform
  const integrated = platform === 'win32' || platform === 'darwin'

  function openRepository(event: MouseEvent<HTMLAnchorElement>): void {
    if (!window.desktop) return
    event.preventDefault()
    void window.desktop.openRepository().catch(() => {
      onError(`Could not open your browser. Visit ${REPOSITORY_URL}`)
    })
  }

  return (
    <>
      <header className={`titlebar ${integrated ? 'is-integrated' : ''}`}>
        <div className="titlebar-inner">
          <BrandGlyph />
          <DotWordmark text="Open Dot Matrix" highlight={['DOT']} />
          <span className="titlebar-tag">Studio</span>
          <span className="titlebar-version" aria-label={`Version ${version}`}>v{version}</span>
          <div className="titlebar-actions">
            <a
              className="titlebar-action"
              href={REPOSITORY_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Open GitHub repository"
              title={REPOSITORY_URL}
              draggable={false}
              onClick={openRepository}
            >
              <Icon name="github" size={14} />
              GitHub
            </a>
            <button
              type="button"
              className="titlebar-action titlebar-about"
              aria-haspopup="dialog"
              onClick={() => setAboutOpen(true)}
            >
              <Icon name="info" size={14} />
              About
            </button>
          </div>
        </div>
      </header>
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  )
}
