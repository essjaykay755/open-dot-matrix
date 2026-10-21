import { useEffect, useRef, useState, type JSX } from 'react'
import { hexToRgb } from '../lib/color'
import {
  adaptSource,
  createCalibrationFrame,
  imageDataToRgb,
  imagePreview,
  loadImageFile,
  type FitMode
} from '../lib/image'
import { idlePreview, type PreviewContent } from '../lib/preview'
import { Icon } from './Icons'
import { ColorField, DropZone, Segmented, Spinner, ToggleRow, formatBytes } from './ui'

const FIT_OPTIONS: { value: FitMode; label: string }[] = [
  { value: 'contain', label: 'Fit' },
  { value: 'cover', label: 'Fill' },
  { value: 'stretch', label: 'Stretch' }
]

export function ImagePanel({
  busy,
  onPreview,
  onSend
}: {
  busy: boolean
  onPreview: (content: PreviewContent) => void
  onSend: (rgb: Uint8Array) => Promise<void>
}): JSX.Element {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [adapted, setAdapted] = useState<ImageData | null>(null)
  const [fit, setFit] = useState<FitMode>('contain')
  const [background, setBackground] = useState('#050606')
  const [rotate, setRotate] = useState(false)
  const [pixelate, setPixelate] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bitmapRef = useRef<ImageBitmap | null>(null)

  useEffect(() => {
    return () => {
      bitmapRef.current?.close()
    }
  }, [])

  useEffect(() => {
    if (!bitmap) return
    const next = adaptSource(bitmap, bitmap.width, bitmap.height, {
      fit,
      background: hexToRgb(background),
      rotate,
      pixelate
    })
    setAdapted(next)
    onPreview(
      imagePreview(
        next,
        file?.name ?? 'Image',
        `${bitmap.width}×${bitmap.height} → 64×64 · 12,288 RGB bytes`
      )
    )
  }, [bitmap, file, fit, background, rotate, pixelate, onPreview])

  async function acceptFile(nextFile: File): Promise<void> {
    setError(null)
    if (!nextFile.type.startsWith('image/')) {
      setError('Choose a PNG, JPEG, WebP, BMP, or other raster image.')
      return
    }
    if (nextFile.size > 25 * 1024 * 1024) {
      setError('Images larger than 25 MB are not supported.')
      return
    }

    setLoading(true)
    try {
      const nextBitmap = await loadImageFile(nextFile)
      bitmapRef.current?.close()
      bitmapRef.current = nextBitmap
      setBitmap(nextBitmap)
      setFile(nextFile)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  function clearFile(): void {
    bitmapRef.current?.close()
    bitmapRef.current = null
    setBitmap(null)
    setFile(null)
    setAdapted(null)
    setError(null)
    onPreview(idlePreview())
  }

  function useCalibration(): void {
    bitmapRef.current?.close()
    bitmapRef.current = null
    setBitmap(null)
    setFile(null)
    const frame = createCalibrationFrame()
    setAdapted(frame)
    setError(null)
    onPreview(imagePreview(frame, 'Calibration bars', 'Synthetic 64×64 test pattern · 12,288 RGB bytes'))
  }

  async function send(): Promise<void> {
    if (!adapted) return
    onPreview(
      imagePreview(adapted, file?.name ?? 'Calibration bars', 'Sending full RGB frame…')
    )
    try {
      await onSend(imageDataToRgb(adapted))
    } finally {
      onPreview(
        imagePreview(
          adapted,
          file?.name ?? 'Calibration bars',
          `${bitmap?.width ?? 64}×${bitmap?.height ?? 64} → 64×64 · 12,288 RGB bytes`
        )
      )
    }
  }

  return (
    <div className="work-panel">
      <header className="work-head">
        <div>
          <span className="eyebrow">01 / Image</span>
          <h2>Turn any frame into light.</h2>
          <p>
            RGB888 is adapted to the 64×64 grid, split into three 4,096-byte chunks, and streamed
            through DIY mode.
          </p>
        </div>
        <span className="work-badge">64 × 64 · RGB888</span>
      </header>

      <div className="editor-grid">
        <div className="editor-main">
          <DropZone
            accept="image/*"
            file={file}
            icon="image"
            title="Drop an image or browse"
            hint="PNG, JPEG, WebP, BMP · up to 25 MB"
            onFile={(next) => void acceptFile(next)}
            onClear={clearFile}
          />
          <div className="inline-actions">
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={useCalibration}
              disabled={loading}
            >
              <Icon name="spark" size={14} />
              Load calibration bars
            </button>
            {loading && <Spinner label="Decoding image…" />}
            {adapted && !loading && (
              <span className="ready-note">
                <Icon name="check" size={13} />
                12,288 bytes ready
              </span>
            )}
          </div>
          {error && <p className="inline-error">{error}</p>}
          {file && (
            <div className="source-strip">
              <span>
                <strong>{file.name}</strong>
                {file.type || 'image'}
              </span>
              <span>{formatBytes(file.size)}</span>
              <span>{bitmap ? `${bitmap.width} × ${bitmap.height}` : '—'}</span>
            </div>
          )}
        </div>

        <div className="editor-side">
          <div className="field-group">
            <span className="field-label">Framing</span>
            <Segmented value={fit} options={FIT_OPTIONS} onChange={setFit} label="Image framing" />
            <p className="field-hint">Fit letterboxes, Fill crops, Stretch distorts.</p>
          </div>
          <ColorField label="Matte color" value={background} onChange={setBackground} />
          <div className="toggle-stack">
            <ToggleRow
              label="Rotate 180°"
              detail="Bake rotation into the pixels"
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
        </div>
      </div>

      <footer className="action-row">
        <span className="action-hint">
          <Icon name="monitor" size={14} />
          One frame · 3 protocol chunks · 27 BLE writes
        </span>
        <button
          type="button"
          className="btn btn-primary send-button"
          disabled={!adapted || busy}
          onClick={() => void send()}
        >
          <Icon name="upload" size={16} />
          {busy ? 'Sending…' : 'Send frame'}
        </button>
      </footer>
    </div>
  )
}
