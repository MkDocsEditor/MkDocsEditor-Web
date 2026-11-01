import { onBeforeUnmount, ref } from 'vue'

import { copyText } from './clipboard'

/** Copies text; `copied` stays true for two seconds after a successful copy. */
export function useCopied() {
  const copied = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  onBeforeUnmount(() => clearTimeout(timer))

  async function copy(text: string): Promise<boolean> {
    copied.value = await copyText(text)
    clearTimeout(timer)
    timer = setTimeout(() => (copied.value = false), 2000)
    return copied.value
  }
  return { copied, copy }
}
