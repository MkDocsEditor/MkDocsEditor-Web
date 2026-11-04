import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api'
import NotificationHost from '@/components/common/NotificationHost.vue'
import { mountWithPlugins } from '@/test/mount'

import { useNotifyStore } from './notify'

describe('notify store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('offers a retry only if trying again can work', () => {
    const notify = useNotifyStore()
    const retry = vi.fn()
    notify.error(new ApiError('x', 0), 'Delete failed', retry)
    notify.error(new ApiError('x', 503), 'Delete failed', retry)
    notify.error(new ApiError('x', 403), 'Delete failed', retry)
    expect(notify.queue.map((n) => n.retry)).toEqual([retry, retry, undefined])
  })

  it('runs the retry from the snackbar and closes it', async () => {
    const { wrapper } = await mountWithPlugins(NotificationHost)
    const notify = useNotifyStore()
    const retry = vi.fn()
    notify.error(new ApiError('x', 0), 'Delete failed', retry)
    await flushPromises()
    ;(document.querySelector('[data-testid="notification-retry"]') as HTMLElement).click()
    expect(retry).toHaveBeenCalledTimes(1)
    expect(notify.queue).toEqual([])
    wrapper.unmount()
  })
})
