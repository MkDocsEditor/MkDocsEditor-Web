import { describe, expect, it, vi } from 'vitest'

import { getConfig, loadConfig, parseConfig } from './config'

const defaults = { backendUrl: 'http://default:7413', wikiUrl: '' }

describe('parseConfig', () => {
  it('uses the defaults for missing or empty values', () => {
    expect(parseConfig({}, defaults)).toEqual(defaults)
    expect(parseConfig({ backendUrl: '  ' }, defaults)).toEqual(defaults)
    expect(parseConfig(null, defaults)).toEqual(defaults)
    expect(parseConfig('garbage', defaults)).toEqual(defaults)
  })

  it('strips trailing slashes and whitespace', () => {
    expect(
      parseConfig(
        { backendUrl: ' https://api.example.com/ ', wikiUrl: 'https://wiki.example.com//' },
        defaults,
      ),
    ).toEqual({ backendUrl: 'https://api.example.com', wikiUrl: 'https://wiki.example.com' })
  })

  it('ignores values that are not strings', () => {
    expect(parseConfig({ backendUrl: 42 }, defaults)).toEqual(defaults)
  })

  it('takes a path as the backend on the origin of the app', () => {
    const origin = window.location.origin
    expect(parseConfig({ backendUrl: '/api/' }, defaults).backendUrl).toBe(`${origin}/api`)
    expect(parseConfig({}, { backendUrl: '/api', wikiUrl: '' }).backendUrl).toBe(`${origin}/api`)
    expect(parseConfig({ backendUrl: 'https://wiki.example.com/api' }, defaults).backendUrl).toBe(
      'https://wiki.example.com/api',
    )
  })
})

describe('loadConfig', () => {
  it('reads config.json', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ backendUrl: 'https://api.example.com/' }), { status: 200 }),
      )
    const config = await loadConfig(fetchFn)
    expect(fetchFn).toHaveBeenCalledWith('/config.json', { cache: 'no-store' })
    expect(config.backendUrl).toBe('https://api.example.com')
    expect(getConfig()).toEqual(config)
  })

  it('falls back to /api of the same origin when config.json is missing or broken', async () => {
    const sameOrigin = `${window.location.origin}/api`
    await loadConfig(vi.fn().mockResolvedValue(new Response('not found', { status: 404 })))
    expect(getConfig().backendUrl).toBe(sameOrigin)
    await loadConfig(vi.fn().mockRejectedValue(new Error('offline')))
    expect(getConfig().backendUrl).toBe(sameOrigin)
  })
})
