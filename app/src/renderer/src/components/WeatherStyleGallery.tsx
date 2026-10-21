import { useEffect, useMemo, useRef, type JSX } from 'react'
import type { PreviewFrame } from '../lib/preview'
import type { WeatherLocation, WeatherReport } from '../lib/weather'
import { FRAME_DELAY_MS, renderWeatherFrames, WEATHER_STYLES, type WeatherStyle } from '../lib/weatherArt'

/** Animated thumbnails of every style, drawn from the current weather (or a sample). */
export function WeatherStyleGallery({
  report,
  location,
  value,
  showHighLow,
  showCity,
  animate,
  onChange
}: {
  report: WeatherReport | null
  location: WeatherLocation | null
  value: WeatherStyle
  showHighLow: boolean
  showCity: boolean
  animate: boolean
  onChange: (style: WeatherStyle) => void
}): JSX.Element {
  const source = useMemo(() => report ?? sampleReport(location), [report, location])
  const thumbnails = useMemo(
    () =>
      WEATHER_STYLES.map((style) => ({
        ...style,
        frames: renderWeatherFrames(source, { style: style.id, showHighLow, showCity })
      })),
    [source, showHighLow, showCity]
  )
  const canvases = useRef(new Map<WeatherStyle, HTMLCanvasElement>())

  useEffect(() => {
    let frame = 0
    const draw = (): void => {
      for (const thumbnail of thumbnails) {
        const canvas = canvases.current.get(thumbnail.id)
        drawFrame(canvas, thumbnail.frames[frame % thumbnail.frames.length])
      }
      frame += 1
    }
    draw()
    if (!animate) return
    const timer = window.setInterval(draw, FRAME_DELAY_MS)
    return () => window.clearInterval(timer)
  }, [thumbnails, animate])

  return (
    <div className="weather-styles" role="radiogroup" aria-label="Weather style">
      {thumbnails.map((thumbnail) => (
        <button
          key={thumbnail.id}
          type="button"
          role="radio"
          aria-checked={value === thumbnail.id}
          className={`weather-style ${value === thumbnail.id ? 'is-active' : ''}`}
          onClick={() => onChange(thumbnail.id)}
        >
          <canvas
            width={64}
            height={64}
            aria-hidden="true"
            ref={(canvas) => {
              if (canvas) canvases.current.set(thumbnail.id, canvas)
              else canvases.current.delete(thumbnail.id)
            }}
          />
          <span className="weather-style-label">{thumbnail.label}</span>
          <span className="weather-style-detail">{thumbnail.description}</span>
        </button>
      ))}
    </div>
  )
}

function drawFrame(canvas: HTMLCanvasElement | undefined, frame: PreviewFrame | undefined): void {
  const context = canvas?.getContext('2d')
  if (!context || !frame) return
  context.putImageData(new ImageData(new Uint8ClampedArray(frame.data), 64, 64), 0, 0)
}

function sampleReport(location: WeatherLocation | null): WeatherReport {
  return {
    location: location ?? { name: 'Your city', latitude: 0, longitude: 0 },
    unit: 'celsius',
    temperature: 24,
    feelsLike: 24,
    high: 28,
    low: 19,
    humidity: 60,
    windSpeed: 8,
    code: 2,
    condition: 'partly-cloudy',
    isDay: true,
    observedAt: '',
    fetchedAt: 0
  }
}
