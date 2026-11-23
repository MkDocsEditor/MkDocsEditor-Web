import { expect, test } from '@playwright/test'

import { createDocument, editorText, openEditor, testName, userPage } from './helpers'
import { humanKeystrokes } from './humanTyping'
import { USERS } from './ports'

interface Frame {
  /** When it was drawn. */
  time: number
  /** Where the caret of the other is drawn: the middle of its line. */
  caret: number
  /** The top of its row. */
  row: number
  /** Where the text behind it starts. */
  tail: number
  /** The top of the row of the text behind it. */
  tailRow: number
  /** How far fading text shows right of the caret, in its row. */
  ahead: number
}

test('the text behind the cursor of somebody who types moves with it', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000)
  const id = await createDocument(testName('Typing motion', testInfo))
  const alice = await userPage(browser, USERS.alice, testInfo.project.use)
  const bob = await userPage(browser, USERS.bob, testInfo.project.use)
  await openEditor(bob, id)
  await bob.locator('.cm-content').click()
  await bob.keyboard.insertText('Start.\n\nBEFORE AFTER the end of this line.')
  await openEditor(alice, id)
  await expect.poll(() => editorText(alice)).toContain('AFTER the end')

  // bob types in the middle of the line, after "BEFORE"
  await bob.keyboard.press('ControlOrMeta+End')
  await bob.keyboard.press('Home')
  for (let i = 0; i < 'BEFORE'.length; i++) await bob.keyboard.press('ArrowRight')
  await expect(alice.locator('.cm-remote-caret')).toHaveCount(1)
  // the caret got there with a jump and a glide: at rest in front of " AFTER" before the keys
  await expect
    .poll(
      () =>
        alice.evaluate(() => {
          const content = document.querySelector('.cm-content')!
          const caret = content.querySelector('.cm-remote-caret')!.getBoundingClientRect()
          const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const at = n.textContent!.indexOf(' AFTER')
            if (at < 0) continue
            const range = document.createRange()
            range.setStart(n, at)
            range.setEnd(n, at + 1)
            return Math.abs(range.getBoundingClientRect().left - caret.left - 1) < 1
          }
          return false
        }),
      { timeout: 10_000 },
    )
    .toBe(true)

  // alice: every frame right before it is painted
  await alice.evaluate(() => {
    const w = window as unknown as { frames: Frame[]; stop: boolean }
    w.frames = []
    w.stop = false
    const content = document.querySelector('.cm-content')!
    const probe = document.body.appendChild(document.createElement('div'))
    probe.style.cssText = 'position:fixed;top:0;left:0;height:1px'
    let flip = false
    const tailX = () => {
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const at = n.textContent!.indexOf(' AFTER')
        if (at < 0) continue
        const range = document.createRange()
        range.setStart(n, at)
        range.setEnd(n, at + 1)
        const box = range.getBoundingClientRect()
        return { x: box.left, row: box.top }
      }
      return { x: NaN, row: NaN }
    }
    new ResizeObserver(() => {
      const caret = content.querySelector('.cm-remote-caret')
      if (caret) {
        const c = caret.getBoundingClientRect()
        const x = c.left + 1
        let ahead = 0
        for (const span of content.querySelectorAll<HTMLElement>('[data-appear]')) {
          const box = span.getBoundingClientRect()
          if (box.bottom <= c.top || box.top >= c.bottom) continue
          const inset = /inset\(\S+ (-?[\d.]+)px/.exec(span.style.clipPath)
          const right = span.style.clipPath.startsWith('inset(50%')
            ? -Infinity
            : box.right - (inset ? Number(inset[1]) : 0)
          ahead = Math.max(ahead, Math.min(box.right, right) - x)
        }
        const tail = tailX()
        w.frames.push({
          time: performance.now(),
          caret: x,
          row: c.top,
          tail: tail.x,
          tailRow: tail.row,
          ahead,
        })
      }
      if (!w.stop) requestAnimationFrame(() => (probe.style.width = (flip = !flip) ? '1px' : '2px'))
    }).observe(probe)
  })

  const text = 'typing like a person, with a typo now and then'
  const keys = humanKeystrokes(text, 6)
  const start = Date.now()
  for (const { key, at } of keys) {
    const wait = start + at - Date.now()
    if (wait > 0) await bob.waitForTimeout(wait)
    await bob.keyboard.press(key === ' ' ? 'Space' : key)
  }
  await expect.poll(() => editorText(alice)).toContain(`BEFORE${text} AFTER`)
  await alice.waitForTimeout(500)
  const frames = await alice.evaluate(() => {
    const w = window as unknown as { frames: Frame[]; stop: boolean }
    w.stop = true
    return w.frames
  })

  // in the same row: at a new wrap the text behind goes first, the word follows a frame later
  const gaps = frames
    .filter((f) => Math.abs(f.tailRow - f.row) < 4)
    .map((f) => f.tail - f.caret)
    .filter(Number.isFinite)
  const rest = gaps.at(-1)!
  const off = gaps.map((g) => Math.abs(g - rest))
  // within a row: a new row is a jump
  const speeds = frames
    .slice(1)
    .flatMap((f, i) => {
      const before = frames[i]!
      if (Math.abs(f.row - before.row) >= 4) return []
      return [Math.abs(f.caret - before.caret) / (f.time - before.time)]
    })
    .filter((v) => v > 0.003)
  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length
  const p95 = [...speeds].sort((a, b) => a - b)[Math.floor(speeds.length * 0.95)]!
  const ahead = Math.max(...frames.map((f) => f.ahead))
  // the text behind keeps its distance to the caret, nothing fading shows right of it, and
  // the caret moves on evenly between the keys
  expect(Math.max(...off), 'text behind off the caret, px').toBeLessThanOrEqual(2)
  expect(ahead, 'fading text right of the caret, px').toBeLessThanOrEqual(1)
  // KodeEditor asks for 2.5 on exact frames; a browser's frames come unevenly, which adds to it
  expect(p95 / mean, 'caret speed, p95 / mean').toBeLessThanOrEqual(3)
})
