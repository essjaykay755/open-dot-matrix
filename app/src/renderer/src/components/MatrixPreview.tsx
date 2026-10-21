import { useEffect, useRef, type JSX } from 'react'
import type { PreviewContent } from '../lib/preview'
import { Icon } from './Icons'

export function MatrixPreview({ content, live }: { content: PreviewContent; live: boolean }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glowRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const contexts = [canvasRef.current, glowRef.current]
      .map((canvas) => canvas?.getContext('2d'))
      .filter((context): context is CanvasRenderingContext2D => Boolean(context))
    if (contexts.length === 0) return
    for (const context of contexts) context.imageSmoothingEnabled = false

    let cancelled = false
    let frameIndex = 0
    let timer = 0

    const draw = (): void => {
      const frame = content.frames[frameIndex % content.frames.length]
      if (!frame) return
      const image = new ImageData(new Uint8ClampedArray(frame.data), 64, 64)
      for (const context of contexts) context.putImageData(image, 0, 0)
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

  const idle = content.label === 'Standby'

  return (
    <section className="card preview-card" aria-label="Preview">
      <header className="card-head">
        <h2>Preview</h2>
        <span className={`live-tag ${live ? 'is-live' : ''}`}>
          <span />
          {live ? 'Live' : 'Offline'}
        </span>
      </header>

      <div className="matrix-frame">
        <canvas ref={glowRef} className="matrix-glow" width={64} height={64} aria-hidden="true" />
        <div className="matrix-bezel">
          <div className="matrix-stage" role="img" aria-label={`${content.label} preview`}>
            <canvas ref={canvasRef} width={64} height={64} />
            <span className="matrix-grid" />
          </div>
        </div>
      </div>

      <footer className="preview-meta">
        <div className="preview-copy">
          <strong title={content.label}>{idle ? 'Standby' : content.label}</strong>
          <span>{idle ? 'Pick a tool to start creating' : content.detail ?? '64 × 64 RGB'}</span>
        </div>
        {content.frames.length > 1 && (
          <span className="frame-badge" title={`${content.frames.length} frames`}>
            <Icon name="play" size={9} />
            {content.frames.length}
          </span>
        )}
      </footer>
    </section>
  )
}
