import { createRouter, createWebHistory } from 'vue-router'
import type { Router, RouterHistory } from 'vue-router'

import { takeJoinTarget } from '@/services/join'
import { useAuthStore } from '@/stores/auth'
import LinkView from '@/views/LinkView.vue'
import LoginView from '@/views/LoginView.vue'
import HomeView from '@/views/HomeView.vue'
import SectionView from '@/views/SectionView.vue'
import { ADMIN_TAB_SECTIONS, SECTION_PATTERN, isAdminSection } from '@/services/settingsSections'

declare module 'vue-router' {
  interface RouteMeta {
    /** Routes are protected by default; set to true for routes reachable without login. */
    public?: boolean
    /** Settings and welcome pages: shown without waiting for the wiki tree. */
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
      {
        path: '/connect',
        name: 'connect',
        component: () => import('@/views/ConnectView.vue'),
        meta: { public: true },
      },
      {
        // Android App Links need exactly this path.
        path: '/join/:id',
        name: 'join',
        component: () => import('@/views/JoinView.vue'),
        props: true,
        meta: { public: true },
      },
      // "What's going on", or the files of the top folder (a setting of the device)
      { path: '/', name: 'home', component: HomeView },
      { path: '/files', name: 'files', component: SectionView },
      { path: '/section/:id', name: 'section', component: SectionView, props: true },
      {
        path: '/document/:id',
        name: 'document',
        component: () => import('@/views/DocumentView.vue'),
        props: true,
      },
      {
        path: '/resource/:id',
        name: 'resource',
        component: () => import('@/views/ResourceView.vue'),
        props: true,
      },
      {
        path: `/settings/:section(${SECTION_PATTERN})?`,
        name: 'settings',
        component: () => import('@/views/SettingsView.vue'),
        props: true,
        meta: { standalone: true },
      },
      // the addresses before the settings page
      {
        path: '/account/:tab(profile|security|sessions)?',
        redirect: (to) => ({
          name: 'settings',
          params: { section: typeof to.params.tab === 'string' ? to.params.tab : 'profile' },
        }),
      },
      {
        path: '/admin/:tab(users|invites|requests|audit|settings)?',
        redirect: (to) => ({
          name: 'settings',
          params: { section: ADMIN_TAB_SECTIONS[String(to.params.tab || 'users')] ?? 'users' },
        }),
      },
      {
        path: '/links/:tab(broken|unused)?',
        name: 'references',
        component: () => import('@/views/ReferencesView.vue'),
        props: true,
      },
      {
        path: '/welcome',
        name: 'welcome',
        component: () => import('@/views/WelcomeView.vue'),
        meta: { standalone: true },
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
    const section = to.name === 'settings' ? String(to.params.section ?? '') : ''
    if (auth.secondFactorSetupRequired && section !== 'security')
      return { name: 'settings', params: { section: 'security' } }
    if (isAdminSection(section) && !auth.isAdmin) return { name: 'settings' }
    // A join link was opened before the sign-in, the passkey step or the invite.
    if (to.name === 'home') {
      const target = takeJoinTarget()
      if (target) return target
    }
    return true
  })

  return router
}

export default buildRouter(createWebHistory(import.meta.env.BASE_URL))
