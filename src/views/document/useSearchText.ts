import { onBeforeUnmount, watch } from 'vue'
import type { Ref } from 'vue'

import { usePagesStore } from '@/stores/pages'
import { accountKey } from '@/sync/account'

/** Search finds what was just typed here, before the server's copy of the page is fetched again. */
export function useSearchText(id: () => string, text: Ref<string>, ready: Ref<boolean>): void {
  const pages = usePagesStore()
  const account = accountKey()
  let unstoredText: { id: string; text: string } | null = null
  let storeTimer: ReturnType<typeof setTimeout> | undefined

  function storeText(): void {
    clearTimeout(storeTimer)
    // after a sign-out this text is not for whoever comes next
    if (unstoredText && accountKey() === account) pages.edited(unstoredText.id, unstoredText.text)
    unstoredText = null
  }

  watch(text, (value) => {
    if (!ready.value) return
    unstoredText = { id: id(), text: value }
    clearTimeout(storeTimer)
    storeTimer = setTimeout(storeText, 1_000)
  })
  watch(id, storeText, { flush: 'sync' })
  onBeforeUnmount(storeText)
}
