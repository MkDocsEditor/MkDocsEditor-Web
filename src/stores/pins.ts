import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

import { useApi, useAuthApi } from '@/api'
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
  /** The server keeps an order of the pins that can be changed (`pin-order`). */
  const orderable = ref(false)
  let wanted = false
  let generation = 0

  const auth = useAuthStore()
  const canPinForEveryone = computed(() => auth.role === 'admin' || auth.role === 'editor')

  async function loadFeatures(): Promise<void> {
    try {
      const info = await useAuthApi().serverInfo()
      orderable.value = info.features?.includes('pin-order') === true
    } catch {
      // without the server info, the pins stay in the order the server gives
    }
  }

  async function load(): Promise<void> {
    if (!wanted) void loadFeatures()
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

  /** Whether this account may change the order of the pins of `scope`. */
  function canReorder(scope: PinScope): boolean {
    return orderable.value && (scope === 'personal' || canPinForEveryone.value)
  }

  /**
   * Moves the pin of `documentId` to place `to` of its list. The list shows the new order right
   * away; if the server refuses it, the pins are loaded again.
   */
  async function move(scope: PinScope, documentId: string, to: number): Promise<void> {
    const current = pins.value
    const list = current?.[scope]
    const from = list?.findIndex((p) => p.documentId === documentId) ?? -1
    if (!current || !list || from < 0) return
    const target = Math.max(0, Math.min(list.length - 1, to))
    if (target === from) return
    const next = [...list]
    const [moved] = next.splice(from, 1)
    next.splice(target, 0, moved!)
    const mine = ++generation
    pins.value = { ...current, [scope]: next }
    try {
      const answer = await useApi().setPinOrder(
        scope,
        next.map((p) => p.documentId),
      )
      if (mine === generation) pins.value = answer
    } catch (e) {
      useNotifyStore().error(e, 'Could not move the pin')
      if (mine === generation) void load()
    }
  }

  /** After a sign-out: the next account has its own pins. */
  function reset(): void {
    generation++
    wanted = false
    orderable.value = false
    pins.value = null
    available.value = null
    error.value = null
  }

  return {
    pins,
    available,
    error,
    canPinForEveryone,
    orderable,
    load,
    ensureLoaded,
    isPinned,
    setPinned,
    canReorder,
    move,
    reset,
  }
})
