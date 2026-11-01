import { ref, watch } from 'vue'
import type { Ref } from 'vue'

import { local, readJson, writeJson } from './storage'

/** A setting that survives reloads: a ref backed by Local Storage. */
export function useStored<T>(key: string, fallback: T): Ref<T> {
  const value = ref(readJson<T>(local(), key) ?? fallback) as Ref<T>
  watch(value, (next) => writeJson(local(), key, next), { flush: 'sync' })
  return value
}
