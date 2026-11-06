import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { Pins } from '@/api'

const getPins = vi.fn<() => Promise<Pins | null>>()
const setPin = vi.fn()
vi.mock('@/api', async (original) => ({
  ...(await original<object>()),
  useApi: () => ({ getPins, setPin }),
}))

import { useAuthStore } from './auth'
import { useLiveStore } from './live'
import { usePinsStore } from './pins'

const pin = (documentId: string) => ({
  documentId,
  path: `${documentId}.md`,
  name: documentId,
  pinnedBy: { displayName: 'Anna', color: '#123', avatar: null },
  pinnedAt: '2026-11-06T10:00:00Z',
})

describe('pins', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getPins.mockReset()
    setPin.mockReset()
  })

  it('loads once, again on a change, and pins', async () => {
    getPins.mockResolvedValue({ family: [pin('d-1')], personal: [] })
    const pins = usePinsStore()
    pins.ensureLoaded()
    pins.ensureLoaded()
    await vi.waitFor(() => expect(pins.available).toBe(true))
    expect(getPins).toHaveBeenCalledTimes(1)
    expect(pins.isPinned('family', 'd-1')).toBe(true)
    expect(pins.isPinned('personal', 'd-1')).toBe(false)

    useLiveStore().pinsVersion++
    await nextTick()
    expect(getPins).toHaveBeenCalledTimes(2)

    setPin.mockResolvedValue({ family: [pin('d-1')], personal: [pin('d-2')] })
    await pins.setPinned('personal', 'd-2', true)
    expect(setPin).toHaveBeenCalledWith('personal', 'd-2', true)
    expect(pins.isPinned('personal', 'd-2')).toBe(true)
  })

  it('lets only editors and admins pin for everyone', () => {
    const pins = usePinsStore()
    const auth = useAuthStore()
    auth.setUser({ id: 'u', username: 'r', displayName: 'R', role: 'reader', color: '#000' })
    expect(pins.canPinForEveryone).toBe(false)
    auth.setUser({ id: 'u', username: 'e', displayName: 'E', role: 'editor', color: '#000' })
    expect(pins.canPinForEveryone).toBe(true)
  })

  it('knows a server without pins', async () => {
    getPins.mockResolvedValue(null)
    const pins = usePinsStore()
    pins.ensureLoaded()
    await vi.waitFor(() => expect(pins.available).toBe(false))
  })
})
