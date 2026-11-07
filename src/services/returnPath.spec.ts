import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { goToReturnPath, isAppPath, returnPathOf, safeReturnPath } from './returnPath'

const Stub = { render: () => null }
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'home', component: Stub },
    { path: '/document/:id', name: 'document', component: Stub },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

describe('safeReturnPath', () => {
  it('takes paths on this host, with query and fragment', () => {
    expect(safeReturnPath('/view/Haus/')).toBe('/view/Haus/')
    expect(safeReturnPath('/document/1?change=x#top')).toBe('/document/1?change=x#top')
    expect(safeReturnPath('/view/K%C3%BCche/')).toBe('/view/K%C3%BCche/')
  })

  it.each([
    ['another host', '//evil.example/'],
    ['another host with a backslash', '/\\evil.example/'],
    ['a backslash later on', '/view\\..\\..\\evil'],
    ['a scheme', 'https://evil.example/'],
    ['javascript', 'javascript:alert(1)'],
    ['a relative path', 'view/'],
    ['a tab in the host part', '/\t/evil.example/'],
    ['a newline', '/view/\n'],
    ['leading whitespace', ' /view/'],
    ['an empty value', ''],
    ['no string', 42],
  ])('rejects %s', (_, value) => {
    expect(safeReturnPath(value)).toBeUndefined()
  })
})

describe('returnPathOf', () => {
  it('prefers next, then redirect, then home', () => {
    expect(returnPathOf({ next: '/view/a/', redirect: '/document/1' })).toBe('/view/a/')
    expect(returnPathOf({ next: '//evil.example', redirect: '/document/1' })).toBe('/document/1')
    expect(returnPathOf({ next: ['/view/b/', '/view/c/'] })).toBe('/view/b/')
    expect(returnPathOf({})).toBe('/')
  })
})

describe('going there', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('tells routes of the app from other paths on the host', () => {
    expect(isAppPath(router, '/document/1')).toBe(true)
    expect(isAppPath(router, '/')).toBe(true)
    expect(isAppPath(router, '/view/Haus/')).toBe(false)
    expect(isAppPath(router, '/api/server-info/')).toBe(false)
  })

  it('routes inside the app, and loads other pages', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign, origin: window.location.origin })
    await goToReturnPath(router, '/document/7?section=Zutaten')
    expect(router.currentRoute.value.fullPath).toBe('/document/7?section=Zutaten')
    expect(assign).not.toHaveBeenCalled()
    await goToReturnPath(router, '/view/Haus/')
    expect(assign).toHaveBeenCalledWith('/view/Haus/')
  })
})
