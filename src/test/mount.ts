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

const Stub = { render: () => null }

/** The app's named routes with empty components. */
export function stubRoutes(): RouteRecordRaw[] {
  return [
    { path: '/login', name: 'login', component: Stub, meta: { public: true } },
    { path: '/', name: 'home', component: Stub },
    { path: '/section/:id', name: 'section', component: Stub, props: true },
    { path: '/document/:id', name: 'document', component: Stub, props: true },
    { path: '/setup', name: 'setup', component: Stub, meta: { public: true } },
    { path: '/invite', name: 'invite', component: Stub, meta: { public: true } },
    { path: '/reset', name: 'reset', component: Stub, meta: { public: true } },
    {
      path: '/account/:tab?',
      name: 'account',
      component: Stub,
      props: true,
      meta: { standalone: true },
    },
    { path: '/welcome', name: 'welcome', component: Stub, meta: { standalone: true } },
    { path: '/connect', name: 'connect', component: Stub, meta: { public: true } },
    {
      path: '/admin/:tab?',
      name: 'admin',
      component: Stub,
      props: true,
      meta: { standalone: true, admin: true },
    },
  ]
}

/** Mounts a component inside VApp with Vuetify, Pinia and a memory router. */
export async function mountWithPlugins(component: Component, options: MountOptions = {}) {
  const pinia = options.pinia ?? createPinia()
  setActivePinia(pinia)
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: options.routes ?? stubRoutes(),
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
