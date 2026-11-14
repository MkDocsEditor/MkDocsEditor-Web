import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, ref, shallowRef } from 'vue'

import { ApiClient, setApiClient } from '@/api'
import type { DocumentChanges } from '@/api'
import type { DocumentSession } from '@/sync'
import { useAuthStore } from '@/stores/auth'
import { createFetchMock, json } from '@/test/fetchMock'
import { createFakeSession } from '@/test/fakeSession'

import { useChangesSinceVisit } from './useChangesSinceVisit'

/** The backend's answer for carol after alice and bob's agent changed the page. */
const CHANGES: DocumentChanges = {
  since: { time: '2026-11-14T03:00:24.962Z', seenToken: 'old' },
  seenToken: 'new',
  authors: [
    {
      accountId: 'a',
      username: 'alice',
      displayName: 'alice',
      color: '#e8590c',
      avatar: null,
      agents: [],
    },
    {
      accountId: 'b',
      username: 'bob',
      displayName: 'bob',
      color: '#2f9e44',
      avatar: null,
      agents: ['Claude Code'],
    },
  ],
  hunks: [
    {
      heading: 'Setup',
      headingOccurrence: 1,
      offset: 0,
      oldStart: 1,
      oldLines: 3,
      newStart: 1,
      newLines: 4,
      lines: [
        { op: ' ', text: '# Setup' },
        { op: '-', text: 'Some text.' },
        { op: '+', text: 'Some better text.' },
        { op: '+', text: '## Install' },
      ],
    },
  ],
  summary: { linesAdded: 5, linesRemoved: 1, headings: ['Setup', 'Install'] },
}

function setup(answer: () => Response, initiallyReady = true) {
  const mock = createFetchMock({
    'GET /document/d1/changes/': answer,
    'GET /document/d2/changes/': answer,
    'PUT /document/d1/seen/': () => new Response(null, { status: 204 }),
    'PUT /document/d2/seen/': () => new Response(null, { status: 204 }),
  })
  setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
  setActivePinia(pinia)
  const id = ref('d1')
  const session = shallowRef<DocumentSession | null>(createFakeSession('x').session)
  const ready = ref(initiallyReady)
  let result!: ReturnType<typeof useChangesSinceVisit>
  const wrapper = mount(
    defineComponent({
      setup() {
        result = useChangesSinceVisit(() => id.value, session, ready)
        return () => null
      },
    }),
  )
  const seen = () =>
    mock.requests
      .filter((r) => r.method === 'PUT')
      .map((r) => `${r.url.replace('http://b', '')} ${JSON.parse(r.body as string).seenToken}`)
  return { ...mock, id, session, ready, wrapper, result, seen }
}

let pinia = createPinia()

describe('useChangesSinceVisit', () => {
  beforeEach(() => {
    pinia = createPinia()
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows what changed and remembers it once dismissed', async () => {
    const { result, seen, requests, wrapper } = setup(() => json(CHANGES))
    await flushPromises()
    expect(requests[0]!.url).toContain('/document/d1/changes/?since=seen')
    expect(result.changes.value?.authors).toHaveLength(2)
    result.dismiss()
    await flushPromises()
    expect(result.changes.value).toBeNull()
    expect(seen()).toEqual(['/document/d1/seen/ new'])
    wrapper.unmount()
  })

  it('shows nothing on a first visit or without changes, and remembers the text on leaving', async () => {
    const { result, seen, id, session, wrapper } = setup(() =>
      json({ ...CHANGES, since: null, hunks: [] }),
    )
    await flushPromises()
    expect(result.changes.value).toBeNull()
    // another page: the text of this one counts as seen (the fake's shared revision is r1)
    id.value = 'd2'
    session.value = createFakeSession('y').session
    await flushPromises()
    expect(seen()).toEqual(['/document/d1/seen/ r1'])
    wrapper.unmount()
    await flushPromises()
    expect(seen()).toEqual(['/document/d1/seen/ r1', '/document/d2/seen/ r1'])
  })

  it('leaves out the own edits, not the ones of the own agents', async () => {
    const mine = { ...CHANGES.authors[0]!, username: 'me' }
    const { result, wrapper } = setup(() => json({ ...CHANGES, authors: [mine] }))
    useAuthStore().user = { username: 'me' } as never
    await flushPromises()
    expect(result.changes.value).toBeNull()
    wrapper.unmount()

    const again = setup(() =>
      json({ ...CHANGES, authors: [mine, { ...mine, agents: ['Claude Code'] }] }),
    )
    await flushPromises()
    expect(again.result.changes.value?.authors.map((a) => a.agents)).toEqual([['Claude Code']])
    again.wrapper.unmount()
  })

  it('works on backends without it', async () => {
    const { result, wrapper } = setup(() => json({ message: 'not found' }, 404))
    await flushPromises()
    expect(result.changes.value).toBeNull()
    wrapper.unmount()
  })

  it('waits for the text before asking', async () => {
    const { ready, requests, result, wrapper } = setup(() => json(CHANGES), false)
    await flushPromises()
    expect(requests).toHaveLength(0)
    ready.value = true
    await flushPromises()
    expect(result.changes.value).not.toBeNull()
    wrapper.unmount()
  })
})
