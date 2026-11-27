import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiClient, setApiClient } from '@/api'

import { openResource } from './resources'

describe('openResource', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setApiClient(null)
  })

  it('opens the file from the backend in a tab of its own', () => {
    setApiClient(new ApiClient({ baseUrl: 'https://wiki.example/api', fetchFn: vi.fn() }))
    const tab = { opener: window } as unknown as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(tab)
    openResource('r 1')
    expect(open).toHaveBeenCalledWith('https://wiki.example/api/resource/r%201/content/', '_blank')
    // the file cannot reach this page
    expect(tab.opener).toBeNull()
  })
})
