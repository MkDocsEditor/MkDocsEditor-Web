import { describe, expect, it } from 'vitest'

import { GLIDE_MS, easeOut, glidePosition, glides, retarget } from './cursorGlide'
import { selectionRects } from './selectionGlide'

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

describe('retarget', () => {
  it('keeps a glide to the same place, and goes on from where it is drawn to a new one', () => {
    const glide = retarget(
      { fromX: 0, fromY: 0, toX: 0, toY: 0, start: 0 },
      { x: 30, y: 0 },
      1000,
      true,
      LINE,
      WIDTH,
    )
    expect(glide).toMatchObject({ fromX: 0, toX: 30, start: 1000 })
    expect(retarget(glide, { x: 30.2, y: 0 }, 1050, true, LINE, WIDTH)).toBe(glide)
    const on = retarget(glide, { x: 60, y: 0 }, 1000 + GLIDE_MS / 2, true, LINE, WIDTH)
    expect(on.fromX).toBeCloseTo(30 * easeOut(0.5))
    expect(on.toX).toBe(60)
    // without animations it snaps
    expect(retarget(glide, { x: 60, y: 0 }, 1050, false, LINE, WIDTH)).toMatchObject({
      fromX: 60,
      toX: 60,
    })
  })
})

describe('selectionRects', () => {
  const row = (x: number, y: number) => ({ x, y, height: 20 })

  it('fills one row between the ends, also when they passed each other', () => {
    expect(selectionRects(row(10, 0), row(50, 0), 0, 400)).toEqual([
      { left: 10, top: 0, width: 40, height: 20 },
    ])
    expect(selectionRects(row(50, 0), row(10, 0), 0, 400)).toEqual([
      { left: 10, top: 0, width: 40, height: 20 },
    ])
    // a caret: nothing to fill
    expect(selectionRects(row(10, 0), row(10, 0), 0, 400)).toEqual([])
  })

  it('fills to the end of the first row, the rows between and the start of the last', () => {
    expect(selectionRects(row(100, 0), row(30, 72), 0, 400)).toEqual([
      { left: 100, top: 0, width: 300, height: 20 },
      { left: 0, top: 20, width: 400, height: 52 },
      { left: 0, top: 72, width: 30, height: 20 },
    ])
  })
})
