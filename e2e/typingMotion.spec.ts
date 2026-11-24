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
  /** The most the alpha of a fading character changed since the frame before, per 16.7 ms. */
  jump: number
  /** Fading characters painted in full: spans without their mask. */
  full: number
}

// a person, and a fast typist (R5c): slow keys take short steps, fast ones glide on between them
for (const { typist, median } of [
  { typist: 'a person', median: 150 },
  { typist: 'a fast typist', median: 70 },
])
  test(`the text behind the cursor of ${typist} moves with it`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const id = await createDocument(testName(`Typing motion ${median}`, testInfo))
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
    // the caret got there with a jump and a glide: at rest in front of " AFTER" before the keys,
    // every frame for 300 ms (under load, a late place of bob's can still move it, and a glide
    // passes the place on its way)
    await expect
      .poll(
        () =>
          alice.evaluate(
            () =>
              new Promise<boolean>((resolve) => {
                const content = document.querySelector('.cm-content')!
                const there = () => {
                  const caret = content.querySelector<HTMLElement>('.cm-remote-caret')
                  if (!caret || caret.style.transform) return false
                  const box = caret.getBoundingClientRect()
                  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
                  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                    const at = n.textContent!.indexOf(' AFTER')
                    if (at < 0) continue
                    const range = document.createRange()
                    range.setStart(n, at)
                    range.setEnd(n, at + 1)
                    return Math.abs(range.getBoundingClientRect().left - box.left - 1) < 1
                  }
                  return false
                }
                const end = performance.now() + 300
                const frame = () => {
                  if (!there()) resolve(false)
                  else if (performance.now() > end) resolve(true)
                  else requestAnimationFrame(frame)
                }
                frame()
              }),
          ),
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
      let alphas = new Map<string, number>()
      // the time of the frame, as the animations take it: not when this runs, after the layout
      let frameTime = performance.now()
      let last = frameTime
      new ResizeObserver(() => {
        // the alpha of each fading character, from the mask of its span
        const next = new Map<string, number>()
        let jump = 0
        let full = 0
        for (const span of content.querySelectorAll<HTMLElement>('[data-appear]')) {
          if (!span.style.maskImage) full += span.textContent!.length
          const steps = [...span.style.maskImage.matchAll(/rgba\(0, ?0, ?0, ?([\d.]+)\)/g)]
          steps.forEach((m, i) => {
            if (i % 2) return
            const key = `${span.dataset.appear}:${i}`
            const alpha = Number(m[1])
            next.set(key, alpha)
            const was = alphas.get(key)
            if (was !== undefined) jump = Math.max(jump, Math.abs(alpha - was))
          })
        }
        alphas = next
        // per frame of 60 Hz: a browser under load skips some
        const time = frameTime
        jump = (jump * (1000 / 60)) / Math.max(1000 / 60, time - last)
        last = time
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
            time,
            caret: x,
            row: c.top,
            tail: tail.x,
            tailRow: tail.row,
            ahead,
            jump,
            full,
          })
        }
        if (!w.stop)
          requestAnimationFrame((t) => {
            frameTime = t
            probe.style.width = (flip = !flip) ? '1px' : '2px'
          })
      }).observe(probe)
    })

    const text = 'typing like a person, with a typo now and then'
    const keys = humanKeystrokes(text, 6, median)
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
    const same = frames.filter((f) => Math.abs(f.tailRow - f.row) < 4 && Number.isFinite(f.tail))
    const gaps = same.map((f) => f.tail - f.caret)
    const rest = gaps.at(-1)!
    // only frames that came on time: after a browser stood still for a second under load, several
    // keys arrive in one frame, and that frame shows the state of none of them
    const onTime = same.map((f) => {
      const before = frames[frames.indexOf(f) - 1]
      return !!before && f.time - before.time <= 40
    })
    const off = gaps.map((g, i) => (onTime[i] ? Math.abs(g - rest) : 0))
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
    // the frames around the worst one, should it fail: time, caret, how far off
    const worst = off.indexOf(Math.max(...off))
    const around = same
      .slice(Math.max(0, worst - 4), worst + 4)
      .map((f) => [Math.round(f.time), Math.round(f.caret), +(f.tail - f.caret - rest).toFixed(1)])
    // the text behind keeps its distance to the caret, nothing fading shows right of it, and
    // the caret of a fast typist moves on evenly between the keys
    expect(
      Math.max(...off),
      `text behind off the caret, px: ${JSON.stringify(around)}`,
    ).toBeLessThanOrEqual(2)
    expect(ahead, 'fading text right of the caret, px').toBeLessThanOrEqual(1)
    // fading text changes its alpha evenly (R4): the ease-out over at least 320 ms starts with
    // 2 × 16.7 / 320 = 0.104 a frame; a frame that comes late now and then adds to it
    const jumps = frames.map((f) => f.jump).sort((a, b) => a - b)
    expect(
      jumps[Math.floor(jumps.length * 0.99)]!,
      'alpha change per frame, p99',
    ).toBeLessThanOrEqual(0.11)
    // and never shows in full for a frame, as spans are drawn anew while they fade and grow
    expect(Math.max(...frames.map((f) => f.full)), 'fading characters shown in full').toBe(0)
    // fast: no pumping, the caret moves on evenly between the keys; slow keys stand still between
    // KodeEditor asks for 2.5 on exact frames; a browser's frames come unevenly, which adds to it
    if (median < 100) expect(p95 / mean, 'caret speed, p95 / mean').toBeLessThanOrEqual(3)
  })
