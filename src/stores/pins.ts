import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

import { useApi } from '@/api'
import type { PinScope, Pins } from '@/api'

import { useAuthStore } from './auth'
import { useLiveStore } from './live'
import { useNotifyStore } from './notify'
import { useTreeStore } from './tree'

/**
 * Pinned pages: for everyone (set by editors and admins) and for this account. Loaded on first
 * use, then again whenever the server says they changed or the tree changed (a pin follows its
 * page through moves).
 */
export const usePinsStore = defineStore('pins', () => {
  const pins = shallowRef<Pins | null>(null)
  /** Null until the first load; false on a server without pins. */
  const available = ref<boolean | null>(null)
  const error = ref<unknown>(null)
  let wanted = false
  let generation = 0

  const auth = useAuthStore()
  const canPinForEveryone = computed(() => auth.role === 'admin' || auth.role === 'editor')

  async function load(): Promise<void> {
    wanted = true
    const mine = ++generation
    try {
      const next = await useApi().getPins()
      if (mine !== generation) return
      available.value = next !== null
      pins.value = next
      error.value = null
    } catch (e) {
      if (mine === generation) error.value = e
    }
  }

  /** Starts loading, once. */
  function ensureLoaded(): void {
    if (!wanted) void load()
  }

  const live = useLiveStore()
  const tree = useTreeStore()
  watch([() => live.pinsVersion, () => tree.root], () => {
    if (wanted && available.value !== false) void load()
  })

  function isPinned(scope: PinScope, documentId: string): boolean {
    return pins.value?.[scope].some((p) => p.documentId === documentId) ?? false
  }

  async function setPinned(scope: PinScope, documentId: string, pinned: boolean): Promise<void> {
    try {
      generation++
      pins.value = await useApi().setPin(scope, documentId, pinned)
    } catch (e) {
      useNotifyStore().error(e, pinned ? 'Could not pin the page' : 'Could not unpin the page')
    }
  }

  /** After a sign-out: the next account has its own pins. */
  function reset(): void {
    generation++
    wanted = false
    pins.value = null
    available.value = null
    error.value = null
  }

  return {
    pins,
    available,
    error,
    canPinForEveryone,
    load,
    ensureLoaded,
    isPinned,
    setPinned,
    reset,
  }
})
