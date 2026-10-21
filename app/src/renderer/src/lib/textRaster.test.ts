import { describe, expect, it } from 'vitest'
import { textScrollDelay } from './textRaster'

describe('text preview timing', () => {
  it('maps panel speed to the device animation cadence', () => {
    expect(textScrollDelay(5)).toBe(253)
    expect(textScrollDelay(70)).toBe(80)
    expect(textScrollDelay(85)).toBe(40)
    expect(textScrollDelay(100)).toBe(20)
  })

  it('clamps speeds outside the firmware range', () => {
    expect(textScrollDelay(0)).toBe(253)
    expect(textScrollDelay(250)).toBe(20)
  })
})
