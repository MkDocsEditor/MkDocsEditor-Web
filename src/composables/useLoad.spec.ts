import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useNotifyStore } from '@/stores/notify'

import { useLoad } from './useLoad'

describe('useLoad', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows progress until the first answer, and not on a reload', async () => {
    const fetch = vi.fn().mockResolvedValue(undefined)
    const { loading, load } = useLoad({ failure: 'Failed', hasData: () => true, fetch })
    expect(loading.value).toBe(true)
    const first = load()
    expect(loading.value).toBe(true)
    await first
    expect(loading.value).toBe(false)
    const second = load()
    expect(loading.value).toBe(false)
    await second
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('shows progress on every load when asked to', async () => {
    const { loading, load } = useLoad({
      failure: 'Failed',
      hasData: () => true,
      fetch: async () => undefined,
      alwaysShowProgress: true,
    })
    expect(loading.value).toBe(false)
    const running = load()
    expect(loading.value).toBe(true)
    await running
    expect(loading.value).toBe(false)
  })

  it('keeps the error for the page while there is no data, and clears it on the retry', async () => {
    const failure = new Error('nope')
    const fetch = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined)
    const { loading, loadError, load } = useLoad({ failure: 'Failed', hasData: () => false, fetch })
    await load()
    expect(loadError.value).toBe(failure)
    expect(useNotifyStore().queue).toHaveLength(0)

    const retry = load()
    expect(loading.value).toBe(true)
    expect(loadError.value).toBeNull()
    await retry
    expect(loadError.value).toBeNull()
  })

  it('keeps the data after a failed reload and offers a retry with the same arguments', async () => {
    const fetch = vi
      .fn<(more: boolean) => Promise<void>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(undefined)
    const { loadError, load } = useLoad<[boolean]>({
      failure: 'Failed',
      hasData: () => true,
      fetch,
    })
    await load(true)
    expect(loadError.value).toBeNull()
    const notify = useNotifyStore()
    expect(notify.queue[0]?.text).toContain('Failed')
    notify.queue[0]?.retry?.()
    expect(fetch).toHaveBeenLastCalledWith(true)
  })
})
