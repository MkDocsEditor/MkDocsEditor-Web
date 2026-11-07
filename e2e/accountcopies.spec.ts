import { expect, test } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'

import { logout } from './accounts'
import {
  authorOf,
  backendRequest,
  createDocument,
  documentContent,
  editorText,
  login,
  openEditor,
  testName,
  typeAt,
  userPage,
} from './helpers'
import { USERS } from './ports'
import { makeStoredCopyOwnerless, storedCopyKeys, storedCopyText } from './storedCopies'
import { blockableDocumentSockets } from './tabs'

const OFFLINE = ' Von Alice offline.'

/** Alice has a page open, edits it without a connection and signs out in the same browser. */
async function aliceLeavesUnsyncedEdits(page: Page, id: string) {
  const sockets = await blockableDocumentSockets(page)
  await openEditor(page, id)
  await typeAt(page, 'end', 'Server.')
  await expect.poll(() => documentContent(id)).toBe('Server.')
  await expect(page.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')
  await sockets.block()
  await expect(page.getByTestId('connection-state')).toHaveAttribute('title', /Offline/)
  await typeAt(page, 'end', OFFLINE)
  await expect(page.getByTestId('connection-state')).toHaveAttribute(
    'title',
    'Offline – changes stay here',
  )
  await logout(page)
  // the copy is written when the session closes
  await expect.poll(() => storedCopyText(page, id)).toBe(`Server.${OFFLINE}`)
  sockets.unblock()
}

async function setup(browser: Parameters<typeof userPage>[0], testInfo: TestInfo, name: string) {
  const id = await createDocument(testName(name, testInfo))
  const page = await userPage(browser, USERS.alice, testInfo.project.use)
  return { id, page }
}

async function bobSeesOnlyTheServerText(page: Page, id: string) {
  await login(page, USERS.bob)
  await openEditor(page, id)
  await expect.poll(() => editorText(page)).toBe('Server.')
  await page.waitForTimeout(500)
  expect(await documentContent(id)).toBe('Server.')
  await typeAt(page, 'start', 'Von Bob. ')
  await expect.poll(() => documentContent(id)).toBe('Von Bob. Server.')
  expect(await editorText(page)).toBe('Von Bob. Server.')
  await expect(page.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')
  await logout(page)
}

async function aliceGetsHerEditsBack(page: Page, id: string) {
  await expect.poll(() => documentContent(id)).toBe(`Von Bob. Server.${OFFLINE}`)
  await expect.poll(() => editorText(page)).toBe(`Von Bob. Server.${OFFLINE}`)
  await expect.poll(() => authorOf(id, OFFLINE)).toBe(USERS.alice.username)
  await expect.poll(() => authorOf(id, 'Von Bob.')).toBe(USERS.bob.username)
}

test.describe('two accounts in one browser', () => {
  test('edits stay with the account that made them', async ({ browser }, testInfo) => {
    const { id, page } = await setup(browser, testInfo, 'Konten')
    await aliceLeavesUnsyncedEdits(page, id)
    await bobSeesOnlyTheServerText(page, id)

    await login(page, USERS.alice)
    await openEditor(page, id)
    await aliceGetsHerEditsBack(page, id)
  })

  test('a record of an older version without an owner stays with its owner', async ({
    browser,
  }, testInfo) => {
    const { id, page } = await setup(browser, testInfo, 'Altbestand')
    await aliceLeavesUnsyncedEdits(page, id)
    await makeStoredCopyOwnerless(page, id)
    await bobSeesOnlyTheServerText(page, id)
    // refused for Bob, and it stays where it is
    expect(await storedCopyKeys(page)).toContain(id)

    await login(page, USERS.alice)
    await openEditor(page, id)
    await aliceGetsHerEditsBack(page, id)
    // now it belongs to Alice
    await expect.poll(() => storedCopyKeys(page)).not.toContain(id)
  })

  test('a page moved meanwhile keeps the edits with their account', async ({
    browser,
  }, testInfo) => {
    const { id, page } = await setup(browser, testInfo, 'Umzug')
    await aliceLeavesUnsyncedEdits(page, id)
    const moved = await backendRequest('PUT', `/document/${id}/`, {
      name: testName('Umzug neu', testInfo),
    })
    expect(moved.ok).toBe(true)
    const newId = ((await moved.json()) as { id: string }).id
    expect(newId).not.toBe(id)

    await bobSeesOnlyTheServerText(page, newId)

    // after the login the file browser re-keys Alice's copy to the new id
    await login(page, USERS.alice)
    await expect
      .poll(async () => (await storedCopyKeys(page)).filter((key) => key.endsWith(newId)))
      .toHaveLength(2)
    await openEditor(page, newId)
    await aliceGetsHerEditsBack(page, newId)
  })
})
