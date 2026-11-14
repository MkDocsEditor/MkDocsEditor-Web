import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import { ApiClient, setApiClient } from '@/api'
import { createFetchMock, json } from '@/test/fetchMock'
import { mountWithPlugins } from '@/test/mount'

import type { ChangeRange } from '@/markdown/changeRanges'

import HistoryDialog from './HistoryDialog.vue'

/** `format=json` of the backend for Bob's agent changing two lines (from its test setup). */
const FIXTURE_DIFF = {
  from: 'aaaaaaa',
  to: 'bbbbbbb',
  hunks: [
    {
      heading: 'Setup',
      headingOccurrence: 1,
      offset: 0,
      oldStart: 1,
      oldLines: 8,
      newStart: 1,
      newLines: 8,
      lines: [
        { op: ' ', text: '# Setup' },
        { op: ' ', text: '' },
        { op: '-', text: 'Some text.' },
        { op: '+', text: 'Some better text.' },
        { op: ' ', text: '' },
        { op: ' ', text: '## Install' },
        { op: ' ', text: '' },
        { op: ' ', text: 'Run the installer.' },
        { op: '-', text: 'Then reboot.' },
        { op: '+', text: 'Then reboot twice.' },
      ],
    },
  ],
}

const revisions = [
  {
    revision: 'bbbbbbb',
    time: '2026-10-31T12:00:00Z',
    author: { name: 'Opa Hans', email: '', username: '' },
    coAuthors: [],
    message: 'Zweite Fassung',
    path: 'a.md',
  },
  {
    revision: 'aaaaaaa',
    time: '2026-10-30T12:00:00Z',
    author: { name: 'Oma Erna', email: '', username: '' },
    coAuthors: [{ name: 'Anna', email: '', username: 'anna' }],
    message: 'Erste Fassung\n\nCo-authored-by: Anna <a@x>',
    path: 'a.md',
  },
]

async function setup(routes: Parameters<typeof createFetchMock>[0], readOnly = false) {
  const mock = createFetchMock(routes)
  setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
  const open = ref(false)
  const shown: ChangeRange[] = []
  const Host = defineComponent({
    setup: () => () =>
      h(HistoryDialog, {
        documentId: 'd1',
        readOnly,
        modelValue: open.value,
        'onUpdate:modelValue': (v: boolean) => (open.value = v),
        onShow: (range: ChangeRange) => shown.push(range),
      }),
  })
  const result = await mountWithPlugins(Host)
  open.value = true
  await flushPromises()
  await flushPromises()
  return { ...result, ...mock, open, shown }
}

const q = (selector: string) => document.querySelector(selector)
const qa = (selector: string) => [...document.querySelectorAll(selector)]

