import { describe, expect, it } from 'vitest'

import { GLIDE_MS, easeOut, glidePosition, glides } from './cursorGlide'

const LINE = 20
const WIDTH = 800

describe('cursorGlide', () => {
  it('glides along its line, and one line up or down', () => {
    expect(glides({ x: 100, y: 40 }, { x: 109, y: 40 }, LINE, WIDTH)).toBe(true)
    expect(glides({ x: 100, y: 40 }, { x: 420, y: 40 }, LINE, WIDTH)).toBe(true)
    expect(glides({ x: 100, y: 40 }, { x: 110, y: 60 }, LINE, WIDTH)).toBe(true)
  })

  it('snaps on far jumps, wraps and new lines, and on noise', () => {
    // across most of the line
    expect(glides({ x: 0, y: 40 }, { x: 500, y: 40 }, LINE, WIDTH)).toBe(false)
    // from the end of a line to the start of the next
    expect(glides({ x: 300, y: 40 }, { x: 0, y: 60 }, LINE, WIDTH)).toBe(false)
    // two lines down
    expect(glides({ x: 100, y: 40 }, { x: 100, y: 80 }, LINE, WIDTH)).toBe(false)
    expect(glides({ x: 100, y: 40 }, { x: 100.0001, y: 40 }, LINE, WIDTH)).toBe(false)
  })

  it('eases out from where it is drawn to the new place', () => {
    const glide = { fromX: 0, fromY: 0, toX: 100, toY: 20, start: 1000 }
    expect(glidePosition(glide, 1000)).toEqual({ x: 0, y: 0 })
    const half = glidePosition(glide, 1000 + GLIDE_MS / 2)
    expect(half.x).toBeCloseTo(100 * easeOut(0.5))
    // past the half way at half the time: fast start, gentle stop
    expect(half.x).toBeGreaterThan(50)
    expect(glidePosition(glide, 1000 + GLIDE_MS * 2)).toEqual({ x: 100, y: 20 })
  })
})
