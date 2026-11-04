import { ref } from 'vue'

import { useNotifyStore } from '@/stores/notify'

export interface LoadOptions<Args extends unknown[]> {
  /** What failed, for the message: "Could not load the users". */
  failure: string
  /** Whether there is something on screen that is still worth showing after a failure. */
  hasData: (...args: Args) => boolean
  /** Fetches and stores the data. */
  fetch: (...args: Args) => Promise<void>
  /** Shows the progress on every load instead of only until the first answer. */
  alwaysShowProgress?: boolean
}

/**
 * Loading data for a card or a list. The first failure replaces the content (`LoadError`); once
 * there is data, a failed reload only shows a message, with a retry, and keeps the data.
 */
export function useLoad<Args extends unknown[] = []>(options: LoadOptions<Args>) {
  const notify = useNotifyStore()
  const loading = ref(!options.alwaysShowProgress)
  const loadError = ref<unknown>(null)

  async function load(...args: Args): Promise<void> {
    if (options.alwaysShowProgress || loadError.value) loading.value = true
    loadError.value = null
    try {
      await options.fetch(...args)
    } catch (error) {
      if (options.hasData(...args)) notify.error(error, options.failure, () => void load(...args))
      else loadError.value = error
    } finally {
      loading.value = false
    }
  }

  return { loading, loadError, load }
}
