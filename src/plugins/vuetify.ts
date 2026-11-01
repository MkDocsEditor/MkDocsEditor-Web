import 'vuetify/styles'

import { createVuetify } from 'vuetify'
import type { ThemeDefinition } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { en } from 'vuetify/locale'

import { CODE_DARK, CODE_LIGHT, codeThemeColors } from './codeColors'

/**
 * The colour scheme of the Android app (`MkDocsEditorTheme`, feature/theme/Color.kt in
 * MkDocsEditor-Android), a Material 3 scheme from the seed colour #689F38. The app bar uses
 * `primary-container`, as the app's top bar does. The code views add their own palette
 * (`codeColors.ts`).
 */
export const LIGHT: ThemeDefinition = {
  dark: false,
  colors: {
    primary: '#386b01',
    'on-primary': '#ffffff',
    'primary-container': '#b7f481',
    'on-primary-container': '#0d2000',
    secondary: '#376a10',
    'on-secondary': '#ffffff',
    'secondary-container': '#b6f48a',
    'on-secondary-container': '#0a2000',
    tertiary: '#0062a0',
    'on-tertiary': '#ffffff',
    error: '#ba1a1a',
    'on-error': '#ffffff',
    background: '#fdfdf5',
    'on-background': '#1a1c18',
    surface: '#fdfdf5',
    'on-surface': '#1a1c18',
    'surface-bright': '#fdfdf5',
    'surface-light': '#f1f1ea',
    'surface-variant': '#e0e4d6',
    'on-surface-variant': '#44483e',
    ...codeThemeColors(CODE_LIGHT),
  },
}

export const DARK: ThemeDefinition = {
  dark: true,
  colors: {
    primary: '#9cd769',
    'on-primary': '#1a3700',
    'primary-container': '#285000',
    'on-primary-container': '#b7f481',
    secondary: '#9bd771',
    'on-secondary': '#173800',
    'secondary-container': '#245100',
    'on-secondary-container': '#b6f48a',
    tertiary: '#9ccaff',
    'on-tertiary': '#003256',
    error: '#ffb4ab',
    'on-error': '#690005',
    background: '#1a1c18',
    'on-background': '#e3e3dc',
    surface: '#1a1c18',
    'on-surface': '#e3e3dc',
    'surface-bright': '#2f312c',
    'surface-light': '#2f312c',
    'surface-variant': '#44483e',
    'on-surface-variant': '#c4c8ba',
    ...codeThemeColors(CODE_DARK),
  },
}

export default createVuetify({
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi },
  },
  locale: {
    locale: 'en',
    messages: { en },
  },
  // Closer to the Android app's Material 3 shapes: pill-shaped buttons, rounder cards.
  defaults: {
    VBtn: { rounded: 'pill' },
    VCard: { rounded: 'lg' },
  },
  theme: {
    defaultTheme: 'system',
    themes: { light: LIGHT, dark: DARK },
  },
})
