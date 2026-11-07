import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { authorHighlight, lineNumbers, syncScroll } from '@/composables/preferences'
import { instanceColor, setInstanceColor } from '@/sync/instance'
import { mountWithPlugins } from '@/test/mount'

import ViewPanel from './ViewPanel.vue'

const el = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)

describe('ViewPanel', () => {
  beforeEach(() => {
    authorHighlight.value = 'marker'
    syncScroll.value = true
    lineNumbers.value = true
    setInstanceColor(null)
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('changes the same settings as the settings page, at once', async () => {
    const { wrapper } = await mountWithPlugins(ViewPanel, {
      props: { split: true, lineNumbersShown: true, accountColor: '#1971c2' },
    })
    el('author-highlight-off')!.click()
    el('toggle-sync-scroll')!.querySelector('input')!.click()
    el('toggle-line-numbers')!.querySelector('input')!.click()
    await flushPromises()
    expect(authorHighlight.value).toBe('off')
    expect(syncScroll.value).toBe(false)
    expect(lineNumbers.value).toBe(false)
    wrapper.unmount()
  })

  it('shows sync scrolling only next to a split, and line numbers only where they show', async () => {
    const { wrapper } = await mountWithPlugins(ViewPanel, {
      props: { split: false, lineNumbersShown: false },
    })
    expect(el('toggle-sync-scroll')).toBeNull()
    expect(el('toggle-line-numbers')).toBeNull()
    expect(el('author-highlight-marker')).not.toBeNull()
    wrapper.unmount()
  })

  it('picks the cursor color of this tab from swatches, and goes back to the account color', async () => {
    const { wrapper } = await mountWithPlugins(ViewPanel, {
      props: { split: false, lineNumbersShown: true, accountColor: '#1971c2' },
    })
    expect(el('cursor-color-1971c2')!.getAttribute('aria-checked')).toBe('true')
    expect(el('cursor-color-reset')).toBeNull()
    el('cursor-color-9c36b5')!.click()
    await flushPromises()
    expect(instanceColor.value).toBe('#9c36b5')
    expect(el('cursor-color-9c36b5')!.getAttribute('aria-checked')).toBe('true')
    el('cursor-color-reset')!.click()
    await flushPromises()
    expect(instanceColor.value).toBeNull()
    wrapper.unmount()
  })
})
