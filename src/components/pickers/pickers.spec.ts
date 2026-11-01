import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { ApiClient, setApiClient } from '@/api'
import { useTreeStore } from '@/stores/tree'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import LinkPickerDialog from './LinkPickerDialog.vue'
import ResourcePickerDialog from './ResourcePickerDialog.vue'

const el = (testid: string) => document.querySelector(`[data-testid="${testid}"]`) as HTMLElement
const all = (testid: string) => [
  ...document.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`),
]
const byText = (testid: string, text: string) =>
  all(testid).find((e) => e.textContent?.includes(text))!

function type(testid: string, value: string): void {
  const input = el(testid).querySelector('input')!
  input.value = value
  input.dispatchEvent(new Event('input'))
}

const strand = {
  type: 'resource' as const,
  id: 'r-strand',
  name: 'Strand.png',
  filesize: 1,
  modtime: '',
}

async function setup(
  component: typeof LinkPickerDialog | typeof ResourcePickerDialog,
  selection = '',
) {
  let uploaded = false
  const mock = createFetchMock({
    'GET /section/': () => {
      const tree = sampleTree()
      if (uploaded) {
        const urlaub = tree.subsections.find((s) => s.name === 'Urlaub')!
        urlaub.resources.push(strand)
      }
      return json(tree)
    },
    'GET /document/d-suppe/content/': () =>
      new Response('# Kürbissuppe\n\n## Zutaten\n\n## Zubereitung'),
    'GET /resource/r-logo/content/': () => new Response('png'),
    'GET /resource/r-apfel/content/': () => new Response('png'),
    'POST /resource/s-urlaub/Strand.png/': () => {
      uploaded = true
      return json(strand)
    },
  })
  setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
  URL.createObjectURL = vi.fn(() => 'blob:x')
  const props = reactive({
    modelValue: false,
    documentId: 'd-apfel',
    text: '# Apfelkuchen\n## Teig',
    selection,
  })
  const result = await mountWithPlugins(component, { props })
  await useTreeStore().load()
  props.modelValue = true
  await flushPromises()
  const emitted = () =>
    result.wrapper.findComponent(component).emitted('insert') as unknown[][] | undefined
  return { ...result, props, emitted, mock }
}

describe('LinkPickerDialog', () => {
  afterEach(() => {
    setApiClient(null)
    document.body.innerHTML = ''
  })

  it('links a heading of another page with the selection as text', async () => {
    const { emitted, wrapper } = await setup(LinkPickerDialog, 'die Suppe')
    // starts in the page's folder; go up to Rezepte
    expect(el('browser-current').textContent).toBe('Kuchen')
    el('browser-up').click()
    await flushPromises()
    byText('browser-document', 'Kürbissuppe').click()
    await flushPromises()
    byText('link-heading', 'Zubereitung').click()
    await flushPromises()
    expect(emitted()?.[0]).toEqual(['[die Suppe](../Kürbissuppe.md#zubereitung)'])
    wrapper.unmount()
  })

  it('links a folder, files and its own headings found by the search', async () => {
    const { emitted, wrapper } = await setup(LinkPickerDialog)
    type('browser-search', 'logo')
    await flushPromises()
    byText('browser-hit-resource', 'logo.png').click()
    await flushPromises()
    expect(emitted()?.[0]).toEqual(['[logo.png](../../logo.png)'])
    wrapper.unmount()
  })

  it('links to the own page heading and to a web address', async () => {
    const { emitted, props, wrapper } = await setup(LinkPickerDialog)
    byText('browser-document', 'Apfelkuchen').click()
    await flushPromises()
    byText('link-heading', 'Teig').click()
    await flushPromises()
    expect(emitted()?.[0]).toEqual(['[Teig](#teig)'])

    props.modelValue = true
    await flushPromises()
    el('link-tab-web').click()
    await flushPromises()
    type('link-url', 'https://example.com/a b')
    await flushPromises()
    el('link-insert-web').click()
    expect(emitted()?.[1]).toEqual(['[https://example.com/a b](https://example.com/a%20b)'])
    wrapper.unmount()
  })
})

describe('ResourcePickerDialog', () => {
  afterEach(() => {
    setApiClient(null)
    document.body.innerHTML = ''
  })

  it('inserts an image from another folder with a relative path', async () => {
    const { emitted, wrapper } = await setup(ResourcePickerDialog)
    // only images: the PDF of the page's folder is hidden
    expect(all('browser-resource').map((e) => e.textContent?.trim())).toEqual([
      expect.stringContaining('apfel.png'),
    ])
    type('browser-search', 'logo')
    await flushPromises()
    byText('browser-hit-resource', 'logo.png').click()
    expect(emitted()?.[0]).toEqual([['![logo](../../logo.png)']])
    wrapper.unmount()
  })

  it('links other files when images only is off', async () => {
    const { emitted, wrapper } = await setup(ResourcePickerDialog, 'der Plan')
    el('resource-images-only').querySelector('input')!.click()
    await flushPromises()
    byText('browser-resource', 'Plan (alt).pdf').click()
    expect(emitted()?.[0]).toEqual([['[der Plan](Plan%20%28alt%29.pdf)']])
    wrapper.unmount()
  })

  it('uploads into a chosen folder', async () => {
    const { emitted, mock, wrapper } = await setup(ResourcePickerDialog)
    el('resource-tab-upload').click()
    await flushPromises()
    expect(el('upload-target').textContent).toBe('Rezepte/Kuchen')
    el('browser-up').click()
    await flushPromises()
    el('browser-up').click()
    await flushPromises()
    byText('browser-section', 'Urlaub').click()
    await flushPromises()
    expect(el('upload-target').textContent).toBe('Urlaub')
    const input = el('resource-file-input') as HTMLInputElement
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'Strand.png', { type: 'image/png' })],
      configurable: true,
    })
    input.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(emitted()?.[0]).toEqual([['![Strand](../../Urlaub/Strand.png)']]))
    expect(mock.requests.some((r) => r.method === 'POST')).toBe(true)
    wrapper.unmount()
  })

  it('embeds an image from a web address', async () => {
    const { emitted, wrapper } = await setup(ResourcePickerDialog)
    el('resource-tab-web').click()
    await flushPromises()
    type('resource-url', 'https://example.com/cat.jpg')
    await flushPromises()
    el('resource-insert-web').click()
    expect(emitted()?.[0]).toEqual([['![cat.jpg](https://example.com/cat.jpg)']])
    wrapper.unmount()
  })
})
