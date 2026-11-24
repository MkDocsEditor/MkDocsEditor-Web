import { describe, expect, it } from 'vitest'

import {
  GLIDE_MS,
  MIN_CATCH_UP_MS,
  easeOut,
  glidePosition,
  glideSpeed,
  glideTo,
  glides,
  retarget,
  still,
} from './cursorGlide'
import type { Glide } from './cursorGlide'
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
    const glide = retarget(still({ x: 0, y: 0 }, 0), { x: 50, y: 20 }, 1000, true, LINE, WIDTH)
    expect(glidePosition(glide, 1000)).toEqual({ x: 0, y: 0 })
    const half = glidePosition(glide, 1000 + GLIDE_MS / 2)
    expect(half.x).toBeCloseTo(50 * easeOut(0.5))
    expect(half.y).toBeCloseTo(20 * easeOut(0.5))
    // past the half way at half the time: fast start, gentle stop
    expect(half.x).toBeGreaterThan(25)
    expect(glidePosition(glide, 1000 + GLIDE_MS * 2)).toEqual({ x: 50, y: 20 })
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
  const FRAME = 1000 / 60
  const glideFrom = (x: number, now: number) =>
    retarget(still({ x: 0, y: 0 }, 0), { x, y: 0 }, now, true, LINE, WIDTH)

  /** How far the cursor is drawn behind a head that moves `chars` 8 px characters a frame. */
  function lags(chars: (frame: number) => number): number[] {
    let glide = still({ x: 0, y: 0 }, 0)
    let x = 0
    const lag: number[] = []
    for (let k = 1; k <= 120; k++) {
      const time = k * FRAME
      x += chars(k) * 8
      glide = retarget(glide, { x, y: 0 }, time, true, LINE, WIDTH)
      // drawn in the frame the head moved
      if (k > 10) lag.push((x - glidePosition(glide, time).x) / 8)
    }
    return lag
  }

  it('glides from rest with the ease-out, from the next frame on', () => {
    const glide = glideFrom(30, 1000)
    expect(glide).toMatchObject({ start: 1000, duration: GLIDE_MS })
    expect(glidePosition(glide, 1000).x).toBe(0)
    expect(glidePosition(glide, 1000 + GLIDE_MS / 4).x).toBeCloseTo(30 * easeOut(0.25))
  })

  it('goes on from where it is drawn with its speed, and takes 1.5 times the time between', () => {
    const first = glideFrom(30, 1000)
    const next = retarget(first, { x: 60, y: 0 }, 1030, true, LINE, WIDTH)
    expect(next).toMatchObject({ start: 1030, duration: 45 })
    // no jump, no change of speed
    expect(glidePosition(next, 1030).x).toBeCloseTo(glidePosition(first, 1030).x)
    expect(glideSpeed(next, 1030).x).toBeCloseTo(glideSpeed(first, 1030).x)
    // never past its place
    for (let t = 1030; t <= 1080; t += 2) expect(glidePosition(next, t).x).toBeLessThanOrEqual(60)
    expect(glidePosition(next, 1075).x).toBe(60)
    // never quicker than the minimum, never slower than from rest
    expect(retarget(first, { x: 60, y: 0 }, 1005, true, LINE, WIDTH).duration).toBe(MIN_CATCH_UP_MS)
    expect(retarget(first, { x: 60, y: 0 }, 1100, true, LINE, WIDTH).duration).toBe(GLIDE_MS)
  })

  it('keeps only its speed toward the new place, at most that of the ease-out', () => {
    const first = glideFrom(30, 1000)
    // back the other way: it starts from standing
    const back = retarget(first, { x: 0, y: 0 }, 1030, true, LINE, WIDTH)
    expect(glideSpeed(back, 1030).x).toBeCloseTo(0)
    // a tiny step ahead: no faster than the ease-out would start
    const shown = glidePosition(first, 1010).x
    const near = retarget(first, { x: shown + 1, y: 0 }, 1010, true, LINE, WIDTH)
    expect(glideSpeed(near, 1010).x).toBeLessThanOrEqual((3 * 1) / near.duration + 1e-9)
  })

  it('catches up within 90 ms after a glide ended, from its last frame or a frame back', () => {
    const first = glideFrom(30, 1000)
    const short = retarget(first, { x: 60, y: 0 }, 1030, true, LINE, WIDTH)
    // ended at 1075: 10 ms later it starts in this frame
    const soon = retarget(short, { x: 90, y: 0 }, 1085, true, LINE, WIDTH)
    expect(soon).toMatchObject({ start: 1085, duration: 82.5 })
    // 40 ms later, a frame back, so that it moves in its first frame
    const later = retarget(short, { x: 90, y: 0 }, 1115, true, LINE, WIDTH)
    expect(later.start).toBe(1115 - 16)
    expect(later.start + later.duration).toBeCloseTo(1115 + GLIDE_MS)
    expect(glidePosition(later, 1115).x).toBeGreaterThan(60)
    // more than 90 ms: from rest
    expect(retarget(short, { x: 90, y: 0 }, 1125, true, LINE, WIDTH)).toMatchObject({
      start: 1125,
      duration: GLIDE_MS,
    })
    // a jump forgets the time of its place
    const jump = retarget(still({ x: 0, y: 0 }, 1000), { x: 30, y: 0 }, 1030, true, LINE, WIDTH)
    expect(jump).toMatchObject({ start: 1030, duration: GLIDE_MS })
  })

  it('stays 1 to 1.5 characters behind a reveal of a character a frame, never ahead', () => {
    const lag = lags(() => 1)
    expect(Math.max(...lag)).toBeLessThanOrEqual(1.5)
    expect(Math.min(...lag)).toBeGreaterThanOrEqual(1)
  })

  it('stays close behind an uneven reveal, never ahead', () => {
    // 1, 1, 0, 2, … characters a frame: 60 a second on average
    const lag = lags((k) => [1, 1, 0, 2][k % 4]!)
    expect(Math.max(...lag)).toBeLessThanOrEqual(2.5)
    expect(lag.reduce((a, b) => a + b, 0) / lag.length).toBeLessThanOrEqual(1.5)
    expect(Math.min(...lag)).toBeGreaterThanOrEqual(0)
  })

  it('lets the other end of a selection catch up alike', () => {
    const first = glideTo(still({ x: 0, y: 0 }, 0), { x: 30, y: 0 }, 1000)
    expect(first.duration).toBe(GLIDE_MS)
    expect(glideTo(first, { x: 60, y: 0 }, 1030).duration).toBe(45)
  })
})

