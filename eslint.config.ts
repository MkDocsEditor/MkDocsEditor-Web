import pluginVitest from '@vitest/eslint-plugin'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import skipFormatting from 'eslint-config-prettier/flat'
import type { Linter } from 'eslint'
import { globalIgnores } from 'eslint/config'
import pluginVue from 'eslint-plugin-vue'

/** Forbids imports from these parts of `src/`. */
function mayNotImport(...layers: string[]): Linter.RulesRecord {
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: layers.map((layer) => ({
          group: [`@/${layer}`, `@/${layer}/*`],
          message: `This layer may not depend on ${layer}: see "Code layout" in the README.`,
        })),
      },
    ],
  }
}

const UI = ['components', 'views']

/** The layers, from the bottom up. Each one only uses those below it. */
const layers = [
  {
    name: 'api',
    files: ['src/api/**'],
    rules: mayNotImport('services', 'markdown', 'sync', 'stores', 'composables', 'editor', ...UI),
  },
  {
    name: 'services',
    files: ['src/services/**'],
    rules: mayNotImport('sync', 'stores', 'composables', 'editor', ...UI),
  },
  {
    // the renderer is also bundled on its own for the Android app
    name: 'markdown renderer',
    files: ['src/markdown/**/*.ts'],
    rules: mayNotImport('api', 'sync', 'stores', 'composables', 'editor', ...UI),
  },
  {
    name: 'sync',
    files: ['src/sync/**'],
    // account.ts is the one place that asks who is signed in
    ignores: ['src/sync/account.ts'],
    rules: mayNotImport('stores', 'composables', 'editor', ...UI),
  },
  { name: 'stores', files: ['src/stores/**'], rules: mayNotImport('composables', 'editor', ...UI) },
  { name: 'composables', files: ['src/composables/**'], rules: mayNotImport(...UI) },
  {
    name: 'components',
    files: ['src/components/**', 'src/editor/**'],
    rules: mayNotImport('views'),
  },
].map(({ name, files, ignores, rules }) => ({
  name: `app/layer-${name}`,
  files,
  // specs may set up whatever they need
  ignores: [...(ignores ?? []), '**/*.spec.ts'],
  rules,
}))

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores([
    '**/dist/**',
    '**/dist-e2e/**',
    '**/dist-preview/**',
    '**/coverage/**',
    '**/playwright-report/**',
    '**/test-results/**',
    '.claude/**',
  ]),

  ...pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,

  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/*', 'src/**/*.spec.ts'],
  },

  ...layers,

  {
    // The design system: see "Design" in the README.
    name: 'app/design',
    files: ['src/**/*.vue'],
    rules: {
      'vue/no-restricted-class': [
        'error',
        // the type scale of Vuetify 2 and 3: these classes do not exist any more and do nothing
        '/^text-(h[1-6]|subtitle-[12]|body-[12]|caption|overline|button)$/',
        // spacing is 4, 8, 16, 24 or 32 pixels
        '/^(m|p)[a-z]?-(3|5|7)$/',
        '/^ga-(3|5|7)$/',
      ],
      'vue/no-restricted-static-attribute': [
        'error',
        {
          key: 'variant',
          value: 'tonal',
          element: 'v-btn',
          message: 'Android has filled, outlined and text buttons.',
        },
        {
          key: 'size',
          value: 'large',
          element: 'v-btn',
          message: 'Buttons are the default size, or small in a row of a list.',
        },
      ],
      'vue/no-restricted-html-elements': [
        'error',
        { element: 'v-dialog', message: 'Use AppDialog, which has the widths of the app.' },
      ],
    },
  },
  {
    name: 'app/design-dialog',
    files: ['src/components/common/AppDialog.vue'],
    rules: { 'vue/no-restricted-html-elements': 'off' },
  },

  skipFormatting,
)
