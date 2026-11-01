import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { mountWithPlugins } from '@/test/mount'

import FormatToolbar from './FormatToolbar.vue'

let view: EditorView | null = null

async function setup(doc: string, props: Record<string, unknown> = {}) {
  view = new EditorView({
    state: EditorState.create({ doc, selection: EditorSelection.range(0, doc.length) }),
    parent: document.body,
  })
  const { wrapper } = await mountWithPlugins(FormatToolbar, {
    props: { view: () => view, ...props },
  })
  return wrapper
}

describe('FormatToolbar', () => {
  afterEach(() => {
    view?.destroy()
    view = null
    document.body.innerHTML = ''
  })

  it('formats the selection and shows the shortcut in the label', async () => {
    const wrapper = await setup('word')
    const bold = wrapper.find('[data-testid="format-bold"]')
    expect(bold.attributes('aria-label')).toMatch(/^Bold \((Ctrl\+B|⌘B)\)$/)
    await bold.trigger('click')
    expect(view!.state.doc.toString()).toBe('**word**')
    await wrapper.find('[data-testid="format-taskList"]').trigger('click')
    expect(view!.state.doc.toString()).toBe('- [ ] **word**')
    wrapper.unmount()
  })

  it('offers headings and admonitions in menus', async () => {
    const wrapper = await setup('Title')
    await wrapper.find('[data-testid="format-heading"]').trigger('click')
    await flushPromises()
    ;(document.querySelector('[data-testid="format-heading-2"]') as HTMLElement).click()
    expect(view!.state.doc.toString()).toBe('## Title')

    await wrapper.find('[data-testid="format-admonition"]').trigger('click')
    await flushPromises()
    ;(document.querySelector('[data-testid="format-admonition-tip"]') as HTMLElement).click()
    expect(view!.state.doc.toString()).toBe('!!! tip "Tip"\n    ## Title')
    wrapper.unmount()
  })

  it('lets the page replace a button, for example with a picker', async () => {
    const link = vi.fn()
    const wrapper = await setup('word', { override: { link } })
    await wrapper.find('[data-testid="format-link"]').trigger('click')
    expect(link).toHaveBeenCalled()
    expect(view!.state.doc.toString()).toBe('word')
    wrapper.unmount()
  })

  it('keeps the focus in the editor', async () => {
    const wrapper = await setup('word')
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    wrapper.find('[data-testid="format-bold"]').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    wrapper.unmount()
  })
})
