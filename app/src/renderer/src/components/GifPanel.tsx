import { useEffect, useState, type JSX } from 'react'
import { hexToRgb } from '../lib/color'
import { adaptGif, type AdaptedGif } from '../lib/gif'
import type { FitMode } from '../lib/image'
import { idlePreview, type PreviewContent } from '../lib/preview'
import { Icon } from './Icons'
import { ColorField, DropZone, Group, Segmented, Spinner, ToggleRow, Tool, formatBytes } from './ui'

const FIT_OPTIONS: { value: FitMode; label: string }[] = [
  { value: 'contain', label: 'Fit' },
  { value: 'cover', label: 'Fill' },
  { value: 'stretch', label: 'Stretch' }
]

export function GifPanel({
  busy,
  connected,
  onPreview,
  onSend
}: {
  busy: boolean
  connected: boolean
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

  const tone = error ? 'error' : loading ? 'busy' : adapted ? 'ready' : 'idle'
  const statusLabel = error ? 'Needs attention' : loading ? 'Encoding' : adapted ? 'Ready to send' : 'No animation'

  return (
    <Tool
      title="Animation"
      description="Play an animated GIF on loop. Frames are re-timed and re-encoded for the panel."
      status={{ tone, label: statusLabel }}
      side={
        <>
          <Group label="Framing">
            <Segmented value={fit} options={FIT_OPTIONS} onChange={setFit} label="GIF framing" />
          </Group>
          <Group label="Background">
            <ColorField label="Fill behind the animation" value={background} onChange={setBackground} />
          </Group>
          <Group label="Adjust">
            <div className="toggle-stack">
              <ToggleRow label="Rotate 180°" detail="For panels mounted upside down" checked={rotate} onChange={setRotate} />
              <ToggleRow label="Pixelated scaling" detail="Crisp nearest-neighbour edges" checked={pixelate} onChange={setPixelate} />
            </div>
          </Group>
        </>
      }
      summary={
        adapted && !loading ? (
          <>
            <strong>{file?.name}</strong>
            <span>
              {adapted.outputFrameCount} frames · {(adapted.durationMs / 1000).toFixed(2)} s · {formatBytes(adapted.gifBytes.length)}
            </span>
          </>
        ) : (
          <span>{connected ? 'Choose a GIF to continue' : 'Connect a panel or start the demo to send'}</span>
        )
      }
      actions={
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!adapted || busy || loading || !connected}
          onClick={() => void send()}
        >
          {busy ? 'Sending…' : 'Send to panel'}
          <Icon name="upload" size={16} />
        </button>
      }
    >
      <DropZone
        accept="image/gif,.gif"
        file={file}
        icon="gif"
        title="Drop an animated GIF here"
        hint="or click to browse · up to 50 MB, plays up to 64 frames"
        onFile={acceptFile}
        onClear={clearFile}
      />
      {error && <p className="inline-error">{error}</p>}
      {loading && (
        <div className="inline-actions">
          <Spinner label="Preparing frames…" />
        </div>
      )}
    </Tool>
  )
}
