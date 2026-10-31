import { describe, expect, it } from 'vitest'

import { mountWithPlugins } from '@/test/mount'

import App from './App.vue'

describe('App', () => {
  it('renders the app bar', async () => {
    const { wrapper } = await mountWithPlugins(App)
    expect(wrapper.text()).toContain('MkDocsEditor')
    wrapper.unmount()
  })
})
