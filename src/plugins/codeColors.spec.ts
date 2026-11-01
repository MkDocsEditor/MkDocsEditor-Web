import { describe, expect, it } from 'vitest'

import {
  CODE_BACKGROUNDS,
  CODE_DARK,
  CODE_LIGHT,
  codeColorName,
  codeThemeColors,
  contrastRatio,
} from './codeColors'
import type { CodePalette } from './codeColors'
import { DARK, LIGHT } from './vuetify'

const AA = 4.5
/** Drawn in the gutter or as the caret, never on the code background. */
const GUTTER = ['lineNumber', 'lineNumberActive', 'cursor']

function textColors(palette: CodePalette): [string, string][] {
  return Object.entries(palette).filter(
    ([key]) => !GUTTER.includes(key) && !(CODE_BACKGROUNDS as readonly string[]).includes(key),
  )
}

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
  })
})

describe.each([
  ['light', CODE_LIGHT, LIGHT.colors!.surface as string],
  ['dark', CODE_DARK, DARK.colors!.surface as string],
])('the %s code palette', (_, palette, surface) => {
  it.each(textColors(palette))(
    '%s meets WCAG AA on the editor and code backgrounds',
    (_, color) => {
      for (const background of [surface, palette.codeBackground, palette.activeLine]) {
        expect(contrastRatio(color, background)).toBeGreaterThanOrEqual(AA)
      }
    },
  )

  it('keeps plain text readable on selections and search matches', () => {
    for (const key of CODE_BACKGROUNDS) {
      expect(contrastRatio(palette.text, palette[key])).toBeGreaterThanOrEqual(AA)
    }
  })

  it('keeps line numbers readable in the gutter', () => {
    for (const color of [palette.lineNumber, palette.lineNumberActive]) {
      expect(contrastRatio(color, surface)).toBeGreaterThanOrEqual(AA)
      expect(contrastRatio(color, palette.activeLine)).toBeGreaterThanOrEqual(AA)
    }
  })

  it('has a visible cursor', () => {
    expect(contrastRatio(palette.cursor, surface)).toBeGreaterThanOrEqual(3)
  })

  it('has the Android values for the shared roles', () => {
    expect(palette.text).toBe(palette === CODE_LIGHT ? '#1a1c18' : '#e3e3dc')
  })

  it('is part of the Vuetify theme', () => {
    expect(codeColorName('activeLine')).toBe('code-active-line')
    const theme = codeThemeColors(palette)
    expect(theme['code-heading']).toBe(palette.heading)
    expect(Object.keys(theme)).toHaveLength(Object.keys(palette).length)
  })
})
