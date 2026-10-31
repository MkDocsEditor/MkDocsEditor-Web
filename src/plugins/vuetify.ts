import 'vuetify/styles'

import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { en } from 'vuetify/locale'

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
  theme: {
    defaultTheme: 'system',
    themes: {
      light: { colors: { primary: '#1565c0', secondary: '#00897b' } },
      dark: { colors: { primary: '#64b5f6', secondary: '#4db6ac' } },
    },
  },
})
