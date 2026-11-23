import { expect, test } from '@playwright/test'

import { createDocument, editorText, openEditor, testName, typeAt, userPage } from './helpers'
import { USERS } from './ports'

test('text after an insert of others moves smoothly to its place', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the same on every screen')
  const id = await createDocument(testName('Wachsen', testInfo))
  const alice = await userPage(browser, USERS.alice, testInfo.project.use)
  const bob = await userPage(browser, USERS.bob, testInfo.project.use)
  await openEditor(alice, id)
  await openEditor(bob, id)
  await typeAt(alice, 'end', 'Anfang Ende')
  await expect.poll(() => editorText(bob)).toBe('Anfang Ende')

  // where "Ende" is drawn on bob's screen, each frame
  const lefts = bob.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const seen: number[] = []
        const sample = () => {
          const line = document.querySelector('.cm-line')!
          const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const at = node.textContent!.indexOf('Ende')
            if (at < 0 || node.parentElement?.closest('.cm-remote-caret')) continue
            const range = document.createRange()
            range.setStart(node, at)
            range.setEnd(node, at + 1)
            seen.push(Math.round(range.getBoundingClientRect().left))
          }
          if (seen.length < 90) requestAnimationFrame(sample)
          else resolve(seen)
        }
        sample()
      }),
  )
  await alice.keyboard.press('ControlOrMeta+Home')
  for (let i = 0; i < 7; i++) await alice.keyboard.press('ArrowRight')
  await alice.keyboard.insertText('in der Mitte ')
  const seen = await lefts
  const first = seen[0]!
  const last = seen.at(-1)!
  expect(last).toBeGreaterThan(first)
  // places between the old and the new one: it moved, not jumped
  expect(seen.some((x) => x > first + 2 && x < last - 2)).toBe(true)
  await expect.poll(() => editorText(bob)).toBe('Anfang in der Mitte Ende')
})

test('an insert of others shows at once when edits of others are not animated', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the same on every screen')
  const id = await createDocument(testName('Sofort', testInfo))
  const alice = await userPage(browser, USERS.alice, testInfo.project.use)
  const bob = await userPage(browser, USERS.bob, testInfo.project.use)
  await bob.evaluate(() => localStorage.setItem('mkdocseditor.fadeIn', 'false'))
  await openEditor(alice, id)
  await openEditor(bob, id)
  await typeAt(alice, 'end', 'Anfang Ende')
  await expect.poll(() => editorText(bob)).toBe('Anfang Ende')
  await alice.keyboard.insertText(' und mehr')
  await expect.poll(() => editorText(bob)).toBe('Anfang Ende und mehr')
  await expect(bob.locator('[data-grow]')).toHaveCount(0)
})
