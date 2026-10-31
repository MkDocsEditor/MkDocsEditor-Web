import { createRouter, createWebHistory } from 'vue-router'
import type { Router, RouterHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import LoginView from '@/views/LoginView.vue'
import SectionView from '@/views/SectionView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /** Routes are protected by default; set to true for routes reachable without login. */
    public?: boolean
  }
}

export function buildRouter(history: RouterHistory): Router {
  const router = createRouter({
    history,
    routes: [
      { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
      { path: '/', name: 'home', component: SectionView },
      { path: '/section/:id', name: 'section', component: SectionView, props: true },
      {
        path: '/document/:id',
        name: 'document',
        component: () => import('@/views/DocumentView.vue'),
        props: true,
      },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  })

  router.beforeEach(async (to) => {
    if (to.meta.public) return true
    const auth = useAuthStore()
    await auth.ensureChecked()
    if (auth.isLoggedIn) return true
    return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
  })

  return router
}

export default buildRouter(createWebHistory(import.meta.env.BASE_URL))
