import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getAvatar = vi.fn()
vi.mock('@/api', () => ({ useApi: () => ({ getAvatar }) }))

import { avatarUrl, clearAvatarUrls, loadedAvatarUrl } from './avatars'

describe('avatar urls', () => {
  let next = 0
  beforeEach(() => {
    getAvatar.mockReset().mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
    URL.createObjectURL = vi.fn(() => `blob:${++next}`)
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => clearAvatarUrls())

  it('has none without a picture or without the account', () => {
    expect(avatarUrl({ accountId: 'a', avatar: null })).toBeNull()
    expect(avatarUrl({ avatar: 'ff' })).toBeNull()
    expect(getAvatar).not.toHaveBeenCalled()
  })

  it('loads a picture once, and a new hash again', async () => {
    const first = await avatarUrl({ accountId: 'a', avatar: '01' })
    expect(await avatarUrl({ accountId: 'a', avatar: '01' })).toBe(first)
    expect(loadedAvatarUrl({ accountId: 'a', avatar: '01' })).toBe(first)
    expect(getAvatar).toHaveBeenCalledTimes(1)
    expect(getAvatar).toHaveBeenCalledWith('a', '01')

    expect(await avatarUrl({ accountId: 'a', avatar: '02' })).not.toBe(first)
    expect(getAvatar).toHaveBeenCalledTimes(2)
  })

  it('tries again after a failure', async () => {
    getAvatar.mockRejectedValueOnce(new Error('404'))
    await expect(avatarUrl({ accountId: 'a', avatar: '03' })).rejects.toThrow()
    expect(loadedAvatarUrl({ accountId: 'a', avatar: '03' })).toBeUndefined()
    await expect(avatarUrl({ accountId: 'a', avatar: '03' })).resolves.toMatch(/^blob:/)
  })

  it('forgets everything on logout', async () => {
    const url = await avatarUrl({ accountId: 'a', avatar: '04' })
    clearAvatarUrls()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
    expect(loadedAvatarUrl({ accountId: 'a', avatar: '04' })).toBeUndefined()
  })
})
