import { describe, expect, it } from 'vitest'

import {
  GLIDE_MS,
  MIN_CATCH_UP_MS,
  easeOut,
  glidePosition,
  glideTo,
  glides,
  retarget,
  still,
} from './cursorGlide'
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
    const glide = {
      fromX: 0,
      fromY: 0,
      toX: 100,
      toY: 20,
      start: 1000,
      duration: GLIDE_MS,
      set: 1000,
    }
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
    const glide = retarget(still({ x: 0, y: 0 }, 0), { x: 30, y: 0 }, 1000, true, LINE, WIDTH)
    expect(glide).toMatchObject({ fromX: 0, toX: 30, start: 1000, duration: GLIDE_MS })
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

describe('catching up', () => {
  /** The cursor drawn `after` ms after each of `steps` moves of `step` px every `every` ms. */
  function lags(step: number, every: number, steps: number, after: number): number[] {
    let glide = still({ x: 0, y: 0 }, 0)
    const lag: number[] = []
    for (let i = 1; i <= steps; i++) {
      const to = { x: i * step, y: 0 }
      glide = retarget(glide, to, i * every, true, LINE, WIDTH)
      lag.push(to.x - glidePosition(glide, i * every + after).x)
    }
    return lag
  }

  it('glides from rest as long as ever, from the next frame on', () => {
    const glide = retarget(still({ x: 0, y: 0 }, 0), { x: 30, y: 0 }, 1000, true, LINE, WIDTH)
    expect(glide).toMatchObject({ start: 1000, duration: GLIDE_MS })
    expect(glidePosition(glide, 1000).x).toBe(0)
  })

  it('takes 1.5 times the time since the place before, from the frame it is drawn', () => {
    const first = retarget(still({ x: 0, y: 0 }, 0), { x: 30, y: 0 }, 1000, true, LINE, WIDTH)
    const next = retarget(first, { x: 60, y: 0 }, 1030, true, LINE, WIDTH)
    // ends 45 ms after the new place, and moves at once
    expect(next.start + next.duration).toBeCloseTo(1030 + 45)
    expect(glidePosition(next, 1030).x).toBeGreaterThan(glidePosition(first, 1030).x)
    // never quicker than the minimum, never slower than a glide from rest
    const quick = retarget(first, { x: 60, y: 0 }, 1005, true, LINE, WIDTH)
    expect(quick.start + quick.duration).toBeCloseTo(1005 + MIN_CATCH_UP_MS)
    const slow = retarget(first, { x: 60, y: 0 }, 1100, true, LINE, WIDTH)
    expect(slow.start + slow.duration).toBeCloseTo(1100 + GLIDE_MS)
  })

  it('catches up also when the glide before just ended, within 90 ms of its place', () => {
    const first = retarget(still({ x: 0, y: 0 }, 0), { x: 30, y: 0 }, 1000, true, LINE, WIDTH)
    const short = retarget(first, { x: 60, y: 0 }, 1030, true, LINE, WIDTH)
    // ended at 1075; the next place at 1080
    const late = retarget(short, { x: 90, y: 0 }, 1080, true, LINE, WIDTH)
    // 1.5 × 50 ms since the place before
    expect(late.start + late.duration).toBeCloseTo(1080 + 75)
    // on from where the glide before ended, not a whole frame early
    expect(late.start).toBeCloseTo(1075)
    // longer than 90 ms: from rest
    const rest = retarget(short, { x: 90, y: 0 }, 1125, true, LINE, WIDTH)
    expect(rest).toMatchObject({ start: 1125, duration: GLIDE_MS })
    // a snap is no glide to catch up with
    const snap = retarget(still({ x: 0, y: 0 }, 1000), { x: 30, y: 0 }, 1030, true, LINE, WIDTH)
    expect(snap).toMatchObject({ start: 1030, duration: GLIDE_MS })
  })

  it('keeps a cursor typed out unevenly close', () => {
    // 8 characters of 8 px after 32 or 64 ms in turn; one frame after each step
    let glide = still({ x: 0, y: 0 }, 0)
    let time = 0
    const lag: number[] = []
    for (let i = 1; i <= 40; i++) {
      time += i % 2 ? 32 : 64
      glide = retarget(glide, { x: i * 64, y: 0 }, time, true, LINE, WIDTH)
      lag.push(i * 64 - glidePosition(glide, time + 1000 / 60).x)
    }
    expect(lag.slice(5).reduce((a, b) => a + b, 0) / 35).toBeLessThan(3 * 8)
  })

  it('keeps a cursor typed out quickly within about a character', () => {
    // a reveal: 8 characters of 8 px every 30 ms; one frame after each step
    const lag = lags(64, 30, 40, 1000 / 60).slice(5)
    expect(Math.max(...lag)).toBeLessThan(1.5 * 8)
    expect(lag.reduce((a, b) => a + b, 0) / lag.length).toBeLessThan(8)
  })

  it('lets the other end of a selection catch up alike', () => {
    const first = glideTo(still({ x: 0, y: 0 }, 0), { x: 30, y: 0 }, 1000)
    expect(first.duration).toBe(GLIDE_MS)
    const next = glideTo(first, { x: 60, y: 0 }, 1030)
    expect(next.start + next.duration).toBeCloseTo(1030 + 45)
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
