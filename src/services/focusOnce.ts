import type { Directive } from 'vue'

/**
 * `v-focus-once`: focuses the field's input once, when it first shows. Vuetify's `autofocus`
 * focuses again whenever the field scrolls back into view, which can move the cursor while
 * someone types into a field further down (on phones, the keyboard scrolls the page).
 * `v-focus-once="false"` does nothing.
 */
export const vFocusOnce: Directive<HTMLElement, boolean | undefined> = {
  mounted(el, binding) {
    if (binding.value === false) return
    const input = el.matches('input, textarea') ? el : el.querySelector('input, textarea')
    ;(input as HTMLElement | null)?.focus()
  },
}
