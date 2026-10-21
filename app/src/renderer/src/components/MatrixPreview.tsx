import { useEffect, useRef, type JSX } from 'react'
import type { PreviewContent } from '../lib/preview'
import { Icon } from './Icons'

export function MatrixPreview({
  content,
  status
}: {
  content: PreviewContent
  status: 'live' | 'demo' | 'idle'
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    context.imageSmoothingEnabled = false

    let cancelled = false
    let frameIndex = 0
    let timer = 0

    const draw = (): void => {
      const frame = content.frames[frameIndex % content.frames.length]
      if (!frame) return
      context.putImageData(new ImageData(new Uint8ClampedArray(frame.data), 64, 64), 0, 0)
      const delay = Math.max(20, frame.delay || 120)
      frameIndex += 1
      if (content.frames.length > 1 && !cancelled) {
        timer = window.setTimeout(draw, delay)
      }
    }

    draw()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [content])

  const statusLabel = status === 'live' ? 'BLE LIVE' : status === 'demo' ? 'DEMO' : 'STANDBY'
  const idle = content.label === 'Standby'
  const label = idle && status === 'demo' ? 'Demo panel' : content.label
  const detail =
    idle && status === 'demo'
      ? 'Local simulation · open a tab to preview'
      : content.detail ?? '64 × 64 LED output'

  return (
    <section className="preview-panel panel">
      <div className="preview-topline">
        <span className="eyebrow">Live preview</span>
        <span className={`status-chip status-${status}`}>
          <span className="status-dot" />
          {statusLabel}
        </span>
      </div>
      <div className="matrix-bezel">
        <div className="matrix-stage" role="img" aria-label={`${content.label} preview`}>
          <canvas ref={canvasRef} width={64} height={64} />
          <span className="matrix-grid" />
          <span className="matrix-glare" />
        </div>
      </div>
      <div className="preview-meta">
        <div>
          <strong>{label}</strong>
          <span>{detail}</span>
        </div>
        {content.frames.length > 1 ? (
          <span className="frame-badge">
            <Icon name="play" size={11} />
            {content.frames.length}
          </span>
        ) : (
          <span className="frame-badge">64×64</span>
        )}
      </div>
    </section>
  )
}
