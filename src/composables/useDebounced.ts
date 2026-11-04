import { onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'

/** A copy of `source` that follows at most every `ms` milliseconds while it keeps changing. */
export function useDebounced<T>(source: () => T, ms: number): Ref<T> {
  const debounced = ref(source()) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(source, (value) => {
    clearTimeout(timer)
    timer = setTimeout(() => (debounced.value = value), ms)
  })
  onBeforeUnmount(() => clearTimeout(timer))
  return debounced
}
