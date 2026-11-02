import { expect, test } from '@playwright/test'

import {
  createDocument,
  documentContent,
  dropDocumentSocket,
  editorText,
  installBackgroundTab,
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
