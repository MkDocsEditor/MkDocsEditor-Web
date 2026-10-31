import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'

import {
  ancestorsOf,
  indexTree,
  resolveRelative,
  searchTree,
  sortByName,
  useTreeStore,
} from './tree'

describe('tree helpers', () => {
  const index = indexTree(sampleTree())

  it('indexes every item and its parent', () => {
    expect(index.items.size).toBe(8)
    expect(index.parents.get('d-apfel')).toBe('s-kuchen')
    expect(index.parents.get('s-kuchen')).toBe('s-rezepte')
    expect(index.parents.has('root')).toBe(false)
  })

  it('lists ancestors from the root down', () => {
    expect(ancestorsOf(index, 'd-apfel').map((s) => s.id)).toEqual([
      'root',
      's-rezepte',
      's-kuchen',
    ])
    expect(ancestorsOf(index, 'root')).toEqual([])
  })

  it('searches case and accent insensitive, documents first', () => {
    expect(searchTree(index, 'KURBIS').map((h) => h.item.id)).toEqual(['d-suppe'])
    expect(searchTree(index, 'kuchen').map((h) => h.item.id)).toEqual(['d-apfel', 's-kuchen'])
    expect(searchTree(index, 'apfel kuchen')[0]?.path).toEqual(['Rezepte', 'Kuchen'])
    expect(searchTree(index, '   ')).toEqual([])
    expect(searchTree(index, 'docs')).toEqual([])
  })

  it('sorts names naturally', () => {
    const names = sortByName([{ name: 'b10' }, { name: 'B2' }, { name: 'a' }]).map((x) => x.name)
    expect(names).toEqual(['a', 'B2', 'b10'])
  })
})

describe('tree store', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => setApiClient(null))

  function backend() {
    let tree = sampleTree()
    const mock = createFetchMock({
      'GET /section/': () => json(tree),
      'POST /document/': () => {
        tree = sampleTree()
        tree.documents.push({
          type: 'document',
          id: 'd-new',
          name: 'Neu',
          filesize: 0,
          modtime: '',
          url: 'Neu/',
        })
        return json(tree.documents.at(-1))
      },
      'POST /resource/root/logo%20(2).png/': () => {
        tree.resources.push({
          type: 'resource',
          id: 'r2',
          name: 'logo (2).png',
          filesize: 1,
          modtime: '',
        })
        return json(tree.resources.at(-1))
      },
      'POST /resource/root/logo%20(3).png/': () => {
        tree.resources.push({
          type: 'resource',
          id: 'r3',
          name: 'logo (3).png',
          filesize: 1,
          modtime: '',
        })
        return json(tree.resources.at(-1))
      },
      'DELETE /section/s-urlaub/': () => {
        tree = sampleTree()
        tree.subsections.pop()
        return new Response(null, { status: 200 })
      },
    })
    setApiClient(
      new ApiClient({ baseUrl: 'http://b', getCredentials: () => null, fetchFn: mock.fetchFn }),
    )
    return mock
  }

  it('loads once for concurrent callers and offers lookups', async () => {
    const { requests } = backend()
    const store = useTreeStore()
    await Promise.all([store.load(), store.load(), store.ensureLoaded()])
    expect(requests).toHaveLength(1)
    expect(store.document('d-apfel')?.name).toBe('Apfelkuchen')
    expect(store.section('d-apfel')).toBeUndefined()
    expect(store.parentOf('d-apfel')?.id).toBe('s-kuchen')
    expect(store.ancestors('d-apfel')).toHaveLength(3)
  })

  it('reloads the tree after changes', async () => {
    backend()
    const store = useTreeStore()
    await store.load()
    const doc = await store.createDocument('root', 'Neu')
    expect(doc.id).toBe('d-new')
    expect(store.document('d-new')).toBeDefined()
    await store.deleteSection('s-urlaub')
    expect(store.section('s-urlaub')).toBeUndefined()
  })

  it('uploads files under free names and reloads the tree', async () => {
    const { requests } = backend()
    const store = useTreeStore()
    await store.load()
    const files = [new File(['a'], 'logo.png'), new File(['b'], 'logo.png')]
    const created = await store.uploadFiles('root', files)
    expect(created.map((r) => r.name)).toEqual(['logo (2).png', 'logo (3).png'])
    expect(store.get('r3')).toBeDefined()
    const upload = requests.find((r) => r.method === 'POST')!
    expect(upload.body).toBeInstanceOf(FormData)
    expect(((upload.body as FormData).get('file') as File).name).toBe('logo (2).png')
  })

  it('keeps the error of a failed load', async () => {
    setApiClient(
      new ApiClient({
        baseUrl: 'http://b',
        getCredentials: () => null,
        fetchFn: () => Promise.reject(new Error('offline')),
      }),
    )
    const store = useTreeStore()
    await expect(store.load()).rejects.toBeDefined()
    expect(store.error).toBeDefined()
    expect(store.loading).toBe(false)
  })
})

describe('resolveRelative', () => {
  const root = sampleTree()
  const index = indexTree(root)
  const rezepte = root.subsections[0]!
  const kuchen = rezepte.subsections[0]!
  const id = (href: string, from = kuchen) => resolveRelative(index, from, href)?.id

  it('resolves pages, folders and files relative to the page folder', () => {
    expect(id('Apfelkuchen.md')).toBe('d-apfel')
    expect(id('./Apfelkuchen.md#zutaten')).toBe('d-apfel')
    expect(id('../K%C3%BCrbissuppe.md')).toBe('d-suppe')
    expect(id('../../logo.png')).toBe('r-logo')
    expect(id('/logo.png')).toBe('r-logo')
    expect(id('../../Urlaub')).toBe('s-urlaub')
  })

  it('understands MkDocs directory URLs', () => {
    expect(id('../Kürbissuppe/')).toBe('d-suppe')
    expect(id('Apfelkuchen/')).toBe('d-apfel')
    expect(id('../', rezepte)).toBe('d-index')
  })

  it('ignores absolute and unknown links', () => {
    expect(id('https://example.com/x.md')).toBeUndefined()
    expect(id('mailto:a@b.de')).toBeUndefined()
    expect(id('#anchor')).toBeUndefined()
    expect(id('Nope.md')).toBeUndefined()
    expect(id('../../../../x.png')).toBeUndefined()
  })
})
