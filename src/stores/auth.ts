import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { ApiError, setCredentialsProvider, useApi } from '@/api'
import type { Credentials } from '@/api'
import { local, readJson, remove, session, writeJson } from '@/services/storage'

const STORAGE_KEY = 'mkdocseditor.credentials'

/**
 * Login state. The backend uses HTTP Basic auth, so the credentials are kept for every request:
 * in localStorage with "remember me", otherwise in sessionStorage (gone when the tab closes).
 */
export const useAuthStore = defineStore('auth', () => {
  const credentials = ref<Credentials | null>(
    readJson<Credentials>(local(), STORAGE_KEY) ?? readJson<Credentials>(session(), STORAGE_KEY),
  )
  /** True when the backend needs no login at all. */
  const anonymous = ref(false)
  const username = ref<string>(credentials.value?.username ?? '')
  const displayName = ref<string>('')
  const role = ref<string>('')
  const checked = ref(false)

  setCredentialsProvider(() => credentials.value)

  const isLoggedIn = computed(() => anonymous.value || credentials.value !== null)

  async function login(user: string, password: string, remember: boolean): Promise<void> {
    const candidate = { username: user.trim(), password }
    const who = await useApi().whoami(candidate)
    credentials.value = candidate
    username.value = who.username || candidate.username
    displayName.value = who.displayName ?? ''
    role.value = who.role ?? ''
    anonymous.value = false
    checked.value = true
    remove(local(), STORAGE_KEY)
    remove(session(), STORAGE_KEY)
    writeJson(remember ? local() : session(), STORAGE_KEY, candidate)
  }

  function logout(): void {
    credentials.value = null
    anonymous.value = false
    username.value = ''
    checked.value = false
    remove(local(), STORAGE_KEY)
    remove(session(), STORAGE_KEY)
  }

  /**
   * Called once before the first protected route. Without stored credentials it checks whether
   * the backend is open (no auth configured). Stored credentials are trusted until a request
   * fails with 401, so the app also starts while the server is unreachable.
   */
  async function ensureChecked(): Promise<void> {
    if (checked.value || credentials.value) {
      checked.value = true
      return
    }
    try {
      const who = await useApi().whoami(null)
      anonymous.value = true
      username.value = who.username
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
    }
    checked.value = true
  }

  return {
    credentials,
    anonymous,
    username,
    displayName,
    role,
    isLoggedIn,
    login,
    logout,
    ensureChecked,
  }
})
