import { expect, test } from '@playwright/test'

import {
  createDocument,
  editorText,
  installBackgroundTab,
  openEditor,
  setBackground,
  testName,
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
    const sockets: string[] = []
    alice.on('websocket', (ws) => {
      if (ws.url().includes('/document/')) sockets.push(ws.url())
    })
    await openEditor(alice, id)
    await openEditor(bob, id)
    await setBackground(alice, true)

    // long enough for the server's 15 s timeout without heartbeats
    await new Promise((r) => setTimeout(r, 20_000))
    await typeAt(bob, 'end', 'Von Bob.')
    await expect.poll(() => editorText(alice), { timeout: 5_000 }).toBe('Von Bob.')
    expect(sockets).toHaveLength(1)
  })
})