describe('typing', () => {
  const CHAR = 8
  const step = (before: Glide, x: number, time: number, y = 0) =>
    retarget(before, { x, y }, time, true, LINE, WIDTH, CHAR)

  it('glides a step of up to 3 characters evenly, for 1.5 times the smoothed time between', () => {
    const first = step(still({ x: 0, y: 0 }, 0), 8, 1000)
    // the first step after a rest: the ease-out
    expect(first).toMatchObject({ duration: GLIDE_MS })
    expect(first.typing).toBeUndefined()
    // the first typing step takes the time since the place before: 1.5 × 90 ms, a frame early
    const second = step(first, 16, 1090)
    expect(second).toMatchObject({ typing: true, crisp: 0, start: 1090 - 16, duration: 135 })
    // from where it was drawn, on at an even speed
    const from = glidePosition(first, 1090).x
    expect(second.fromX).toBeCloseTo(from)
    expect(glidePosition(second, 1090).x).toBeCloseTo(from + ((16 - from) * 16) / 135)
    expect(glideSpeed(second, 1120).x).toBeCloseTo((16 - from) / 135)
    // the next 60 ms later: the time between smoothed, 90 + 0.3 × (60 - 90)
    const third = step(second, 24, 1150)
    expect(third).toMatchObject({ interval: 81, duration: 121.5 })
    // at least 32 ms
    expect(step(first, 16, 1010).duration).toBe(32)
  })

  it('takes short ease-out steps for slow keys, and blends in between (R5c)', () => {
    const first = step(still({ x: 0, y: 0 }, 0), 8, 1000)
    // 240 ms between: 100 ms of the ease-out, from now
    const slow = step(first, 16, 1240)
    expect(slow).toMatchObject({ typing: true, crisp: 1, start: 1240, duration: 100 })
    expect(glidePosition(slow, 1290).x).toBeCloseTo(slow.fromX + (16 - slow.fromX) * 0.875)
    // 150 ms between: half of each, lerp(225, 100, 0.5) ms, half a frame early
    const between = step(first, 16, 1150)
    expect(between).toMatchObject({ crisp: 0.5, start: 1150 - 8, duration: 162.5 })
    const t = 0.4
    const way = (glidePosition(between, 1142 + t * 162.5).x - between.fromX) / (16 - between.fromX)
    expect(way).toBeCloseTo(0.5 * t + 0.5 * (1 - (1 - t) ** 3))
  })

  it('keeps the rules of gliding for larger steps, other rows, and after a pause', () => {
    const first = step(still({ x: 0, y: 0 }, 0), 8, 1000)
    expect(step(first, 8 + 4 * CHAR, 1100).typing).toBeUndefined()
    expect(step(first, 8, 1100, LINE).typing).toBeUndefined()
    expect(step(first, 16, 1300).typing).toBeUndefined()
    // without the width of a character: never
    expect(retarget(first, { x: 16, y: 0 }, 1100, true, LINE, WIDTH).typing).toBeUndefined()
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
