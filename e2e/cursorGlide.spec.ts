import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { createDocument, openEditor, testName, typeAt, userPage } from './helpers'
import { USERS } from './ports'

/** Records the shifts the remote caret is drawn with, each frame, until `stop` resolves. */
async function shiftsDuring(page: Page, action: () => Promise<void>): Promise<string[]> {
  await page.evaluate(() => {
    const seen: string[] = []
    ;(window as unknown as { shifts: string[] }).shifts = seen
    const sample = () => {
      const caret = document.querySelector<HTMLElement>('.cm-remote-caret')
      if (caret?.style.transform) seen.push(caret.style.transform)
      ;(window as unknown as { shiftFrame: number }).shiftFrame = requestAnimationFrame(sample)
    }
    sample()
  })
  await action()
  await page.waitForTimeout(500)
  return page.evaluate(() => {
    cancelAnimationFrame((window as unknown as { shiftFrame: number }).shiftFrame)
    return (window as unknown as { shifts: string[] }).shifts
  })
}

test('remote cursors glide to a near place and jump to a far one', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the same on every screen')
  const id = await createDocument(testName('Gleiten', testInfo))
  const alice = await userPage(browser, USERS.alice, testInfo.project.use)
  const bob = await userPage(browser, USERS.bob, testInfo.project.use)
  await openEditor(alice, id)
  await openEditor(bob, id)
  await typeAt(alice, 'end', 'Eins zwei drei')
  const caret = bob.locator('.cm-remote-caret')
  await expect(caret).toBeVisible()

  // a few characters on: it glides, and ends where the text is
  const near = await shiftsDuring(bob, () => alice.keyboard.type(' vier'))
  expect(near.some((t) => /translate\(-\d/.test(t))).toBe(true)
  await expect(caret).toHaveCSS('transform', 'none')

  // to the next line and back to its start: far, so it jumps
  const far = await shiftsDuring(bob, () => alice.keyboard.press('Enter'))
  expect(far).toEqual([])
  await expect(caret).toHaveCSS('transform', 'none')
})

test('remote cursors jump when edits of others are not animated', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the same on every screen')
  const id = await createDocument(testName('Springen', testInfo))
  const alice = await userPage(browser, USERS.alice, testInfo.project.use)
  const bob = await userPage(browser, USERS.bob, testInfo.project.use)
  await bob.evaluate(() => localStorage.setItem('mkdocseditor.fadeIn', 'false'))
  await openEditor(alice, id)
  await openEditor(bob, id)
  await typeAt(alice, 'end', 'Eins zwei drei')
  await expect(bob.locator('.cm-remote-caret')).toBeVisible()
  expect(await shiftsDuring(bob, () => alice.keyboard.type(' vier'))).toEqual([])
})
