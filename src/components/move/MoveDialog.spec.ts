import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiClient, setApiClient } from '@/api'
import type { MoveRequest, MoveResult } from '@/api'
import { useMoveStore } from '@/stores/move'
import { useTreeStore } from '@/stores/tree'
import { createFetchMock, json } from '@/test/fetchMock'
import { sampleTree } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import MoveDialog from './MoveDialog.vue'
import { moveErrorText } from './moveErrors'
import { ApiError } from '@/api'

const el = (testid: string) => document.querySelector(`[data-testid="${testid}"]`) as HTMLElement
const all = (testid: string) => [
  ...document.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`),
]

function result(request: MoveRequest, newPath: string): MoveResult {
  return {
    dryRun: request.dryRun ?? false,
    type: request.type,
    oldId: request.id,
    newId: `${request.id}-neu`,
    oldPath: 'Rezepte/Kuchen',
    newPath,
    moved: [
      {
        type: 'section',
        oldId: 's-kuchen',
        newId: 's-kuchen-neu',
        oldPath: 'Rezepte/Kuchen',
        newPath,
      },
      {
        type: 'document',
        oldId: 'd-apfel',
        newId: 'd-apfel-neu',
        oldPath: 'Rezepte/Kuchen/Apfelkuchen.md',
        newPath: `${newPath}/Apfelkuchen.md`,
      },
    ],
    documents: [
      {
        documentId: 'd-index',
        newDocumentId: 'd-index',
        path: 'index.md',
        newPath: 'index.md',
        edits: [
          {
            line: 3,
            before: '[Kuchen](Rezepte/Kuchen/Apfelkuchen.md)',
            after: `[Kuchen](${newPath}/Apfelkuchen.md)`,
          },
        ],
      },
    ],
    config: [
      { file: 'mkdocs.yml', line: 9, before: '  - Rezepte/Kuchen', after: `  - ${newPath}` },
    ],
  }
}

async function setup(answer?: (request: MoveRequest) => Response) {
  const requests: MoveRequest[] = []
  const mock = createFetchMock({
    'GET /section/': () => json(sampleTree()),
    'POST /move/': (request) => {
      const body = JSON.parse(String(request.body)) as MoveRequest
      requests.push(body)
      if (answer) return answer(body)
      const target = body.parent === 's-urlaub' ? 'Urlaub' : 'Rezepte'
      return json(result(body, `${target}/${body.name ?? 'Kuchen'}`))
    },
  })
  setApiClient(new ApiClient({ baseUrl: 'http://b', fetchFn: mock.fetchFn }))
  const mounted = await mountWithPlugins(MoveDialog, { initialPath: '/section/s-kuchen' })
  const tree = useTreeStore()
  await tree.load()
  return { ...mounted, requests, tree, move: useMoveStore() }
}

async function settle() {
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
}

describe('MoveDialog', () => {
  afterEach(() => {
    vi.useRealTimers()
    setApiClient(null)
    document.body.innerHTML = ''
  })

  it('previews the move of a folder, then moves it and follows the open view', async () => {
    vi.useFakeTimers()
    const { move, requests, router, wrapper } = await setup()
    move.open(useTreeStore().get('s-kuchen')!)
    await flushPromises()
    // starts in the folder's parent; nothing to preview yet
    expect(el('move-target').textContent).toBe('Rezepte')
    expect(el('move-preview').textContent).toContain('Choose another folder or name.')
    expect(el('move-apply').hasAttribute('disabled')).toBe(true)

    el('browser-up').click()
    await flushPromises()
    // the folder itself cannot be a target
    all('browser-section')
      .find((e) => e.textContent?.includes('Urlaub'))!
      .click()
    await settle()
    expect(el('move-target').textContent).toBe('Urlaub')
    expect(requests).toEqual([
      { type: 'section', id: 's-kuchen', parent: 's-urlaub', dryRun: true },
    ])
    expect(el('move-new-path').textContent).toBe('Urlaub/Kuchen')
    expect(el('move-summary').textContent).toContain('Links are updated in 1 page (1 line)')
    expect(el('move-preview').textContent).toContain('1 item inside move along')
    expect(all('move-document')).toHaveLength(1)
    expect(el('move-config')).not.toBeNull()

    el('move-apply').click()
    await settle()
    expect(requests.at(-1)).toEqual({
      type: 'section',
      id: 's-kuchen',
      parent: 's-urlaub',
      dryRun: false,
    })
    expect(move.item).toBeNull()
    expect(router.currentRoute.value.fullPath).toBe('/section/s-kuchen-neu')
    wrapper.unmount()
  })

  it('renames in place and does not offer moving into the folder itself', async () => {
    vi.useFakeTimers()
    const { move, requests, wrapper } = await setup()
    move.open(useTreeStore().get('s-rezepte')!)
    await flushPromises()
    const kuchen = () => all('browser-section').find((e) => e.textContent?.includes('Rezepte'))!
    expect(kuchen().classList).toContain('v-list-item--disabled')
    const input = el('move-name').querySelector('input')!
    input.value = 'Gerichte'
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(requests).toEqual([{ type: 'section', id: 's-rezepte', name: 'Gerichte', dryRun: true }])
    wrapper.unmount()
  })

  it('names documents without .md and shows conflicts', async () => {
    vi.useFakeTimers()
    const { move, requests, wrapper } = await setup(() =>
      json(
        {
          code: 'conflict',
          message: 'exists',
          details: { reason: 'exists', path: 'Rezepte/Kuchen/Torte.md' },
        },
        409,
      ),
    )
    move.open(useTreeStore().get('d-apfel')!)
    await flushPromises()
    const input = el('move-name').querySelector('input')!
    input.value = 'Torte.md'
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(requests[0]).toEqual({ type: 'document', id: 'd-apfel', name: 'Torte', dryRun: true })
    expect(el('move-problem').textContent).toContain('“Rezepte/Kuchen/Torte.md” exists already')
    expect(el('move-apply').hasAttribute('disabled')).toBe(true)
    wrapper.unmount()
  })
})

describe('moveErrorText', () => {
  it('explains the reasons of the backend', () => {
    const bad = (reason: string) => new ApiError('x', 400, 'bad-request', { reason })
    expect(moveErrorText(bad('into-itself'))).toBe('A folder cannot move into itself.')
    expect(moveErrorText(bad('root'))).toBe('The top folder cannot be moved.')
    expect(moveErrorText(new ApiError('x', 404, ''))).toContain('cannot move items yet')
    expect(moveErrorText(new ApiError('x', 404, 'not-found'))).toContain('does not exist')
    expect(moveErrorText(new ApiError('x', 403, 'forbidden'))).toContain('Only editors')
  })
})
