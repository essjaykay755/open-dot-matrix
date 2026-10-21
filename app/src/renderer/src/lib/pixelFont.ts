import type { Rgb } from './protocol'

// Hand-drawn bitmap fonts for crisp text on the 64×64 panel. '#' is a lit pixel.

const SMALL: Record<string, string[]> = {
  A: ['###', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['###', '#..', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['###', '#..', '#.#', '#.#', '###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '###'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['###', '#.#', '###', '#..', '#..'],
  Q: ['###', '#.#', '#.#', '###', '..#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['###', '#..', '###', '..#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '###', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  '-': ['...', '...', '###', '...', '...'],
  '.': ['...', '...', '...', '...', '.#.'],
  ',': ['...', '...', '...', '.#.', '#..'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  "'": ['.#.', '.#.', '...', '...', '...'],
  '°': ['##.', '##.', '...', '...', '...'],
  ' ': ['.', '.', '.', '.', '.']
}

const LARGE: Record<string, string[]> = {
  '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '-': ['.....', '.....', '.....', '####.', '.....', '.....', '.....'],
  '°': ['.##.', '#..#', '#..#', '.##.', '....', '....', '....']
}

export type FontSize = 'small' | 'large'

export interface TextOptions {
  size?: FontSize
  scale?: number
  spacing?: number
}

function glyphFor(character: string, size: FontSize): string[] | null {
  const table = size === 'large' ? LARGE : SMALL
  return table[character] ?? table[character.toUpperCase()] ?? null
}

/** Uppercases, strips accents and drops characters the bitmap font cannot draw. */
export function normalizeForFont(text: string, size: FontSize = 'small'): string {
  return Array.from(text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase())
    .filter((character) => glyphFor(character, size) !== null)
    .join('')
}

export function measureText(text: string, options: TextOptions = {}): number {
  const size = options.size ?? 'small'
  const scale = options.scale ?? 1
  const spacing = options.spacing ?? 1
  let width = 0
  let count = 0
  for (const character of text) {
    const glyph = glyphFor(character, size)
    if (!glyph) continue
    width += glyph[0].length * scale
    count += 1
  }
  return count === 0 ? 0 : width + (count - 1) * spacing * scale
}

export function textHeight(options: TextOptions = {}): number {
  return (options.size === 'large' ? 7 : 5) * (options.scale ?? 1)
}

/** Draws text into a 64×64 RGBA buffer. Returns the x position after the last glyph. */
export function drawText(
  data: Uint8ClampedArray,
  text: string,
  x: number,
  y: number,
  color: Rgb | ((column: number, row: number) => Rgb),
  options: TextOptions = {}
): number {
  const size = options.size ?? 'small'
  const scale = options.scale ?? 1
  const spacing = options.spacing ?? 1
  let cursor = x

  for (const character of text) {
    const glyph = glyphFor(character, size)
    if (!glyph) continue
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] !== '#') continue
        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) {
            const px = cursor + column * scale + sx
            const py = y + row * scale + sy
            if (px < 0 || px >= 64 || py < 0 || py >= 64) continue
            const tone = typeof color === 'function' ? color(px - x, py - y) : color
            const offset = (py * 64 + px) * 4
            data[offset] = tone[0]
            data[offset + 1] = tone[1]
            data[offset + 2] = tone[2]
            data[offset + 3] = 255
          }
        }
      }
    }
    cursor += (glyph[0].length + spacing) * scale
  }

  return cursor
}
