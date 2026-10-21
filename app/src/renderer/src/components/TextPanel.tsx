import { useEffect, useMemo, useState, type JSX } from 'react'
import { hexToRgb } from '../lib/color'
import { buildTextPacket, type TextPacket, type TextStyle } from '../lib/protocol'
import type { PreviewContent } from '../lib/preview'
import { rasterizeText, type RasterizedText } from '../lib/textRaster'
import { Icon } from './Icons'
import { ColorField, RangeField, Segmented } from './ui'

const TEXT_MODES = [
  { value: 0, label: 'Static' },
  { value: 1, label: 'Marquee left' },
  { value: 2, label: 'Marquee right' },
  { value: 3, label: 'Rise up' },
  { value: 4, label: 'Drop down' },
  { value: 5, label: 'Blink' },
  { value: 6, label: 'Fade' },
  { value: 7, label: 'Tetris' },
  { value: 8, label: 'Fill' }
]

const PRESETS = ['HELLO', 'GOOD VIBES', 'OPEN DOT', '23:59']

export function TextPanel({
  busy,
  onPreview,
  onSend
}: {
  busy: boolean
  onPreview: (content: PreviewContent) => void
  onSend: (packet: TextPacket) => Promise<void>
}): JSX.Element {
  const [text, setText] = useState('OPEN DOT MATRIX')
  const [mode, setMode] = useState(1)
  const [speed, setSpeed] = useState(70)
  const [colorMode, setColorMode] = useState(0)
  const [color, setColor] = useState('#d8ff63')
  const [backgroundMode, setBackgroundMode] = useState(0)
  const [background, setBackground] = useState('#000000')
  const [raster, setRaster] = useState<RasterizedText | null>(null)

  const style = useMemo<TextStyle>(
    () => ({
      mode,
      speed,
      colorMode,
      color: hexToRgb(color),
      backgroundMode,
      background: hexToRgb(background)
    }),
    [mode, speed, colorMode, color, backgroundMode, background]
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = rasterizeText(text, style)
      setRaster(next)
      onPreview(next.preview)
    }, 60)
    return () => window.clearTimeout(timer)
  }, [text, style, onPreview])

  const packet = useMemo(() => {
    if (!raster || text.length === 0) return null
    return buildTextPacket(text, raster.glyphs, style)
  }, [raster, text, style])

  async function send(): Promise<void> {
    if (!packet || !raster) return
    onPreview({ ...raster.preview, detail: 'Sending 1-bit glyph strip…' })
    try {
      await onSend(packet)
    } finally {
      onPreview(raster.preview)
    }
  }

  return (
    <div className="work-panel">
      <header className="work-head">
        <div>
          <span className="eyebrow">03 / Text</span>
          <h2>Type in pixels, not fonts.</h2>
          <p>
            Each character becomes a 1-bit glyph cell: 32×64 for Latin, 64×64 for CJK and other
            wide scripts. The device handles the animation.
          </p>
        </div>
        <span className="work-badge">1-bit glyphs · 14 B meta</span>
      </header>

      <div className="editor-grid">
        <div className="editor-main">
          <div className="text-input-wrap">
            <label className="field-label" htmlFor="panel-text">
              Message
            </label>
            <textarea
              id="panel-text"
              rows={3}
              maxLength={80}
              value={text}
              spellCheck={false}
              placeholder="Type something for the matrix…"
              onChange={(event) => setText(event.target.value)}
            />
            <div className="text-input-foot">
              <span>{text.length} / 80 characters</span>
              <span>{raster ? `${raster.glyphs.length} glyphs` : 'Ready'}</span>
            </div>
          </div>

          <div className="preset-row">
            <span>Try</span>
            {PRESETS.map((preset) => (
              <button key={preset} type="button" onClick={() => setText(preset)}>
                {preset}
              </button>
            ))}
          </div>

          <div className="packet-strip">
            <span>
              <Icon name="text" size={14} />
              {packet ? `${packet.payload.length.toLocaleString()} payload bytes` : 'No glyphs'}
            </span>
            <span>
              {packet ? `${packet.chunks.length} protocol chunk${packet.chunks.length === 1 ? '' : 's'}` : '—'}
            </span>
            <span>{text.length} UTF-16 units</span>
          </div>
        </div>

        <div className="editor-side">
          <label className="field">
            <span className="field-label">Motion</span>
            <select value={mode} onChange={(event) => setMode(Number(event.target.value))}>
              {TEXT_MODES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <RangeField
            label="Speed"
            value={speed}
            min={5}
            max={100}
            onChange={setSpeed}
            display={`${speed}%`}
          />

          <div className="field-group">
            <span className="field-label">Ink</span>
            <Segmented
              value={colorMode}
              options={[
                { value: 0, label: 'Single' },
                { value: 1, label: 'Rainbow' }
              ]}
              onChange={setColorMode}
              label="Text color mode"
            />
          </div>
          <ColorField
            label="Text color"
            value={color}
            onChange={setColor}
            disabled={colorMode === 1}
          />

          <div className="field-group">
            <span className="field-label">Background</span>
            <Segmented
              value={backgroundMode}
              options={[
                { value: 0, label: 'Black' },
                { value: 1, label: 'Custom' }
              ]}
              onChange={setBackgroundMode}
              label="Text background mode"
            />
          </div>
          <ColorField
            label="Background color"
            value={background}
            onChange={setBackground}
            disabled={backgroundMode === 0}
          />
        </div>
      </div>

      <footer className="action-row">
        <span className="action-hint">
          <Icon name="text" size={14} />
          Pure black is nudged to blue 1 so the panel never drops the glyph.
        </span>
        <button
          type="button"
          className="btn btn-primary send-button"
          disabled={!packet || busy}
          onClick={() => void send()}
        >
          <Icon name="upload" size={16} />
          {busy ? 'Sending…' : 'Send text'}
        </button>
      </footer>
    </div>
  )
}
