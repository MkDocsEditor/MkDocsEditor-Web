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

function textColors(palette: CodePalette): [string, string][] {
  return Object.entries(palette).filter(
    ([key]) => !(CODE_BACKGROUNDS as readonly string[]).includes(key),
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
      for (const background of [surface, palette.background, palette.activeLine]) {
        expect(contrastRatio(color, background)).toBeGreaterThanOrEqual(AA)
      }
    },
  )

  it('keeps plain text readable on selections and search matches', () => {
    for (const key of CODE_BACKGROUNDS) {
      expect(contrastRatio(palette.text, palette[key])).toBeGreaterThanOrEqual(AA)
    }
  })

  it('is part of the Vuetify theme', () => {
    expect(codeColorName('activeLine')).toBe('code-active-line')
    const theme = codeThemeColors(palette)
    expect(theme['code-keyword']).toBe(palette.keyword)
    expect(Object.keys(theme)).toHaveLength(Object.keys(palette).length)
  })
})
