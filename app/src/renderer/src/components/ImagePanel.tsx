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
import { ColorField, DropZone, Group, Segmented, Spinner, ToggleRow, Tool } from './ui'

const FIT_OPTIONS: { value: FitMode; label: string }[] = [
  { value: 'contain', label: 'Fit' },
  { value: 'cover', label: 'Fill' },
  { value: 'stretch', label: 'Stretch' }
]

export function ImagePanel({
  busy,
  connected,
  onPreview,
  onSend
}: {
  busy: boolean
  connected: boolean
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

  const tone = error ? 'error' : loading ? 'busy' : adapted ? 'ready' : 'idle'
  const statusLabel = error ? 'Needs attention' : loading ? 'Decoding' : adapted ? 'Ready to send' : 'No image'

  return (
    <Tool
      title="Image"
      description="Drop in any picture. It is framed, scaled and color-matched to the 64 × 64 panel."
      status={{ tone, label: statusLabel }}
      side={
        <>
          <Group label="Framing">
            <Segmented value={fit} options={FIT_OPTIONS} onChange={setFit} label="Image framing" />
          </Group>
          <Group label="Background">
            <ColorField label="Fill behind the image" value={background} onChange={setBackground} />
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
        adapted ? (
          <>
            <strong>{file?.name ?? 'Calibration bars'}</strong>
            <span>{bitmap ? `${bitmap.width} × ${bitmap.height}` : '64 × 64'} → 64 × 64 · 12,288 bytes</span>
          </>
        ) : (
          <span>{connected ? 'Choose an image to continue' : 'Connect a panel or start the demo to send'}</span>
        )
      }
      actions={
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!adapted || busy || !connected}
          onClick={() => void send()}
        >
          {busy ? 'Sending…' : 'Send to panel'}
          <Icon name="upload" size={16} />
        </button>
      }
    >
      <DropZone
        accept="image/*"
        file={file}
        icon="image"
        title="Drop an image here"
        hint="or click to browse · PNG, JPEG, WebP, BMP up to 25 MB"
        onFile={(next) => void acceptFile(next)}
        onClear={clearFile}
      />
      {error && <p className="inline-error">{error}</p>}
      <div className="inline-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={useCalibration} disabled={loading}>
          <Icon name="spark" size={14} />
          Use test pattern
        </button>
        {loading && <Spinner label="Decoding…" />}
      </div>
    </Tool>
  )
}
