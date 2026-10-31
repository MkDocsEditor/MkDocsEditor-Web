import { describe, expect, it } from 'vitest'

import { applyChangesToRuns, codePointToUtf16, runsFromCodePoints } from './authorRuns'

describe('code point conversion', () => {
  it('counts surrogate pairs as one code point', () => {
    const text = 'a😀b🎉c'
    expect(codePointToUtf16(text, 0)).toBe(0)
    expect(codePointToUtf16(text, 2)).toBe(3)
    expect(codePointToUtf16(text, 4)).toBe(6)
    expect(codePointToUtf16(text, 99)).toBe(text.length)
  })

  it('converts server runs to UTF-16 runs', () => {
    const text = 'Anna 😀 Ben'
    const runs = runsFromCodePoints(text, [
      { start: 7, end: 10, username: 'ben' },
      { start: 0, end: 7, username: 'anna' },
    ])
    expect(runs).toEqual([
      { from: 0, to: 8, username: 'anna' },
      { from: 8, to: 11, username: 'ben' },
    ])
  })
})

describe('applyChangesToRuns', () => {
  const runs = [
    { from: 0, to: 5, username: 'anna' },
    { from: 5, to: 10, username: 'ben' },
  ]

  it('shifts runs after an insertion and attributes the new text', () => {
    expect(applyChangesToRuns(runs, [{ from: 5, to: 5, insert: 'XY' }], 'carla')).toEqual([
      { from: 0, to: 5, username: 'anna' },
      { from: 5, to: 7, username: 'carla' },
      { from: 7, to: 12, username: 'ben' },
    ])
  })

  it('splits a run when typing inside it and merges with the same author', () => {
    expect(applyChangesToRuns(runs, [{ from: 2, to: 2, insert: 'a' }], 'anna')).toEqual([
      { from: 0, to: 6, username: 'anna' },
      { from: 6, to: 11, username: 'ben' },
    ])
    expect(applyChangesToRuns(runs, [{ from: 2, to: 2, insert: 'b' }], 'ben')).toEqual([
      { from: 0, to: 2, username: 'anna' },
      { from: 2, to: 3, username: 'ben' },
      { from: 3, to: 6, username: 'anna' },
      { from: 6, to: 11, username: 'ben' },
    ])
  })

  it('removes deleted text across runs', () => {
    expect(applyChangesToRuns(runs, [{ from: 3, to: 7, insert: '' }], null)).toEqual([
      { from: 0, to: 3, username: 'anna' },
      { from: 3, to: 6, username: 'ben' },
    ])
  })

  it('applies sequential changes in order', () => {
    const result = applyChangesToRuns(
      [],
      [
        { from: 0, to: 0, insert: 'abc' },
        { from: 3, to: 3, insert: 'de' },
      ],
      'anna',
    )
    expect(result).toEqual([{ from: 0, to: 5, username: 'anna' }])
  })
})
