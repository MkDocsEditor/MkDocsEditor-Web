import { describe, expect, it } from 'vitest'

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
})
