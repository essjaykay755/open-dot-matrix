import { useEffect, useMemo, useState, type JSX } from 'react'
import { hexToRgb } from '../lib/color'
import { buildTextPacket, type TextPacket, type TextStyle } from '../lib/protocol'
import type { PreviewContent } from '../lib/preview'
import { rasterizeText, type RasterizedText } from '../lib/textRaster'
import { Icon } from './Icons'
import { ColorField, Group, RangeField, Segmented, Tool } from './ui'

const TEXT_MODES = [
  { value: 0, label: 'Static' },
  { value: 1, label: 'Scroll ←' },
  { value: 2, label: 'Scroll →' },
  { value: 3, label: 'Rise' },
  { value: 4, label: 'Drop' },
  { value: 5, label: 'Blink' },
  { value: 6, label: 'Fade' },
  { value: 7, label: 'Tetris' },
  { value: 8, label: 'Fill' }
]

export function TextPanel({
  busy,
  connected,
  onPreview,
  onSend
}: {
  busy: boolean
  connected: boolean
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
    <Tool
      title="Text"
      description="Write a message and choose how it moves. Glyphs are rendered on your computer, then sent as a strip."
      status={text.length ? { tone: 'ready', label: 'Ready to send' } : { tone: 'idle', label: 'Empty message' }}
      side={
        <>
          <Group label="Speed">
            <RangeField label="Animation speed" value={speed} min={5} max={100} onChange={setSpeed} display={`${speed}%`} />
          </Group>
          <Group label="Ink">
            <Segmented
              value={colorMode}
              options={[
                { value: 0, label: 'Solid' },
                { value: 1, label: 'Rainbow' }
              ]}
              onChange={setColorMode}
              label="Text color mode"
            />
            {colorMode === 0 && <ColorField label="Text color" value={color} onChange={setColor} />}
          </Group>
          <Group label="Background">
            <Segmented
              value={backgroundMode}
              options={[
                { value: 0, label: 'Black' },
                { value: 1, label: 'Custom' }
              ]}
              onChange={setBackgroundMode}
              label="Text background mode"
            />
            {backgroundMode === 1 && <ColorField label="Background color" value={background} onChange={setBackground} />}
          </Group>
        </>
      }
      summary={
        packet ? (
          <>
            <strong>{text.length} characters</strong>
            <span>{TEXT_MODES.find((option) => option.value === mode)?.label} · {speed}% speed</span>
          </>
        ) : (
          <span>Type a message to continue</span>
        )
      }
      actions={
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!packet || busy || !connected}
          onClick={() => void send()}
        >
          {busy ? 'Sending…' : 'Send to panel'}
          <Icon name="upload" size={16} />
        </button>
      }
    >
      <div className="text-input-wrap">
        <textarea
          id="message-text"
          aria-label="Message"
          rows={3}
          maxLength={80}
          value={text}
          spellCheck={false}
          placeholder="Type something for the matrix…"
          onChange={(event) => setText(event.target.value)}
        />
        <span className="text-count">{text.length} / 80</span>
      </div>
      <Group label="Motion">
        <Segmented value={mode} options={TEXT_MODES} onChange={setMode} label="Text motion" columns={3} />
      </Group>
    </Tool>
  )
}
