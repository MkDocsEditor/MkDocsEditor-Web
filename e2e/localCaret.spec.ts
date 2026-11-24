import { expect, test } from '@playwright/test'

import {
  backendRequest,
  createDocument,
  editorText,
  openEditor,
  testName,
  userPage,
} from './helpers'
import { BACKEND_URL, USERS } from './ports'

/** Calls a tool of the wiki MCP with `token`: its structured result and its text. */
async function tool(
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ revision?: string; text: string }> {
  const answer = await fetch(`${BACKEND_URL}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  })
  const body = await answer.text()
  expect(answer.ok, body).toBe(true)
  expect(body).not.toContain('"isError":true')
  // a JSON answer, or one event of a stream
  const json = JSON.parse(body.startsWith('{') ? body : body.slice(body.indexOf('{'))) as {
    result?: { structuredContent?: { revision?: string }; content?: { text?: string }[] }
  }
  return {
    ...json.result?.structuredContent,
    text: json.result?.content?.map((c) => c.text ?? '').join('') ?? '',
  }
}

/** The text of a page and its revision, as an agent reads it. */
async function read(token: string, id: string): Promise<{ revision: string; content: string }> {
  const { text } = await tool(token, 'read_document', { document: id })
  const revision = /^revision: (\S+)$/m.exec(text)?.[1] ?? ''
  return { revision, content: text.slice(text.indexOf('\n---\n') + 5) }
}

const PAGE = [
  '# Testseite',
  '',
  'Der erste Satz steht hier. Und noch mehr Text danach.',
  '',
  '- Punkt eins',
  '- Punkt zwei',
  '- Punkt drei',
  '',
  'Ein Absatz a. b. c. d. e. f. g. h. i.',
  '',
  'Ende der Seite.',
].join('\n')

test('the own caret stays where it is while an agent edits the page live', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the same on every screen')
  const info = (await (await fetch(`${BACKEND_URL}/server-info/`)).json()) as {
    features?: string[]
  }
  test.skip(!info.features?.includes('agent-focus'), 'the backend has no agent focus yet')
  const created = await backendRequest(
    'POST',
    '/account/tokens/',
    { name: testName('Agent neben mir', testInfo), scope: 'write', expiresInDays: 1 },
    USERS.alice,
  )
  const { token } = (await created.json()) as { token: string }
  const id = await createDocument(testName('Cursor bleibt', testInfo))
  let { revision } = await tool(token, 'edit_document', {
    document: id,
    edits: [{ old: '', new: PAGE }],
  })
  const bob = await userPage(browser, USERS.bob, testInfo.project.use)
  await openEditor(bob, id)
  await expect.poll(() => editorText(bob)).toBe(PAGE)
  await bob.locator('.cm-content').click()
  await bob.keyboard.press('ControlOrMeta+End')
  await bob.keyboard.press('Enter')

  // bob writes lines at the end, with pauses, while the agent edits above
  const lines = ['junk eins', 'junk zwei', 'junk drei', 'junk vier', 'junk fünf', 'junk sechs']
  const typing = (async () => {
    for (const line of lines) {
      await bob.keyboard.type(line, { delay: 40 })
      await bob.keyboard.press('Enter')
      await bob.waitForTimeout(300)
    }
  })()
  const agent = (async () => {
    // most of the page anew, then edits all over it
    ;({ revision } = await tool(token, 'write_document', {
      document: id,
      baseRevision: revision,
      content: PAGE.replace('Der erste Satz steht hier.', 'Ganz neu geschrieben.').replace(
        '- Punkt zwei',
        '- Punkt zwei, anders',
      ),
      live: true,
    }))
    const edits: [string, string][] = [
      ['Ende der Seite.', 'Ende der Seite. Mehr.'],
      [' d. e. f. g. h.', ''],
      ['Ganz neu', 'Ganz und gar neu'],
      ['- Punkt eins', '- Punkt eins, geändert'],
      ['- Punkt drei', '- Punkt 3'],
      ['Mehr.', 'Mehr. Noch mehr.'],
    ]
    for (const [old, replacement] of edits) {
      ;({ revision } = await tool(token, 'edit_document', {
        document: id,
        edits: [{ old, new: replacement }],
        live: true,
      }))
      await bob.waitForTimeout(150)
    }
    // a one-word change in the middle, written whole, as read
    const page = await read(token, id)
    await tool(token, 'write_document', {
      document: id,
      baseRevision: page.revision,
      content: page.content.replace('Absatz', 'Abschnitt'),
      live: true,
    })
  })()
  await Promise.all([typing, agent])
  await expect(bob.locator('.cm-unrevealed')).toHaveCount(0, { timeout: 15_000 })
  await expect.poll(() => editorText(bob)).toContain('Abschnitt')

  // everything bob wrote is where he wrote it: at the end, in one piece
  const written = lines.join('\n') + '\n'
  expect(await editorText(bob)).toContain(written)
  expect((await editorText(bob)).endsWith(written)).toBe(true)

  // a pause, then a line up: on the line above
  await bob.waitForTimeout(1_000)
  await bob.keyboard.press('ArrowUp')
  await bob.keyboard.type('UP')
  await expect
    .poll(async () => (await editorText(bob)).slice(-'junk fünf\nUPjunk sechs\n'.length))
    .toBe('junk fünf\nUPjunk sechs\n')
})

test('the own caret goes a line up into text an agent is still typing out', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the same on every screen')
  const info = (await (await fetch(`${BACKEND_URL}/server-info/`)).json()) as {
    features?: string[]
  }
  test.skip(!info.features?.includes('agent-focus'), 'the backend has no agent focus yet')
  const created = await backendRequest(
    'POST',
    '/account/tokens/',
    { name: testName('Agent tippt', testInfo), scope: 'write', expiresInDays: 1 },
    USERS.alice,
  )
  const { token } = (await created.json()) as { token: string }
  const id = await createDocument(testName('Hoch in Verborgenes', testInfo))
  await tool(token, 'edit_document', {
    document: id,
    edits: [{ old: '', new: '# Titel\n\nErste Zeile.\n\nOben\nUnten' }],
  })
  const bob = await userPage(browser, USERS.bob, testInfo.project.use)
  await openEditor(bob, id)
  await bob.locator('.cm-content').click()
  await bob.keyboard.press('ControlOrMeta+End')

  // a long line with formatting, still hidden for the most part when bob goes up into it
  const more = ' mit **fett** und `code` und *schräg* und [einem Link](https://example.com)'.repeat(
    8,
  )
  await tool(token, 'edit_document', {
    document: id,
    edits: [{ old: 'Oben', new: 'Oben' + more }],
    live: true,
  })
  await expect(bob.locator('.cm-unrevealed').first()).toBeVisible()
  await bob.waitForTimeout(300)
  for (const x of ['X', 'Y', 'Z']) {
    await bob.keyboard.press('ArrowUp')
    await bob.keyboard.press('ArrowDown')
    await bob.keyboard.press('ArrowUp')
    await bob.keyboard.type(x)
    await bob.keyboard.press('ArrowDown')
    await bob.waitForTimeout(200)
  }
  await expect(bob.locator('.cm-unrevealed')).toHaveCount(0, { timeout: 30_000 })
  const lines = (await editorText(bob)).split('\n')
  // all of it in the line with the agent's text, none further up
  expect(lines.slice(0, 4)).toEqual(['# Titel', '', 'Erste Zeile.', ''])
  expect(lines[4]).toMatch(/X/)
  expect(lines[4]).toMatch(/Y/)
  expect(lines[4]).toMatch(/Z/)
})
