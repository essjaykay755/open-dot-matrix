import { useEffect, useState, type JSX } from 'react'
import { hexToRgb } from '../lib/color'
import { adaptGif, type AdaptedGif } from '../lib/gif'
import type { FitMode } from '../lib/image'
import { idlePreview, type PreviewContent } from '../lib/preview'
import { Icon } from './Icons'
import { ColorField, DropZone, Segmented, Spinner, ToggleRow, formatBytes } from './ui'

const FIT_OPTIONS: { value: FitMode; label: string }[] = [
  { value: 'contain', label: 'Fit' },
  { value: 'cover', label: 'Fill' },
  { value: 'stretch', label: 'Stretch' }
]

export function GifPanel({
  busy,
  onPreview,
  onSend
}: {
  busy: boolean
  onPreview: (content: PreviewContent) => void
  onSend: (gifBytes: Uint8Array) => Promise<void>
}): JSX.Element {
  const [file, setFile] = useState<File | null>(null)
  const [adapted, setAdapted] = useState<AdaptedGif | null>(null)
  const [fit, setFit] = useState<FitMode>('contain')
  const [background, setBackground] = useState('#050606')
  const [rotate, setRotate] = useState(false)
  const [pixelate, setPixelate] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setAdapted(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const timer = window.setTimeout(() => {
      void adaptGif(file, {
        fit,
        background: hexToRgb(background),
        rotate,
        pixelate
      })
        .then((result) => {
          if (cancelled) return
          setAdapted(result)
          onPreview(result.preview)
        })
        .catch((reason) => {
          if (cancelled) return
          setAdapted(null)
          setError(reason instanceof Error ? reason.message : String(reason))
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 280)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [file, fit, background, rotate, pixelate, onPreview])

  function acceptFile(nextFile: File): void {
    setError(null)
    if (!nextFile.type.includes('gif') && !nextFile.name.toLowerCase().endsWith('.gif')) {
      setError('Choose a GIF file.')
      return
    }
    if (nextFile.size > 50 * 1024 * 1024) {
      setError('GIFs larger than 50 MB are not supported.')
      return
    }
    setFile(nextFile)
  }

  function clearFile(): void {
    setFile(null)
    setAdapted(null)
    setError(null)
    onPreview(idlePreview())
  }

  async function send(): Promise<void> {
    if (!adapted) return
    onPreview({ ...adapted.preview, detail: 'Sending animated GIF…' })
    try {
      await onSend(adapted.gifBytes)
    } finally {
      onPreview(adapted.preview)
    }
  }

  return (
    <div className="work-panel">
      <header className="work-head">
        <div>
          <span className="eyebrow">02 / Animated GIF</span>
          <h2>Give the grid a heartbeat.</h2>
          <p>
            Chromium decodes every frame, then Open Dot Matrix re-quantizes, resizes, and caps the loop to
            the panel’s 64-frame / 2-second buffer.
          </p>
        </div>
        <span className="work-badge">≤ 64 frames · ≤ 2s</span>
      </header>

      <div className="editor-grid">
        <div className="editor-main">
          <DropZone
            accept="image/gif,.gif"
            file={file}
            icon="gif"
            title="Drop an animated GIF"
            hint="GIF · up to 50 MB · 64×64 output"
            onFile={acceptFile}
            onClear={clearFile}
          />

          {loading && (
            <div className="gif-loading">
              <Spinner label="Decoding, resizing, and quantizing…" />
              <span>Large GIFs may take a moment.</span>
            </div>
          )}

          {error && <p className="inline-error">{error}</p>}

          {adapted && !loading && (
            <div className="gif-stats">
              <div>
                <span>Source</span>
                <strong>
                  {adapted.sourceWidth} × {adapted.sourceHeight}
                </strong>
              </div>
              <div>
                <span>Source frames</span>
                <strong>{adapted.sourceFrameCount}</strong>
              </div>
              <div>
                <span>Output frames</span>
                <strong>{adapted.outputFrameCount}</strong>
              </div>
              <div>
                <span>Loop time</span>
                <strong>{(adapted.durationMs / 1000).toFixed(2)}s</strong>
              </div>
              <div>
                <span>Payload</span>
                <strong>{formatBytes(adapted.gifBytes.length)}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="editor-side">
          <div className="field-group">
            <span className="field-label">Framing</span>
            <Segmented value={fit} options={FIT_OPTIONS} onChange={setFit} label="GIF framing" />
            <p className="field-hint">Fit keeps the full frame; Fill crops to the square.</p>
          </div>
          <ColorField label="Matte color" value={background} onChange={setBackground} />
          <div className="toggle-stack">
            <ToggleRow
              label="Rotate 180°"
              detail="Bake rotation into every frame"
              checked={rotate}
              onChange={setRotate}
            />
            <ToggleRow
              label="Hard pixels"
              detail="Nearest-neighbor downscaling"
              checked={pixelate}
              onChange={setPixelate}
            />
          </div>
          <p className="side-note">
            The GIF is rebuilt at 64×64 with a 256-color palette. Frame timing is rescaled if the
            loop exceeds 2 seconds.
          </p>
        </div>
      </div>

      <footer className="action-row">
        <span className="action-hint">
          <Icon name="play" size={14} />
          Status-ack handshake · automatic one-time retry
        </span>
        <button
          type="button"
          className="btn btn-primary send-button"
          disabled={!adapted || busy || loading}
          onClick={() => void send()}
        >
          <Icon name="upload" size={16} />
          {busy ? 'Sending…' : 'Send GIF'}
        </button>
      </footer>
    </div>
  )
}