describe('HistoryDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('lists versions, shows what one changed and restores it', async () => {
    const { wrapper, requests, open } = await setup({
      'GET /document/d1/history/': () => json(revisions),
      'GET /document/d1/history/diff/': () => new Response('@@ -1 +1 @@\n-alt\n+neu\n'),
      'GET /document/d1/history/aaaaaaa/content/': () => new Response('erste'),
      'POST /document/d1/history/aaaaaaa/restore/': () => new Response(null, { status: 204 }),
    })
    const entries = qa('[data-testid="history-entry"]')
    expect(entries).toHaveLength(2)
    expect(entries[1]!.textContent).toContain('Oma Erna and 1 more')
    expect(entries[1]!.textContent).not.toContain('Co-authored-by')
    // the newest is the current state and cannot be restored
    ;(entries[0] as HTMLElement).click()
    await flushPromises()
    expect(q('[data-testid="history-detail"]')).not.toBeNull()
    expect(q('[data-testid="history-restore"]')).toBeNull()
    // back to the list (on narrow screens list and detail take turns)
    ;(q('[aria-label="Back to the list"]') as HTMLElement).click()
    await flushPromises()

    ;(entries[1] as HTMLElement).click()
    await flushPromises()
    // the oldest has no predecessor: its text is shown
    expect(q('[data-testid="history-content"]')?.textContent).toBe('erste')
    ;(q('[data-testid="history-restore"]') as HTMLElement).click()
    await flushPromises()
    ;(q('[data-testid="confirm-button"]') as HTMLElement).click()
    await flushPromises()
    expect(requests.some((r) => r.method === 'POST' && r.url.includes('/aaaaaaa/restore/'))).toBe(
      true,
    )
    expect(open.value).toBe(false)
    wrapper.unmount()
  })

  it('stays open and says why when loading a version or restoring fails', async () => {
    let diffUp = false
    const { wrapper, open } = await setup({
      'GET /document/d1/history/': () => json(revisions),
      'GET /document/d1/history/diff/': () =>
        diffUp ? new Response('@@ -1 +1 @@\n-alt\n+neu\n') : json({ message: 'panic' }, 500),
      'GET /document/d1/history/aaaaaaa/content/': () => new Response('erste'),
      'POST /document/d1/history/aaaaaaa/restore/': () => json({ message: 'panic' }, 500),
    })
    ;(qa('[data-testid="history-entry"]')[0] as HTMLElement).click()
    await flushPromises()
    expect(q('[data-testid="load-error"]')?.textContent).toContain('The server has a problem')
    diffUp = true
    ;(q('[data-testid="load-error-retry"]') as HTMLElement).click()
    await flushPromises()
    expect(q('[data-testid="load-error"]')).toBeNull()

    ;(q('[aria-label="Back to the list"]') as HTMLElement).click()
    await flushPromises()
    ;(qa('[data-testid="history-entry"]')[1] as HTMLElement).click()
    await flushPromises()
    ;(q('[data-testid="history-restore"]') as HTMLElement).click()
    await flushPromises()
    ;(q('[data-testid="confirm-button"]') as HTMLElement).click()
    await flushPromises()
    const error = q('[data-testid="history-restore-error"]')
    expect(error?.textContent).toContain('Restore failed')
    expect(error?.textContent).not.toContain('panic')
    expect(open.value).toBe(true)
    wrapper.unmount()
  })

  it('shows the diff of a version against its predecessor', async () => {
    const { wrapper, requests } = await setup({
      'GET /document/d1/history/': () => json(revisions),
      'GET /document/d1/history/diff/': () => new Response('@@ -1 +1 @@\n-alt\n+neu\n'),
    })
    ;(qa('[data-testid="history-entry"]')[0] as HTMLElement).click()
    await flushPromises()
    expect(qa('.history__line--del').map((l) => l.textContent)).toEqual(['−alt'])
    expect(qa('.history__line--add').map((l) => l.textContent)).toEqual(['+neu'])
    expect(requests.find((r) => r.url.includes('/diff/'))?.url).toContain('from=aaaaaaa&to=bbbbbbb')
    wrapper.unmount()
  })

  it('names the app tokens an agent made a version with', async () => {
    const { wrapper } = await setup({
      'GET /document/d1/history/': () =>
        json([{ ...revisions[0]!, appTokens: ['Claude Code on Linux'] }, revisions[1]]),
    })
    const entries = qa('[data-testid="history-entry"]')
    expect(entries[0]!.textContent).toContain('Opa Hans via Claude Code on Linux')
    expect(entries[1]!.textContent).not.toContain(' via ')
    wrapper.unmount()
  })

  it('summarizes versions and shows hunks by heading, with the changed words', async () => {
    // answers of the backend (docs/history.md): Bob's agent changed two lines
    const { wrapper, shown, open } = await setup({
      'GET /document/d1/history/': () =>
        json([
          {
            ...revisions[0]!,
            author: { ...revisions[0]!.author, displayName: 'Bob', color: '#2f9e44' },
            message: 'Update a.md',
            appTokens: ['Claude Code'],
            agents: [{ name: 'Claude Code', accountId: 'b' }],
            summary: { linesAdded: 2, linesRemoved: 2, headings: ['Setup', 'Install'] },
          },
          revisions[1],
        ]),
      'GET /document/d1/history/diff/': () => json(FIXTURE_DIFF),
    })
    const entries = qa('[data-testid="history-entry"]')
    expect(entries[0]!.textContent).toContain('Bob via Claude Code')
    expect(entries[0]!.querySelector('[data-testid="history-agent"]')).not.toBeNull()
    expect(entries[0]!.querySelector('[data-testid="history-summary"]')?.textContent).toContain(
      '+2 −2 · Setup, Install',
    )
    // older backends: the commit message
    expect(entries[1]!.textContent).toContain('Erste Fassung')
    expect(entries[1]!.querySelector('[data-testid="history-agent"]')).toBeNull()

    ;(entries[0] as HTMLElement).click()
    await flushPromises()
    expect(qa('[data-testid="history-hunk-show"]').map((b) => b.textContent?.trim())).toEqual([
      'Setup',
    ])
    expect(qa('.history__word--changed').map((w) => w.textContent)).toEqual(['better ', ' twice'])
    ;(q('[data-testid="history-hunk-show"]') as HTMLElement).click()
    await flushPromises()
    // the hunk starts at the heading; it changed lines 3 to 8, found again under "Setup"
    expect(shown).toEqual([
      { line: 3, count: 6, heading: 'Setup', headingOccurrence: 1, offset: 2 },
    ])
    expect(open.value).toBe(false)
    wrapper.unmount()
  })

  it('undoes one change after showing who made it, and says why it could not', async () => {
    let answer = () => json({}, 200)
    const shared = {
      ...revisions[0]!,
      coAuthors: [{ name: 'Anna', email: '', username: 'anna' }],
      agents: [{ name: 'Claude Code', accountId: 'b' }],
      summary: { linesAdded: 1, linesRemoved: 1, headings: ['Setup'] },
    }
    const { wrapper, requests, open } = await setup({
      'GET /server-info/': () => json({ features: ['revert'] }),
      'GET /document/d1/history/': () =>
        json([
          shared,
          {
            ...revisions[0]!,
            revision: 'mmmmmmm',
            summary: { linesAdded: 0, linesRemoved: 0, headings: [] },
          },
          revisions[1],
        ]),
      'GET /document/d1/history/diff/': () => json(FIXTURE_DIFF),
      'POST /document/d1/history/bbbbbbb/revert/': () => answer(),
    })
    const entries = qa('[data-testid="history-entry"]')
    // a move changed no lines; the first commit cannot be undone
    ;(entries[1] as HTMLElement).click()
    await flushPromises()
    expect(q('[data-testid="history-undo"]')).toBeNull()
    ;(q('[aria-label="Back to the list"]') as HTMLElement).click()
    await flushPromises()
    ;(entries[2] as HTMLElement).click()
    await flushPromises()
    expect(q('[data-testid="history-undo"]')).toBeNull()
    ;(q('[aria-label="Back to the list"]') as HTMLElement).click()
    await flushPromises()

    ;(entries[0] as HTMLElement).click()
    await flushPromises()
    ;(q('[data-testid="history-undo"]') as HTMLElement).click()
    await flushPromises()
    expect(q('[data-testid="history-undo-makers"]')?.textContent).toContain(
      'Made by Opa Hans, Anna via Claude Code',
    )
    expect(q('[data-testid="history-undo-shared"]')).not.toBeNull()
    expect(qa('[data-testid="history-undo-dialog"] [data-testid="history-line"]').length).toBe(10)

    answer = () =>
      json(
        { code: 'revert-conflict', message: 'conflict', details: { headings: ['Setup', null] } },
        409,
      )
    ;(q('[data-testid="history-undo-confirm"]') as HTMLElement).click()
    await flushPromises()
    expect(q('[data-testid="history-undo-error"]')?.textContent).toContain(
      'changed again later in Setup, the start of the page',
    )
    expect(open.value).toBe(true)

    answer = () => json({ code: 'nothing-to-revert', message: 'gone' }, 409)
    ;(q('[data-testid="history-undo-confirm"]') as HTMLElement).click()
    await flushPromises()
    expect(q('[data-testid="history-undo-error"]')?.textContent).toContain('already gone')

    answer = () => json({ ...shared, revision: 'rrrrrrr', message: 'Revert bbbbbbb' })
    ;(q('[data-testid="history-undo-confirm"]') as HTMLElement).click()
    await flushPromises()
    expect(requests.filter((r) => r.url.endsWith('/bbbbbbb/revert/'))).toHaveLength(3)
    expect(open.value).toBe(false)
    wrapper.unmount()
  })

  it('offers no undo on servers without it', async () => {
    const { wrapper } = await setup({
      'GET /document/d1/history/': () => json(revisions),
      'GET /document/d1/history/diff/': () => json(FIXTURE_DIFF),
    })
    ;(qa('[data-testid="history-entry"]')[0] as HTMLElement).click()
    await flushPromises()
    expect(q('[data-testid="history-undo"]')).toBeNull()
    wrapper.unmount()
  })

  it('explains when the server has no history', async () => {
    const { wrapper } = await setup({})
    expect(document.body.textContent).toContain('No version history')
    wrapper.unmount()
  })

  it('offers no restore to readers', async () => {
    const { wrapper } = await setup(
      {
        'GET /document/d1/history/': () => json(revisions),
        'GET /document/d1/history/aaaaaaa/content/': () => new Response('erste'),
      },
      true,
    )
    ;(qa('[data-testid="history-entry"]')[1] as HTMLElement).click()
    await flushPromises()
    expect(q('[data-testid="history-restore"]')).toBeNull()
    wrapper.unmount()
  })
})
