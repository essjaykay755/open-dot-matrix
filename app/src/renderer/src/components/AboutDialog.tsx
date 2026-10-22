import { useEffect, useRef, useState, type JSX, type MouseEvent } from 'react'
import { CREATOR_HANDLE, CREATOR_NAME, CREATOR_PROFILES, type CreatorProfile } from '../../../shared/creator'
import { BrandGlyph, DotWordmark } from './BrandMark'
import { Icon } from './Icons'

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (open && !dialog?.open) dialog?.showModal()
    else if (!open && dialog?.open) dialog.close()
  }, [open])

  function openProfile(event: MouseEvent<HTMLAnchorElement>, profile: CreatorProfile): void {
    if (!window.desktop) return
    event.preventDefault()
    setLinkError(null)
    void window.desktop.openCreatorProfile(profile).catch(() => {
      setLinkError(`Could not open your browser. Visit ${CREATOR_PROFILES[profile].url}`)
    })
  }

  return (
    <dialog
      ref={dialogRef}
      className="about-dialog"
      aria-labelledby="about-title"
      aria-describedby="about-description"
      onClose={() => { setLinkError(null); onClose() }}
      onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }}
    >
      <div className="about-content">
        <div className="about-topline">
          <span className="label">About the studio</span>
          <button type="button" className="icon-button about-close" aria-label="Close About" onClick={onClose} autoFocus>
            <Icon name="close" size={17} />
          </button>
        </div>

        <div className="about-identity">
          <BrandGlyph />
          <span className="about-version">Version {__APP_VERSION__}</span>
        </div>
        <h2 id="about-title" className="about-wordmark">
          <DotWordmark text="Open Dot Matrix" highlight={['DOT']} />
        </h2>
        <p id="about-description" className="about-description">
          A little studio for a world of pixels. Images, motion, text and live weather for your 64 × 64 display.
        </p>

        <div className="about-creator">
          <span className="label">Created by</span>
          <p className="about-name">{CREATOR_NAME}</p>
          <p className="about-handle">@{CREATOR_HANDLE}</p>
        </div>

        <div className="about-profiles">
          {(['github', 'x'] as const).map((profile) => (
            <a
              key={profile}
              className="about-profile"
              href={CREATOR_PROFILES[profile].url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${CREATOR_PROFILES[profile].label} @${CREATOR_HANDLE} (opens in browser)`}
              onClick={(event) => openProfile(event, profile)}
            >
              <Icon name={profile} size={19} />
              <span>{CREATOR_PROFILES[profile].label}</span>
              <Icon name="external" size={15} />
            </a>
          ))}
        </div>
        {linkError && <p className="about-link-error" role="alert">{linkError}</p>}
        <p className="about-footer">Made for the joy of making things light up.</p>
      </div>
    </dialog>
  )
}
