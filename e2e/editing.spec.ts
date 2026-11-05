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

test('two users editing the same page converge', async ({ browser }, testInfo) => {
  const id = await createDocument(testName('Gemeinsam', testInfo))
  const alice = await userPage(browser, USERS.alice, testInfo.project.use)
  const bob = await userPage(browser, USERS.bob, testInfo.project.use)
  await openEditor(alice, id)
  await openEditor(bob, id)

  await typeAt(alice, 'end', 'Alice schreibt 😀 hier.')
  await expect.poll(() => editorText(bob)).toContain('Alice schreibt 😀 hier.')
  await Promise.all([typeAt(alice, 'end', ' Ende.'), typeAt(bob, 'start', 'Bob: Äpfel! ')])

  await expect.poll(async () => (await editorText(alice)) === (await editorText(bob))).toBe(true)
  const text = await editorText(alice)
  expect(text).toContain('Bob: Äpfel!')
  expect(text).toContain('Ende.')
  // the server has the same text and writes it to the file
  await expect.poll(() => documentContent(id)).toBe(text)

  // presence: bob sees alice in the list and her caret with her name
  await expect(bob.getByTestId('online-users')).toBeVisible()
  await alice.locator('.cm-content').click()
  await expect(bob.locator('.cm-remote-caret-label', { hasText: 'alice' })).toBeVisible()
})
