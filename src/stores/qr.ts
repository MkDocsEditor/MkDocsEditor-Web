import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'

import { useApi, useAuthApi } from '@/api'
import type { QrCodes, QrItem, TreeItem } from '@/api'

import { useTreeStore } from './tree'

/**
 * QR codes on things in the house (`docs/qr.md` of MkDocsEditor-Backend): a sticker holds the URL
 * `/q/<key>` of this web client, and the page with the key in its front matter opens. The list of
 * all keys is loaded on first use and again whenever the tree changes (keys live in the pages).
 */
export const useQrStore = defineStore('qr', () => {
  /** Null until known; whether the server has `qr-codes`. */
  const available = ref<boolean | null>(null)
  const codes = shallowRef<QrCodes | null>(null)
  const error = ref<unknown>(null)
  let wanted = false
  let generation = 0

  async function checkAvailable(): Promise<boolean> {
    if (available.value === null) {
      try {
        const info = await useAuthApi().serverInfo()
        available.value = info.features?.includes('qr-codes') === true
      } catch {
        return false // asked again next time
      }
    }
    return available.value
  }

  async function load(): Promise<void> {
    wanted = true
    if (!(await checkAvailable())) return
    const mine = ++generation
    try {
      const next = await useApi().getQrCodes()
      if (mine !== generation) return
      codes.value = next
      error.value = null
    } catch (e) {
      if (mine === generation) error.value = e
    }
  }

  function ensureLoaded(): void {
    if (!wanted) void load()
  }

  const tree = useTreeStore()
  watch(
    () => tree.root,
    () => {
      if (wanted) void load()
    },
  )

  /** The URL a sticker holds for `key`. */
  function urlFor(key: string): string {
    return new URL(`${import.meta.env.BASE_URL}q/${encodeURIComponent(key)}`, location.origin).href
  }

  /** The pages other than `documentId` that have `key` now. */
  function otherPagesWith(key: string, documentId?: string): QrItem[] {
    const list = codes.value
    if (!list) return []
    const pages = [
      ...list.codes.filter((c) => c.key === key),
      ...(list.conflicts.find((c) => c.key === key)?.items ?? []),
    ]
    return pages.filter((p) => p.item.id !== documentId)
  }

  /** The QR code keys of a page, or of all pages in a folder (from the tree). */
  function keysIn(item: TreeItem): string[] {
    if (item.type === 'document') return item.meta?.qr?.map((k) => k.key) ?? []
    if (item.type !== 'section') return []
    return [
      ...item.documents.flatMap((d) => d.meta?.qr?.map((k) => k.key) ?? []),
      ...item.subsections.flatMap((s) => keysIn(s)),
    ]
  }

  /** After a sign-out. */
  function reset(): void {
    generation++
    wanted = false
    available.value = null
    codes.value = null
    error.value = null
  }

  return {
    available,
    codes,
    error,
    checkAvailable,
    load,
    ensureLoaded,
    urlFor,
    otherPagesWith,
    keysIn,
    reset,
  }
})
