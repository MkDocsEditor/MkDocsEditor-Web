import { createRouter, createWebHistory } from 'vue-router'
import type { Router, RouterHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import LinkView from '@/views/LinkView.vue'
import LoginView from '@/views/LoginView.vue'
import SectionView from '@/views/SectionView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /** Routes are protected by default; set to true for routes reachable without login. */
    public?: boolean
    /** Only for admins. */
    admin?: boolean
    /** Account and admin pages: shown without waiting for the wiki tree. */
    standalone?: boolean
  }
}

export function buildRouter(history: RouterHistory): Router {
  const router = createRouter({
    history,
    routes: [
      { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
      {
        path: '/setup',
        name: 'setup',
        component: LinkView,
        props: { kind: 'setup' },
        meta: { public: true },
      },
      {
        path: '/invite',
        name: 'invite',
        component: LinkView,
        props: { kind: 'invite' },
        meta: { public: true },
      },
      {
        path: '/reset',
        name: 'reset',
        component: LinkView,
        props: { kind: 'reset' },
        meta: { public: true },
      },
      { path: '/', name: 'home', component: SectionView },
      { path: '/section/:id', name: 'section', component: SectionView, props: true },
      {
        path: '/document/:id',
        name: 'document',
        component: () => import('@/views/DocumentView.vue'),
        props: true,
      },
      {
        path: '/account/:tab(profile|security|sessions)?',
        name: 'account',
        component: () => import('@/views/AccountView.vue'),
        props: true,
        meta: { standalone: true },
      },
      {
        path: '/welcome/passkey',
        name: 'passkey-step',
        component: () => import('@/views/PasskeyStepView.vue'),
        meta: { standalone: true },
      },
      {
        path: '/admin/:tab(users|invites|audit|settings)?',
        name: 'admin',
        component: () => import('@/views/AdminView.vue'),
        props: true,
        meta: { standalone: true, admin: true },
      },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  })

  router.beforeEach(async (to) => {
    if (to.meta.public) return true
    const auth = useAuthStore()
    await auth.ensureChecked()
    if (!auth.isLoggedIn) {
      if (auth.setupRequired) return { name: 'setup' }
      return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
    }
    // With require2FA, an account without a second factor only reaches its security settings.
    if (auth.secondFactorSetupRequired && !(to.name === 'account' && to.params.tab === 'security'))
      return { name: 'account', params: { tab: 'security' } }
    if (to.meta.admin && !auth.isAdmin) return { name: 'home' }
    return true
  })

  return router
}

export default buildRouter(createWebHistory(import.meta.env.BASE_URL))
