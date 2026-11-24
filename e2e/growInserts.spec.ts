import { expect, test } from '@playwright/test'

import { createDocument, editorText, openEditor, testName, typeAt, userPage } from './helpers'
import { USERS } from './ports'

/** How long an insert of others grows (appearance.ts). */
const GROW_MS = 120

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
  // what alice typed has grown to its place
  await bob.waitForTimeout(500)

  // where "Ende" is drawn on bob's screen, each frame right before it is painted, until it is
  // where it ends up
  const lefts = bob.evaluate(
    () =>
      new Promise<{ x: number; time: number }[]>((resolve) => {
        const seen: { x: number; time: number }[] = []
        const probe = document.body.appendChild(document.createElement('div'))
        probe.style.cssText = 'position:fixed;top:0;left:0;height:1px'
        let flip = false
        let frameTime = performance.now()
        const end = performance.now() + 10_000
        const observer = new ResizeObserver(() => {
          const line = document.querySelector('.cm-line')!
          const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const at = node.textContent!.indexOf('Ende')
            if (at < 0 || node.parentElement?.closest('.cm-remote-caret')) continue
            const range = document.createRange()
            range.setStart(node, at)
            range.setEnd(node, at + 1)
            seen.push({ x: Math.round(range.getBoundingClientRect().left), time: frameTime })
          }
          // moved, and still for 30 frames since
          const moved = seen.some((s) => s.x > seen[0]!.x + 2)
          const still = seen.length > 30 && seen.slice(-30).every((s) => s.x === seen.at(-1)!.x)
          if ((moved && still) || performance.now() > end) {
            observer.disconnect()
            resolve(seen)
          } else
            requestAnimationFrame((t) => {
              frameTime = t
              probe.style.width = (flip = !flip) ? '1px' : '2px'
            })
        })
        observer.observe(probe)
      }),
  )
  await alice.keyboard.press('ControlOrMeta+Home')
  for (let i = 0; i < 7; i++) await alice.keyboard.press('ArrowRight')
  await alice.keyboard.insertText('in der Mitte ')
  const seen = await lefts
  const first = seen[0]!.x
  const last = seen.at(-1)!.x
  expect(last).toBeGreaterThan(first)
  // places between the old and the new one: it moved, not jumped; a machine too busy to draw a
  // frame while it grows cannot show that
  const arrived = seen.findIndex((s) => s.x > first + 2)
  const during = seen.filter((s, i) => i >= arrived && s.time < seen[arrived - 1]!.time + GROW_MS)
  if (during.length > 0) expect(seen.some((s) => s.x > first + 2 && s.x < last - 2)).toBe(true)
  else testInfo.annotations.push({ type: 'note', description: 'no frame while the text grew' })
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
