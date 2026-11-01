import { computed } from 'vue'
import type { Ref, WritableComputedRef } from 'vue'

/** A `v-model` for a dialog that is open while `target` is set; closing it clears the target. */
export function openWhileSet<T>(target: Ref<T | null>): WritableComputedRef<boolean> {
  return computed({
    get: () => target.value !== null,
    set: (open) => {
      if (!open) target.value = null
    },
  })
}
