import { onBeforeUnmount, ref, watch } from 'vue'

/** How long an action may take before it is worth a word that the server is still at it. */
export const TAKES_LONG_MS = 5000

/**
 * True once `busy` has been true for `after` ms without a break: the server is still working,
 * which is no error. Requests have no time limit, so this is only a note for the user.
 */
export function useTakesLong(busy: () => boolean, after = TAKES_LONG_MS) {
  const long = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(
    busy,
    (now) => {
      clearTimeout(timer)
      long.value = false
      if (now) timer = setTimeout(() => (long.value = true), after)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => clearTimeout(timer))
  return long
}
