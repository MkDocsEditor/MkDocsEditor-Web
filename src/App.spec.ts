import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createVuetify } from 'vuetify'
import { createMemoryHistory, createRouter } from 'vue-router'

import App from './App.vue'

describe('App', () => {
  it('renders the app bar', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div>home</div>' } }],
    })
    await router.push('/')
    const wrapper = mount(
      { template: '<v-layout><App /></v-layout>', components: { App } },
      { global: { plugins: [createVuetify(), router] } },
    )
    expect(wrapper.text()).toContain('MkDocsEditor')
  })
})
