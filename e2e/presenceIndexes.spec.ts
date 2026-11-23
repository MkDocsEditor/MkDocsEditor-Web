import { expect, test } from '@playwright/test'

import { backendRequest, createDocument, openEditor, testName, typeAt, userPage } from './helpers'
import { BACKEND_URL, USERS } from './ports'

/** Calls a tool of the MCP server with an app token; the text of its answer. */
async function callTool(token: string, name: string, args: Record<string, unknown>) {
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
  expect(answer.ok, await answer.clone().text()).toBe(true)
  return answer.text()
}

test('an agent sees where a person is in the page', async ({ browser }, testInfo) => {
  const info = (await (await fetch(`${BACKEND_URL}/server-info/`)).json()) as {
    features?: string[]
  }
  test.skip(
    !info.features?.includes('presence-indexes'),
    'the backend takes no positions as indexes yet',
  )

  const user = USERS.alice
  const created = await backendRequest(
    'POST',
    '/account/tokens/',
    { name: testName('Where agent', testInfo), scope: 'read', expiresInDays: 1 },
    user,
  )
  const { token } = (await created.json()) as { token: string }
  const id = await createDocument(testName('Where page', testInfo))
  const page = await userPage(browser, user, testInfo.project.use)
  await openEditor(page, id)
  // an emoji before the selection: the server counts code points, the browser UTF-16 units
  // (insertText for the line break, as on phones Enter goes through the IME)
  await typeAt(page, 'end', 'Erste Zeile 😀')
  await page.keyboard.insertText('\nHallo Welt')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')

  // the server has the selection from the indexes of the presence: "Welt", on line 2, at code
  // point 20 (21 in UTF-16 units, because of the emoji)
  type Viewer = {
    name: string
    position?: string
    selection?: { text: string; from: { line: number; column: number; index: number } }
    viewport?: { top: number; bottom: number }
  }
  const viewers = async () => {
    const answer = JSON.parse(await callTool(token, 'read_presence', { document: id })) as {
      result: { structuredContent: { viewers: Viewer[] } }
    }
    return answer.result.structuredContent.viewers
  }
  await expect
    .poll(async () => (await viewers())[0]?.selection?.text, { timeout: 15_000 })
    .toBe('Welt')
  const [viewer] = await viewers()
  expect(viewer).toMatchObject({
    name: `${user.username} (you)`,
    selection: { from: { line: 2, column: 7, index: 20 } },
    viewport: { top: 1, bottom: 2 },
  })
  expect(viewer!.position).toBeUndefined()
})
