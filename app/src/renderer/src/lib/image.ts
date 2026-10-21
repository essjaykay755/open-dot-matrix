import type { Rgb } from './protocol'
import { previewFromRgba, type PreviewContent } from './preview'

export type FitMode = 'contain' | 'cover' | 'stretch'

export interface AdaptOptions {
  fit: FitMode
  background: Rgb
  rotate: boolean
  pixelate: boolean
}

export async function loadImageFile(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' })
}

export function adaptSource(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  options: AdaptOptions
): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = getContext(canvas)
  context.fillStyle = `rgb(${options.background.join(',')})`
  context.fillRect(0, 0, 64, 64)
  context.imageSmoothingEnabled = !options.pixelate
  context.imageSmoothingQuality = 'high'

  let width = 64
  let height = 64
  let dx = 0
  let dy = 0

  if (options.fit !== 'stretch') {
    const scaleX = 64 / sourceWidth
    const scaleY = 64 / sourceHeight
    const scale = options.fit === 'contain' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY)
    width = sourceWidth * scale
    height = sourceHeight * scale
    dx = (64 - width) / 2
    dy = (64 - height) / 2
  }

  context.drawImage(source, dx, dy, width, height)

  if (!options.rotate) {
    return context.getImageData(0, 0, 64, 64)
  }

  const rotated = document.createElement('canvas')
  rotated.width = 64
  rotated.height = 64
  const rotatedContext = getContext(rotated)
  rotatedContext.translate(64, 64)
  rotatedContext.rotate(Math.PI)
  rotatedContext.drawImage(canvas, 0, 0)
  return rotatedContext.getImageData(0, 0, 64, 64)
}

export function imageDataToRgb(data: ImageData): Uint8Array {
  const rgb = new Uint8Array(64 * 64 * 3)
  for (let i = 0; i < 64 * 64; i += 1) {
    rgb[i * 3] = data.data[i * 4]
    rgb[i * 3 + 1] = data.data[i * 4 + 1]
    rgb[i * 3 + 2] = data.data[i * 4 + 2]
  }
  return rgb
}

export function imagePreview(image: ImageData, label: string, detail?: string): PreviewContent {
  return previewFromRgba(image.data.slice(), label, detail, 'image')
}

export function createCalibrationFrame(): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = getContext(canvas)
  const bars: Rgb[] = [
    [255, 255, 255],
    [255, 255, 0],
    [0, 255, 255],
    [0, 255, 0],
    [255, 0, 255],
    [255, 0, 0],
    [0, 0, 255],
    [0, 0, 0]
  ]

  bars.forEach((color, index) => {
    context.fillStyle = `rgb(${color.join(',')})`
    context.fillRect(index * 8, 0, 8, 48)
  })

  for (let y = 48; y < 64; y += 1) {
    const value = Math.round(((y - 48) / 15) * 255)
    context.fillStyle = `rgb(${value}, ${value}, ${value})`
    context.fillRect(0, y, 64, 1)
  }

  context.strokeStyle = '#d8ff63'
  context.lineWidth = 1
  context.strokeRect(0.5, 0.5, 63, 63)
  context.fillStyle = '#d8ff63'
  context.fillRect(31, 31, 2, 2)
  return context.getImageData(0, 0, 64, 64)
}

export function createLabelFrame(text: string, accent: Rgb = [216, 255, 99]): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = getContext(canvas)
  context.fillStyle = '#050606'
  context.fillRect(0, 0, 64, 64)
  context.strokeStyle = `rgba(${accent.join(',')}, 0.35)`
  context.lineWidth = 1
  context.strokeRect(4.5, 4.5, 55, 55)
  context.fillStyle = `rgb(${accent.join(',')})`
  context.font = '600 7px "Cascadia Code", "SFMono-Regular", Consolas, monospace'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  const label = text.length > 10 ? `${text.slice(0, 9)}…` : text
  context.fillText(label.toUpperCase(), 32, 31)
  context.fillStyle = 'rgba(255,255,255,0.45)'
  context.font = '500 5px "Cascadia Code", monospace'
  context.fillText('NATIVE MODE', 32, 43)
  return context.getImageData(0, 0, 64, 64)
}

function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas 2D is unavailable')
  return context
}
