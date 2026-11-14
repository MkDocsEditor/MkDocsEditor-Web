import { describe, expect, it } from 'vitest'

import {
  claudeCommand,
  curlEdit,
  curlRead,
  defaultAgentName,
  mcpAvailable,
  mcpJson,
  mcpUrl,
  pageForAgent,
  shellQuote,
} from './agentSnippets'

const URL = 'https://wiki.example.com/api/mcp'

describe('agentSnippets', () => {
  it('puts the MCP endpoint under the backend URL', () => {
    expect(mcpUrl('https://wiki.example.com/api')).toBe(URL)
    expect(mcpUrl('https://wiki.example.com/api/')).toBe(URL)
  })

  it('quotes for the shell only where needed', () => {
    expect(shellQuote(URL)).toBe(URL)
    expect(shellQuote('Authorization: Bearer mdp_x')).toBe(`'Authorization: Bearer mdp_x'`)
    expect(shellQuote(`it's`)).toBe(`'it'\\''s'`)
  })

  it('builds the Claude Code command, with and without a token', () => {
    expect(claudeCommand(URL, 'mdp_abc')).toBe(
      `claude mcp add --transport http wiki ${URL} --header 'Authorization: Bearer mdp_abc'`,
    )
    expect(claudeCommand(URL, 'mdp_abc', true)).toBe(
      `claude mcp add --transport http --scope user wiki ${URL} --header 'Authorization: Bearer mdp_abc'`,
    )
    expect(claudeCommand(URL)).toBe(`claude mcp add --transport http wiki ${URL}`)
  })

  it('builds the JSON config for other MCP clients', () => {
    expect(JSON.parse(mcpJson(URL, 'mdp_abc'))).toEqual({
      mcpServers: {
        wiki: { type: 'http', url: URL, headers: { Authorization: 'Bearer mdp_abc' } },
      },
    })
  })

  it('builds a curl call that reads a page', () => {
    expect(curlRead('https://wiki.example.com/api', 'mdp_abc', 'd1')).toBe(
      `curl -H 'Authorization: Bearer mdp_abc' \\\n  https://wiki.example.com/api/document/d1/content/`,
    )
  })

  it('builds a curl call that edits a page', () => {
    expect(curlEdit('https://wiki.example.com/api', 'mdp_abc', 'd1')).toBe(
      [
        `curl -X POST -H 'Authorization: Bearer mdp_abc' \\`,
        `  -H 'Content-Type: application/json' \\`,
        `  -d '{"edits":[{"old":"old text","new":"new text"}]}' \\`,
        `  https://wiki.example.com/api/document/d1/edits/`,
      ].join('\n'),
    )
  })

  it('counts every answer but 404 as a live MCP server', async () => {
    const answer = (status: number) => async () => new Response(null, { status })
    expect(await mcpAvailable(URL, answer(404))).toBe(false)
    expect(await mcpAvailable(URL, answer(401))).toBe(true)
    expect(await mcpAvailable(URL, answer(405))).toBe(true)
    expect(await mcpAvailable(URL, answer(200))).toBe(true)
    const offline = async () => {
      throw new TypeError('Failed to fetch')
    }
    expect(await mcpAvailable(URL, offline)).toBeNull()
  })

  it('names the token after the device', () => {
    expect(defaultAgentName('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Firefox/140.0')).toBe(
      'Claude Code on Linux',
    )
    expect(defaultAgentName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(
      'Claude Code on macOS',
    )
    expect(defaultAgentName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(
      'Claude Code on Windows',
    )
    expect(defaultAgentName('curl/8')).toBe('Claude Code on this device')
  })

  it('describes a page for an agent', () => {
    expect(pageForAgent({ id: 'd1', title: 'Heizung', path: 'Haus/Heizung.md' })).toBe(
      'Wiki page “Heizung” (Haus/Heizung.md), document id d1',
    )
    expect(pageForAgent({ id: 'd1', title: 'Heizung' })).toBe('Wiki page “Heizung”, document id d1')
  })
})
