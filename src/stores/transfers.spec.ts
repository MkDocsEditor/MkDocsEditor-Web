import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TransferIndicator from '@/components/common/TransferIndicator.vue'
import { mountWithPlugins } from '@/test/mount'

import { useTransfersStore } from './transfers'

function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const el = (id: string) => document.querySelector(`[data-testid="${id}"]`)

describe('transfers store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows an action while it runs, with its progress and its steps', async () => {
    const transfers = useTransfersStore()
    const done = deferred<string>()
    const result = transfers.track('Uploading 1 of 2', async (t) => {
      t.progress(5, 10)
      expect(transfers.active[0]).toMatchObject({ label: 'Uploading 1 of 2', loaded: 5, total: 10 })
      t.relabel('Uploading 2 of 2')
      return done.promise
    })
    expect(transfers.active[0]).toMatchObject({ label: 'Uploading 2 of 2', loaded: null })
    done.resolve('ok')
    await expect(result).resolves.toBe('ok')
    expect(transfers.active).toEqual([])
  })

  it('lets errors through and forgets the action', async () => {
    const transfers = useTransfersStore()
    await expect(
      transfers.track('Deleting', () => Promise.reject(new Error('gone'))),
    ).rejects.toThrow('gone')
    expect(transfers.active).toEqual([])
  })
})

describe('TransferIndicator', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('stays away for short actions and says when the server takes long', async () => {
    vi.useFakeTimers()
    const { wrapper } = await mountWithPlugins(TransferIndicator)
    const transfers = useTransfersStore()
    const quick = transfers.track('Schnell', () => Promise.resolve())
    await vi.advanceTimersByTimeAsync(1000)
    await quick
    expect(el('transfer')).toBeNull()

    const slow = deferred()
    let handle!: Parameters<Parameters<typeof transfers.track>[1]>[0]
    const running = transfers.track('Deleting “Rezepte”', (t) => {
      handle = t
      return slow.promise
    })
    await vi.advanceTimersByTimeAsync(1000)
    expect(el('transfer')?.textContent).toContain('Deleting “Rezepte”')
    expect(el('transfer-slow')).toBeNull()
    await vi.advanceTimersByTimeAsync(4500)
    expect(el('transfer-slow')).not.toBeNull()

    // progress is a sign of life; once all bytes are sent, the wait is the server's
    handle.progress(10, 100)
    await vi.advanceTimersByTimeAsync(600)
    expect(el('transfer-slow')).toBeNull()
    expect(el('transfer-bytes')?.textContent).toContain('of')
    handle.progress(100, 100)
    await vi.advanceTimersByTimeAsync(2000)
    expect(el('transfer-slow')).not.toBeNull()

    slow.resolve()
    await running
    await flushPromises()
    await vi.advanceTimersByTimeAsync(600)
    expect(el('transfer')).toBeNull()
    wrapper.unmount()
  })
})
