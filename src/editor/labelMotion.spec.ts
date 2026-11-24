import { describe, expect, it } from 'vitest'

import { DIM_ALPHA, LabelMotion, REST_MS, SIDE_MS, STEADY_MS } from './labelMotion'
import type { LabelPlace } from './labelMotion'

const caret = { left: 100, top: 40, right: 102, bottom: 60 }
/** The label of a cursor at `caret`: above it is y = 26, below y = 60. */
function at(below: boolean, more: Partial<LabelPlace> = {}): LabelPlace {
  return {
    caret,
    width: 50,
    height: 14,
    x: 100,
    below,
    inView: true,
    localCaret: null,
    hover: null,
    ...more,
  }
}

describe('LabelMotion (R9)', () => {
  it('goes below at once, and back above only after a rest', () => {
    const labels = new LabelMotion()
    expect(labels.place('a', at(false), 0, true).y).toBe(26)
    labels.moved('a', false, 10)
    expect(labels.place('a', at(true), 10, true).y).toBe(26)
    // the side changes in 120 ms with the cubic ease-out, from where it is
    expect(labels.place('a', at(true), 10 + SIDE_MS / 2, true).y).toBeCloseTo(
      26 + 34 * (1 - 0.5 ** 3),
    )
    expect(labels.place('a', at(true), 10 + SIDE_MS, true).y).toBe(60)
    // the writer goes on: it stays below
    labels.moved('a', false, 500)
    expect(labels.place('a', at(false), 600, true).y).toBe(60)
    expect(labels.place('a', at(false), 500 + REST_MS - 1, true).y).toBe(60)
    // rested: back above
    labels.place('a', at(false), 500 + REST_MS, true)
    expect(labels.place('a', at(false), 500 + REST_MS + SIDE_MS, true).y).toBe(26)
  })

  it('takes the side of a jump at once', () => {
    const labels = new LabelMotion()
    labels.place('a', at(true), 0, true)
    labels.moved('a', true, 100)
    expect(labels.place('a', at(false), 100, true).y).toBe(26)
  })

  it('fades down after a second of writing without a rest, and shows again after one', () => {
    const labels = new LabelMotion()
    labels.place('a', at(false), 0, true)
    for (let t = 0; t < STEADY_MS; t += 100) {
      labels.moved('a', false, t)
      expect(labels.place('a', at(false), t, true).alpha).toBe(1)
    }
    labels.moved('a', false, STEADY_MS)
    labels.place('a', at(false), STEADY_MS, true)
    expect(labels.place('a', at(false), STEADY_MS + 100, true).alpha).toBeCloseTo(
      1 - (1 - DIM_ALPHA) / 2,
    )
    expect(labels.place('a', at(false), STEADY_MS + 200, true).alpha).toBe(DIM_ALPHA)
    expect(labels.waitMs(STEADY_MS + 200)).toBe(REST_MS - 200)
    labels.place('a', at(false), STEADY_MS + REST_MS, true)
    expect(labels.place('a', at(false), STEADY_MS + REST_MS + 200, true).alpha).toBe(1)
    expect(labels.waitMs(STEADY_MS + REST_MS + 200)).toBeNull()
  })

  it('fades down over the cursor of the person here, and shows under the mouse', () => {
    const labels = new LabelMotion()
    const local = { left: 120, top: 28, right: 121, bottom: 40 }
    labels.place('a', at(false), 0, true)
    labels.place('a', at(false, { localCaret: local }), 10, true)
    expect(labels.place('a', at(false, { localCaret: local }), 210, true).alpha).toBe(DIM_ALPHA)
    // 8 px around the cursor
    const hover = { x: 108, y: 50 }
    labels.place('a', at(false, { localCaret: local, hover }), 300, true)
    expect(labels.place('a', at(false, { localCaret: local, hover }), 500, true).alpha).toBe(1)
  })

  it('without animations, takes the side its cursor needs and shows', () => {
    const labels = new LabelMotion()
    labels.place('a', at(false), 0, true)
    labels.moved('a', false, 10)
    expect(labels.place('a', at(true), 10, false)).toEqual({ y: 60, alpha: 1 })
    expect(labels.place('a', at(false), 20, false)).toEqual({ y: 26, alpha: 1 })
  })
})
