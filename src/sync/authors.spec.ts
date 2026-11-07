import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AutomergeApi, AmDoc } from './automerge'
import { createAuthors } from './authors'

function authors(runs: { start: number; end: number; username: string }[]) {
  return createAuthors({
    automerge: () => ({ getHeads: () => ['h'] }) as unknown as AutomergeApi,
    doc: () => ({ content: 'importiert, von Anna' }) as unknown as AmDoc,
    documentId: () => 'd',
    getAuthorship: async () => ({
      heads: ['h'],
      runs: runs.map((run) => ({ ...run, actorId: '108d4172e5afda766e4754089f7d2016' })),
    }),
    refetchMs: 1_000,
  })
}

describe('authors', () => {
  afterEach(() => vi.useRealTimers())

  it('gives imported text no author, by its username and not its actor id', async () => {
    const subject = authors([
      { start: 0, end: 10, username: ':server' },
      { start: 10, end: 12, username: ':disk' },
      { start: 12, end: 20, username: 'anna' },
    ])
    subject.refresh()
    await expect.poll(() => subject.authorship.value.length).toBe(1)
    expect(subject.authorship.value[0]).toMatchObject({ from: 12, to: 20, username: 'anna' })
    subject.stop()
  })

  it('has nothing to show for a document of only imported text', async () => {
    const subject = authors([{ start: 0, end: 20, username: ':server' }])
    subject.refresh()
    await new Promise((resolve) => setTimeout(resolve))
    expect(subject.authorship.value).toEqual([])
    subject.stop()
  })

  it('names the author of remote changes when all of them are one person', () => {
    const subject = authors([])
    subject.rememberUser({ actorId: 'a1', username: 'anna', color: '#1971c2' })
    subject.rememberUser({ actorId: 'a2', username: 'anna' })
    subject.rememberUser({ actorId: 'b1', username: 'bob', color: '#e8590c' })
    subject.rememberUser({ actorId: 'd1', username: ':disk' })
    expect(subject.authorOf(['a1', 'a2'])).toBe('anna')
    expect(subject.authorOf(['a1', 'b1'])).toBeNull()
    expect(subject.authorOf(['a1', 'unknown'])).toBeNull()
    expect(subject.authorOf(['d1'])).toBeNull()
    expect(subject.authorOf([])).toBeNull()

    // the color is the one the server's answer has for the same user
    subject.follow([{ from: 0, to: 0, insert: 'Hallo' }], subject.authorOf(['b1']))
    subject.publish()
    expect(subject.authorship.value).toEqual([
      { from: 0, to: 5, username: 'bob', color: '#e8590c' },
    ])
    subject.stop()
  })

  it('asks the server at least every 10 s while the text keeps changing', async () => {
    vi.useFakeTimers()
    const getAuthorship = vi.fn(async () => ({ heads: ['h'], runs: [] }))
    const subject = createAuthors({
      automerge: () => ({ getHeads: () => ['h'] }) as unknown as AutomergeApi,
      doc: () => ({ content: '' }) as unknown as AmDoc,
      documentId: () => 'd',
      getAuthorship,
      refetchMs: 2_000,
      now: () => Date.now(),
    })
    // a change every second for 15 s: the quiet time never comes
    for (let second = 0; second < 15; second++) {
      subject.scheduleRefetch()
      await vi.advanceTimersByTimeAsync(1_000)
    }
    expect(getAuthorship).toHaveBeenCalledTimes(1)
    // and after the last change, once more when the text settled
    await vi.advanceTimersByTimeAsync(2_000)
    expect(getAuthorship).toHaveBeenCalledTimes(2)
    subject.stop()
  })
})
