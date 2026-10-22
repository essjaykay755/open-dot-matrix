import type { JSX } from 'react'
import logo from '../assets/logo.svg'

// 5×7 dot glyphs for the wordmark; '#' is a lit LED.
const GLYPHS: Record<string, string[]> = {
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  ' ': ['..', '..', '..', '..', '..', '..', '..']
}

const PITCH = 2.5
const RADIUS = 0.9

/** Renders text as a strip of LEDs; words listed in `highlight` glow in the accent color. */
export function DotWordmark({ text, highlight = [] }: { text: string; highlight?: string[] }): JSX.Element {
  const dots: JSX.Element[] = []
  let column = 0
  const words = text.toUpperCase().split(' ')

  words.forEach((word, wordIndex) => {
    const lit = highlight.includes(word) ? 'is-accent' : 'is-lit'
    for (const char of word) {
      const glyph = GLYPHS[char] ?? GLYPHS[' ']
      glyph.forEach((row, y) => {
        for (let x = 0; x < row.length; x += 1) {
          if (row[x] !== '#') continue
          dots.push(
            <circle
              key={`${column + x}-${y}`}
              className={lit}
              cx={(column + x) * PITCH + PITCH / 2}
              cy={y * PITCH + PITCH / 2}
              r={RADIUS}
            />
          )
        }
      })
      column += glyph[0].length + 1
    }
    if (wordIndex < words.length - 1) column += 2
  })

  const width = (column - 1) * PITCH
  return (
    <svg className="dot-wordmark" width={width} height={7 * PITCH} viewBox={`0 0 ${width} ${7 * PITCH}`} role="img" aria-label={text}>
      {dots}
    </svg>
  )
}

export function BrandGlyph(): JSX.Element {
  return <img className="brand-glyph" src={logo} alt="" aria-hidden="true" />
}
