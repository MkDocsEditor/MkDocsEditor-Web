import { expect, test } from '@playwright/test'

import {
  createDocument,
  documentContent,
  editorText,
  openEditor,
  testName,
  typeAt,
  userPage,
} from './helpers'
import { USERS } from './ports'

test.describe('live collaboration', () => {
  test('edits made offline are merged after the reconnect', async ({ browser }, testInfo) => {
    const id = await createDocument(testName('Offline', testInfo))
    const alice = await userPage(browser, USERS.alice, testInfo.project.use)
    const bob = await userPage(browser, USERS.bob, testInfo.project.use)
    await openEditor(alice, id)
    await openEditor(bob, id)
    await typeAt(alice, 'end', 'Start.')
    await expect.poll(() => editorText(bob)).toBe('Start.')

    await alice.context().setOffline(true)
    await expect(alice.getByTestId('connection-state')).toHaveAttribute('title', /Offline/, {
      timeout: 20_000,
    })
    await typeAt(alice, 'end', ' Offline von Alice.')
    await typeAt(bob, 'start', 'Online von Bob. ')
    await alice.context().setOffline(false)

    const expected = 'Online von Bob. Start. Offline von Alice.'
    await expect.poll(() => editorText(alice), { timeout: 30_000 }).toBe(expected)
    await expect.poll(() => editorText(bob)).toBe(expected)
    await expect.poll(() => documentContent(id)).toBe(expected)
  })

  test('readers can watch but not edit', async ({ browser }, testInfo) => {
    const id = await createDocument(testName('Lesen', testInfo))
    const alice = await userPage(browser, USERS.alice, testInfo.project.use)
    const carol = await userPage(browser, USERS.carol, testInfo.project.use)
    await openEditor(alice, id)
    await carol.goto(`/document/${id}`)
    await carol.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(carol.getByTestId('session-message')).toContainText('only read')
    await expect(carol.locator('.cm-content')).toHaveAttribute('contenteditable', 'false')
    await typeAt(alice, 'end', 'Von Alice.')
    await expect.poll(() => editorText(carol)).toBe('Von Alice.')
  })
})
