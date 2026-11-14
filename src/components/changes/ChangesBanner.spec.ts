import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import type { DocumentChanges } from '@/api'
import { mountWithPlugins } from '@/test/mount'

import ChangesBanner from './ChangesBanner.vue'

const CHANGES: DocumentChanges = {
  since: { time: '2026-11-14T03:00:24.962Z', seenToken: 'old' },
  seenToken: 'new',
  authors: [
    { accountId: 'a', displayName: 'alice', color: '#e8590c', avatar: null, agents: [] },
    { accountId: 'b', displayName: 'bob', color: '#2f9e44', avatar: null, agents: ['Claude Code'] },
  ],
  hunks: [
    {
      heading: 'Setup',
      headingOccurrence: 1,
      offset: 0,
      oldStart: 1,
      oldLines: 2,
      newStart: 1,
      newLines: 2,
      lines: [
        { op: ' ', text: '# Setup' },
        { op: '-', text: 'Some text.' },
        { op: '+', text: 'Some better text.' },
      ],
    },
  ],
  summary: { linesAdded: 1, linesRemoved: 1, headings: ['Setup'] },
}

const q = (selector: string) => document.querySelector<HTMLElement>(selector)

describe('ChangesBanner', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('says who changed what, and counts as seen once the changes were looked at', async () => {
    const { wrapper } = await mountWithPlugins(ChangesBanner, { props: { changes: CHANGES } })
    expect(q('[data-testid="changes-banner-text"]')?.textContent).toContain(
      'by alice and bob via Claude Code · Setup',
    )
    q('[data-testid="changes-show"]')!.click()
    await flushPromises()
    expect(q('[data-testid="changes-dialog"]')).not.toBeNull()
    expect(wrapper.findComponent(ChangesBanner).emitted('dismiss')).toBeUndefined()
    q('[data-testid="history-hunk-show"]')!.click()
    await flushPromises()
    expect(wrapper.findComponent(ChangesBanner).emitted('show')?.[0]?.[0]).toMatchObject({
      line: 2,
      heading: 'Setup',
    })
    expect(wrapper.findComponent(ChangesBanner).emitted('dismiss')).toHaveLength(1)
    wrapper.unmount()
  })

  it('is dismissed without looking', async () => {
    const { wrapper } = await mountWithPlugins(ChangesBanner, { props: { changes: CHANGES } })
    q('[data-testid="changes-dismiss"]')!.click()
    expect(wrapper.findComponent(ChangesBanner).emitted('dismiss')).toHaveLength(1)
    wrapper.unmount()
  })
})
