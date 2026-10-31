import { createRouter, createWebHistory } from 'vue-router'
import type { Router, RouterHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'

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
      { path: '/', name: 'home', component: HomeView },
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
