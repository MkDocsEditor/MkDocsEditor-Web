import { expect, test } from '@playwright/test'

import { createAccount, logout, uniqueUsername } from './accounts'
import {
  backendRequest,
  createDocument,
  documentContent,
  dropDocumentSocket,
  editorText,
  installBackgroundTab,
  login,
  openEditor,
  setBackground,
  testName,
  trackSockets,
  typeAt,
  userPage,
} from './helpers'
import { USERS } from './ports'

test.describe('a tab in the background', () => {
  test('stays connected and receives edits right away', async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const id = await createDocument(testName('Hintergrund', testInfo))
    const alice = await userPage(browser, USERS.alice, testInfo.project.use)
    const bob = await userPage(browser, USERS.bob, testInfo.project.use)
    await installBackgroundTab(alice, 60_000)
    // the document socket and the events socket of the file browser
    const closed: string[] = []
    alice.on('websocket', (ws) => ws.on('close', () => closed.push(ws.url())))
    await openEditor(alice, id)
    await openEditor(bob, id)
    await setBackground(alice, true)

    // long enough for the server's 15 s timeout without heartbeats
    await new Promise((r) => setTimeout(r, 20_000))
    await typeAt(bob, 'end', 'Von Bob.')
    await expect.poll(() => editorText(alice), { timeout: 5_000 }).toBe('Von Bob.')
    expect(closed).toEqual([])
  })
})

test.describe('after losing the connection', () => {
  test('typing reconnects although the ticket request hangs', async ({ browser }, testInfo) => {
    const id = await createDocument(testName('Haengt', testInfo))
    const alice = await userPage(browser, USERS.alice, testInfo.project.use)
    await trackSockets(alice)
    await openEditor(alice, id)

    // the first request after the loss never gets an answer, like one on a dead connection
    let hanging = 0
    await alice.route('**/auth/ws-ticket/', async (route) => {
      if (hanging++ === 0) return
      await route.continue()
    })
    await dropDocumentSocket(alice)
    await expect(alice.getByTestId('connection-state')).toHaveAttribute('title', /Offline/)
    await expect.poll(() => hanging).toBe(1)
    // it has been hanging for a while when the user comes back
    await new Promise((r) => setTimeout(r, 2_500))

    await typeAt(alice, 'end', 'Getippt.')
    await expect(alice.getByTestId('connection-state')).toHaveAttribute('title', 'Saved', {
      // well before the connect timeout of 10 s
      timeout: 5_000,
    })
    await expect.poll(() => documentContent(id)).toBe('Getippt.')
  })
})

test.describe('what the server says at a reconnect', () => {
  test('a changed role applies without a reload', async ({ browser }, testInfo) => {
    const username = uniqueUsername('rolle', testInfo)
    const user = await createAccount(username)
    const users = (await (await backendRequest('GET', '/admin/users/')).json()) as {
      id: string
      username: string
    }[]
    const userId = users.find((u) => u.username === username)!.id
    const setRole = async (role: string) => {
      const answer = await backendRequest('PATCH', `/admin/users/${userId}/`, { role })
      expect(answer.ok, await answer.clone().text()).toBe(true)
    }

    const id = await createDocument(testName('Rolle', testInfo))
    const page = await userPage(browser, user, testInfo.project.use)
    await openEditor(page, id)

    await setRole('reader')
    await expect(page.getByTestId('session-message')).toContainText('only read')
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false')
    await expect(page.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')

    await setRole('editor')
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true')
    await expect(page.getByTestId('session-message')).toHaveCount(0)
    await typeAt(page, 'end', 'Wieder Editor.')
    await expect.poll(() => documentContent(id)).toBe('Wieder Editor.')
  })

  test('another user can open a page in the same browser', async ({ browser }, testInfo) => {
    const id = await createDocument(testName('Zwei Konten', testInfo))
    const page = await userPage(browser, USERS.alice, testInfo.project.use)
    await openEditor(page, id)
    await typeAt(page, 'end', 'Von Alice.')
    await expect.poll(() => documentContent(id)).toBe('Von Alice.')
    await expect(page.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')
    await logout(page)

    await login(page, USERS.bob)
    await openEditor(page, id)
    await typeAt(page, 'end', ' Von Bob.')
    await expect.poll(() => documentContent(id)).toBe('Von Alice. Von Bob.')
  })

  test('a page deleted while away is reported as deleted', async ({ browser }, testInfo) => {
    const id = await createDocument(testName('Geloescht', testInfo))
    const page = await userPage(browser, USERS.alice, testInfo.project.use)
    await openEditor(page, id)
    await typeAt(page, 'end', 'Text.')
    await expect.poll(() => documentContent(id)).toBe('Text.')

    await page.context().setOffline(true)
    await expect(page.getByTestId('connection-state')).toHaveAttribute('title', /Offline/, {
      timeout: 20_000,
    })
    expect((await backendRequest('DELETE', `/document/${id}/?force=true`)).ok).toBe(true)
    await page.context().setOffline(false)

    await expect(page.getByTestId('session-message')).toContainText('deleted', { timeout: 20_000 })
    await expect.poll(() => editorText(page)).toBe('Text.')
  })
})
