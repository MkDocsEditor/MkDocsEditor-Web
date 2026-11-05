import { afterEach, describe, expect, it } from 'vitest'

import {
  clearAccessRequest,
  joinLink,
  joinPath,
  loadAccessRequest,
  rememberJoinTarget,
  saveAccessRequest,
  takeJoinTarget,
} from './join'

afterEach(() => localStorage.clear())

describe('join links', () => {
  it('holds the document and the sender', () => {
    expect(joinPath('d/1', 'a b')).toBe('/join/d%2F1?from=a%20b')
    expect(joinPath('d1')).toBe('/join/d1')
    expect(joinPath('d1', 'acc', 'tab')).toBe('/join/d1?from=acc&instance=tab')
    expect(joinLink('d1', 'acc')).toBe(`${window.location.origin}/join/d1?from=acc`)
  })

  it('gives the remembered target once', () => {
    rememberJoinTarget('/join/d1?from=acc')
    expect(takeJoinTarget()).toBe('/join/d1?from=acc')
    expect(takeJoinTarget()).toBeNull()
  })

  it('accepts only join paths, and not forever', () => {
    localStorage.setItem(
      'mkdocseditor.joinTarget',
      JSON.stringify({ path: '//evil.example', savedAt: Date.now() }),
    )
    expect(takeJoinTarget()).toBeNull()
    rememberJoinTarget('/join/d1')
    expect(takeJoinTarget(Date.now() + 15 * 24 * 60 * 60 * 1000)).toBeNull()
  })

  it('keeps an access request until it is cleared', () => {
    saveAccessRequest({ token: 'mda_x', expiresAt: '2026-11-12T00:00:00Z' })
    expect(loadAccessRequest()?.token).toBe('mda_x')
    clearAccessRequest()
    expect(loadAccessRequest()).toBeNull()
  })
})
