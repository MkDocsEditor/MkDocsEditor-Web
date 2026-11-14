import { describe, expect, it } from 'vitest'

import { describeOAuthTarget } from './oauthConsent'

describe('describeOAuthTarget', () => {
  it('names the listener of an app on this computer', () => {
    expect(describeOAuthTarget('http://localhost:54321/callback')).toEqual({
      label: 'localhost:54321',
      local: true,
    })
    expect(describeOAuthTarget('http://127.0.0.1:3000/cb').local).toBe(true)
    expect(describeOAuthTarget('http://[::1]:3000/cb').local).toBe(true)
  })

  it('names the host of a web address, which is not on this computer', () => {
    expect(describeOAuthTarget('https://claude.ai/api/mcp/auth_callback')).toEqual({
      label: 'claude.ai',
      local: false,
    })
    // a lookalike stays a remote host
    expect(describeOAuthTarget('https://localhost.evil.example/cb').local).toBe(false)
  })

  it('names the scheme of an app', () => {
    expect(describeOAuthTarget('cursor://anysphere.cursor-retrieval/oauth/callback')).toEqual({
      label: 'cursor://anysphere.cursor-retrieval',
      local: true,
    })
  })
})
