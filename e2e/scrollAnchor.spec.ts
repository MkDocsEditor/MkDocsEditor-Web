import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  createDocument,
  documentContent,
  editorText,
  openEditor,
  testName,
  userPage,
} from './helpers'
import { humanKeystrokes } from './humanTyping'
import { USERS } from './ports'

/** The screen top of the line that starts with ANCHOR, every frame right before it is painted. */
function watch(page: Page): Promise<void> {
  return page.evaluate(() => {
    const w = window as unknown as { tops: number[] }
    w.tops = []
    const probe = document.body.appendChild(document.createElement('div'))
    probe.style.cssText = 'position:fixed;top:0;left:0;height:1px'
    let flip = false
    new ResizeObserver(() => {
      const line = [...document.querySelectorAll('.cm-line')].find((l) =>
        l.textContent!.startsWith('ANCHOR'),
      )
      w.tops.push(line ? line.getBoundingClientRect().top : NaN)
      requestAnimationFrame(() => (probe.style.width = (flip = !flip) ? '1px' : '2px'))
    }).observe(probe)
  })
}

for (const focused of [false, true])
  test(`the view stays where the reader looks while others write above it${focused ? ', with her caret there' : ''}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000)
    const id = await createDocument(testName(`Scroll anchor ${focused}`, testInfo))
    const alice = await userPage(browser, USERS.alice, testInfo.project.use)
    const bob = await userPage(browser, USERS.bob, testInfo.project.use)
    await openEditor(bob, id)
    await bob.locator('.cm-content').click()
    const lines = Array.from({ length: 120 }, (_, i) => `line ${i}`)
    lines[4] = 'A long paragraph that wraps. '.repeat(6) + 'END'
    lines[60] = 'ANCHOR line'
    await bob.keyboard.insertText(lines.join('\n'))
    await expect.poll(() => documentContent(id), { timeout: 10_000 }).toContain('ANCHOR line')
    await openEditor(alice, id)
    await expect.poll(() => editorText(alice)).toContain('line 0')

    // alice: ANCHOR in the middle of her view (CodeMirror draws only what is near the view)
    await expect
      .poll(() =>
        alice.evaluate(() => {
          const all = [...document.querySelectorAll('.cm-line')]
          const line = all.find((l) => l.textContent!.startsWith('ANCHOR'))
          ;(line ?? all.at(-1)!).scrollIntoView({ block: line ? 'center' : 'start' })
          return !!line
        }),
      )
      .toBe(true)
    if (focused) await alice.locator('.cm-line', { hasText: 'ANCHOR line' }).click()
    await alice.waitForTimeout(300)
    await watch(alice)

    const type = async (text: string) => {
      const start = Date.now()
      for (const { key, at } of humanKeystrokes(text, 3)) {
        const wait = start + at - Date.now()
        if (wait > 0) await bob.waitForTimeout(wait)
        await bob.keyboard.press(key === ' ' ? 'Space' : key)
      }
    }
    const moved: Record<string, number> = {}
    const measure = async (name: string, act: () => Promise<void>) => {
      await alice.evaluate(() => ((window as unknown as { tops: number[] }).tops = []))
      await act()
      await alice.waitForTimeout(800)
      const tops = (
        await alice.evaluate(() => (window as unknown as { tops: number[] }).tops)
      ).filter(Number.isFinite)
      moved[name] = Math.max(...tops.map((t) => Math.abs(t - tops[0]!)))
    }
    // bob, above alice's view: at the end of the long paragraph
    await bob.keyboard.press('ControlOrMeta+Home')
    for (let i = 0; i < 4; i++) await bob.keyboard.press('ArrowDown')
    await bob.keyboard.press('End')
    await measure('typing that wraps anew', () => type(' and more words that wrap again'))
    await measure('new lines', async () => {
      for (let i = 0; i < 3; i++) {
        await bob.keyboard.press('Enter')
        await bob.waitForTimeout(150)
      }
    })
    await measure('removed lines', async () => {
      for (let i = 0; i < 3; i++) {
        await bob.keyboard.press('Backspace')
        await bob.waitForTimeout(150)
      }
    })
    await measure('removed words', async () => {
      for (let i = 0; i < 6; i++) {
        await bob.keyboard.press('ControlOrMeta+Backspace')
        await bob.waitForTimeout(150)
      }
    })
    // below her view: nothing to keep, and nothing moves
    await bob.keyboard.press('ControlOrMeta+End')
    await measure('typing below', () => type('the end'))
    for (const [name, px] of Object.entries(moved))
      expect(px, `the reader's line moved, px: ${name}`).toBeLessThanOrEqual(1)
    if (focused) await expect(alice.locator('.cm-content')).toBeFocused()

    // she scrolls while bob types above: the view follows her, not the anchor
    await bob.keyboard.press('ControlOrMeta+Home')
    const scrollTop = () => alice.evaluate(() => document.querySelector('.cm-scroller')!.scrollTop)
    const before = await scrollTop()
    const typing = type(' and on')
    await alice.waitForTimeout(150)
    await alice.locator('.cm-scroller').hover()
    await alice.mouse.wheel(0, 200)
    await typing
    await alice.waitForTimeout(500)
    expect(await scrollTop()).toBeGreaterThan(before + 150)
  })
