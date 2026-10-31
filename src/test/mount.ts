import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Pinia } from 'pinia'
import { defineComponent, h } from 'vue'
import type { Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { RouteRecordRaw, Router } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export interface MountOptions {
  props?: Record<string, unknown>
  routes?: RouteRecordRaw[]
  initialPath?: string
  pinia?: Pinia
}

/** Mounts a component inside VApp with Vuetify, Pinia and a memory router. */
export async function mountWithPlugins(component: Component, options: MountOptions = {}) {
  const pinia = options.pinia ?? createPinia()
  setActivePinia(pinia)
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: options.routes ?? [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  })
  await router.push(options.initialPath ?? '/')
  await router.isReady()
  const vuetify = createVuetify({ components, directives })
  const Wrapper = defineComponent({
    render: () => h(components.VApp, null, () => h(component, options.props)),
  })
  const wrapper = mount(Wrapper, {
    global: { plugins: [vuetify, pinia, router] },
    attachTo: document.body,
  })
  return { wrapper, router, pinia }
}
