import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { sampleTree, user } from '@/test/fixtures'

import { wikiCopy } from './wikiCopy'

function signIn(username: string): void {
  useAuthStore().signedIn(user({ id: username, username }))
}

describe('wikiCopy', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    signIn('anna')
    await wikiCopy().clear()
    signIn('ben')
    await wikiCopy().clear()
    signIn('anna')
  })

  it('stores the tree, also a reactive one', async () => {
    const copy = wikiCopy()
    await copy.putTree(reactive({ root: sampleTree(), syncedAt: 5 }))
    expect((await copy.tree())?.syncedAt).toBe(5)
    expect((await copy.tree())?.root.id).toBe(sampleTree().id)
  })

  it('stores, lists and deletes pages', async () => {
    const copy = wikiCopy()
    await copy.putPage('a', { text: 'A', modtime: '1' })
    await copy.putPage('b', { text: 'B', modtime: '2' })
    await copy.deletePage('a')
    expect([...(await copy.pages())]).toEqual([['b', { text: 'B', modtime: '2' }]])
  })

  it('keeps accounts apart, also when clearing', async () => {
    const anna = wikiCopy()
    await anna.putPage('a', { text: 'von Anna', modtime: '1' })
    signIn('ben')
    const ben = wikiCopy()
    expect((await ben.pages()).size).toBe(0)
    await ben.putPage('a', { text: 'von Ben', modtime: '1' })
    await ben.clear()
    expect((await anna.pages()).get('a')?.text).toBe('von Anna')
  })

  it('stays with the account it was made for', async () => {
    const anna = wikiCopy()
    signIn('ben')
    await anna.putPage('late', { text: 'A', modtime: '1' })
    expect((await wikiCopy().pages()).size).toBe(0)
    expect((await anna.pages()).has('late')).toBe(true)
  })
})
