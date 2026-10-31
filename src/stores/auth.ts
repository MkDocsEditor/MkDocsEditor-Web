import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { ApiError, setSessionEndedHandler, useApi, useAuthApi } from '@/api'
import type { AuthStatus, UserInfo, WhoAmI } from '@/api'
import { clearResourceUrls } from '@/services/resourceUrls'
import { local, readJson, remove, session, writeJson } from '@/services/storage'

/** The last signed-in user, so the app also starts while the server is unreachable. */
const USER_KEY = 'mkdocseditor.user'
/** Where older versions kept the Basic auth password. Removed on start. */
const LEGACY_CREDENTIALS_KEY = 'mkdocseditor.credentials'

export type SignedInUser = Pick<UserInfo, 'username' | 'displayName' | 'role' | 'color'> & {
  id?: string
  secondFactorSetupRequired?: boolean
}

function fromWhoAmI(who: WhoAmI | UserInfo): SignedInUser {
  return {
    id: who.id,
    username: who.username,
    displayName: who.displayName || who.username,
    role: who.role ?? 'reader',
    color: who.color ?? '',
    secondFactorSetupRequired: who.secondFactorSetupRequired ?? false,
  }
}

/**
 * Sign-in state. The session itself is an HttpOnly cookie of the backend, so the client only
 * keeps who is signed in. A request that finds the session ended (401) signs out locally;
 * unsaved edits stay in the offline store and sync after the next sign-in.
 */
export const useAuthStore = defineStore('auth', () => {
  remove(local(), LEGACY_CREDENTIALS_KEY)
  remove(session(), LEGACY_CREDENTIALS_KEY)

  const user = ref<SignedInUser | null>(readJson<SignedInUser>(local(), USER_KEY))
  const status = ref<AuthStatus | null>(null)
  /** True when the backend runs without authentication (`server.auth.disabled`). */
  const anonymous = ref(false)
  /** The last check could not reach the server; the stored user is trusted until it can. */
  const offline = ref(false)
  /** Set when the session ended on its own (expired or revoked), for a hint on the login page. */
  const sessionEnded = ref(false)
  const checked = ref(false)

  const isLoggedIn = computed(() => anonymous.value || user.value !== null)
  const username = computed(() => user.value?.username ?? '')
  const displayName = computed(() => user.value?.displayName ?? '')
  const role = computed(() => user.value?.role ?? (anonymous.value ? 'admin' : ''))
  const isAdmin = computed(() => role.value === 'admin')
  const setupRequired = computed(() => status.value?.setupRequired === true)
  const passkeysEnabled = computed(() => status.value?.passkeys.enabled === true)
  const passwordPolicy = computed(
    () => status.value?.passwordPolicy ?? { minLength: 10, maxLength: 256 },
  )
  /** The instance requires 2FA and this account has none yet: only the setup is reachable. */
  const secondFactorSetupRequired = computed(() => user.value?.secondFactorSetupRequired === true)

  function setUser(next: WhoAmI | UserInfo | null): void {
    user.value = next ? fromWhoAmI(next) : null
    if (user.value) writeJson(local(), USER_KEY, user.value)
    else remove(local(), USER_KEY)
  }

  /** After a login, a link redemption or a passkey login. */
  function signedIn(next: UserInfo): void {
    setUser(next)
    anonymous.value = false
    offline.value = false
    sessionEnded.value = false
    checked.value = true
    if (status.value) status.value = { ...status.value, setupRequired: false }
  }

  function clearLocal(): void {
    setUser(null)
    clearResourceUrls()
  }

  /** The backend said the session is gone (expired, revoked, account disabled). */
  function endSession(): void {
    if (!user.value) return
    clearLocal()
    sessionEnded.value = true
  }

  setSessionEndedHandler(endSession)

  async function loadStatus(): Promise<AuthStatus | null> {
    try {
      status.value = await useAuthApi().status()
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      // An older backend without /auth/status/ or an unreachable one: keep going.
      if (error.isNetworkError) throw error
    }
    return status.value
  }

  /**
   * Called before the first protected route: reads the instance status and who is signed in.
   * While the server is unreachable, the last signed-in user is trusted, so editing offline
   * keeps working; the next request that reaches the server corrects it.
   */
  async function ensureChecked(): Promise<void> {
    if (checked.value) return
    try {
      const current = await loadStatus()
      if (current?.authDisabled) {
        anonymous.value = true
        setUser(null)
      } else {
        try {
          setUser(await useApi().whoami({ quiet401: true }))
        } catch (error) {
          if (!(error instanceof ApiError) || error.isNetworkError) throw error
          if (error.isUnauthorized) setUser(null)
          else throw error
        }
      }
      offline.value = false
    } catch (error) {
      if (!(error instanceof ApiError && error.isNetworkError)) throw error
      offline.value = true
    }
    checked.value = true
  }

  /** Reloads the signed-in user, for example after the profile or the second factor changed. */
  async function refresh(): Promise<void> {
    setUser(await useApi().whoami())
  }

  /** Ends the session on the server and forgets the user locally. */
  async function logout(): Promise<void> {
    try {
      await useAuthApi().logout()
    } catch {
      // offline or already signed out: forget it locally anyway
    }
    clearLocal()
    anonymous.value = false
    sessionEnded.value = false
    checked.value = false
  }

  return {
    user,
    status,
    anonymous,
    offline,
    sessionEnded,
    checked,
    isLoggedIn,
    username,
    displayName,
    role,
    isAdmin,
    setupRequired,
    passkeysEnabled,
    passwordPolicy,
    secondFactorSetupRequired,
    loadStatus,
    ensureChecked,
    signedIn,
    setUser,
    endSession,
    refresh,
    logout,
  }
})
