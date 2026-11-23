import { expect, test } from '@playwright/test'

import { BACKEND_URL, USERS } from './ports'
import { backendRequest, createDocument, openEditor, testName, userPage } from './helpers'

test('an agent with an app token is here while it edits, and its text says so', async ({
  browser,
}, testInfo) => {
  const user = USERS.bob
  const name = testName('Agent', testInfo)
  const created = await backendRequest(
    'POST',
    '/account/tokens/',
    { name, scope: 'write', expiresInDays: 1 },
    user,
  )
  expect(created.ok, await created.clone().text()).toBe(true)
  const { token } = (await created.json()) as { token: string }

  const id = await createDocument(testName('Agent page', testInfo))
  const page = await userPage(browser, user)
  await openEditor(page, id)

  const edit = await fetch(`${BACKEND_URL}/document/${id}/edits/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ edits: [{ old: '', new: 'Vom Agenten geschrieben.' }] }),
  })
  test.skip(edit.status === 404, 'the backend has no content edit API yet')
  expect(edit.ok, await edit.clone().text()).toBe(true)

  // listed with a robot while it works; to follow on servers that send where it is (its focus)
  await expect(page.getByTestId('online-agent')).toHaveAttribute(
    'aria-label',
    new RegExp(`^(Follow ${name} \\(agent of .+\\)|${name} \\(agent of .+\\) is here)$`),
  )
  await expect(page.getByTestId('online-user')).toHaveCount(0)
  await expect(page.locator('.cm-content')).toContainText('Vom Agenten geschrieben.')

  // the marker is in the color of the person, and its title names the agent
  const marker = page.locator('.cm-author').first()
  await expect(marker).toHaveAttribute('title', /\S+ via .+/, { timeout: 15_000 })
  expect((await marker.getAttribute('title'))?.endsWith(` via ${name}`)).toBe(true)
})

test('a live edit of an agent is typed out, and the agent can be followed', async ({
  browser,
}, testInfo) => {
  const info = (await (await fetch(`${BACKEND_URL}/server-info/`)).json()) as {
    features?: string[]
  }
  test.skip(!info.features?.includes('agent-focus'), 'the backend has no agent focus yet')

  const user = USERS.bob
  const name = testName('Live agent', testInfo)
  const created = await backendRequest(
    'POST',
    '/account/tokens/',
    { name, scope: 'write', expiresInDays: 1 },
    user,
  )
  const { token } = (await created.json()) as { token: string }
  const id = await createDocument(testName('Live page', testInfo))
  const page = await userPage(browser, USERS.alice, testInfo.project.use)
  await openEditor(page, id)

  const text = 'Ein Agent schreibt diesen Absatz live, Zeichen für Zeichen. '.repeat(3).trim()
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
      params: {
        name: 'edit_document',
        arguments: { document: id, edits: [{ old: '', new: text }], live: true },
      },
    }),
  })
  expect(answer.ok, await answer.clone().text()).toBe(true)
  expect(await answer.text()).not.toContain('"isError":true')

  // the text is in the editor at once, hidden, and typed out bit by bit
  await expect(page.locator('.cm-unrevealed')).toBeVisible()
  await expect(page.locator('.cm-unrevealed')).toHaveCount(0, { timeout: 10_000 })
  await expect(page.locator('.cm-content')).toContainText(text)

  // the agent says where it is: it can be followed, and its cursor is at the end of its text
  const agent = page.getByTestId('online-agent')
  await expect(agent).toHaveAttribute('aria-label', new RegExp(`^Follow ${name} `))
  await agent.click()
  await expect(page.getByTestId('following')).toContainText(`Following ${name}`)
  await expect(page.locator('.cm-remote-caret')).toBeVisible()
})
