import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'

import { useLiveStore } from './live'

describe('live store', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => setApiClient(null))

  it('runs one more reload for changes that arrive during a reload', async () => {
    let release!: () => void
    let calls = 0
    const mock = createFetchMock({
      'GET /section/': async () => {
        calls++
        if (calls === 1) await new Promise<void>((resolve) => (release = resolve))
        return json(sampleTree())
      },
    })
    setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
    const live = useLiveStore()
    const first = live.reloadTree()
    await Promise.resolve()
    void live.reloadTree()
    void live.reloadTree()
    release()
    await first
    expect(calls).toBe(2)
  })

  it('lists the users of a document', () => {
    const live = useLiveStore()
    live.online = new Map([['d-1', [{ username: 'anna', displayName: 'Anna' }]]])
    expect(live.usersOf('d-1')).toHaveLength(1)
    expect(live.usersOf('d-2')).toEqual([])
  })
})
