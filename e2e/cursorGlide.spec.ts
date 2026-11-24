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

  // a few characters back: it glides, and ends where the text is (while somebody types, the
  // growing text carries it: typingMotion.spec.ts)
  // the text typed has grown to its full width: the caret is no longer carried by it
  await bob.waitForTimeout(300)
  const near = await shiftsDuring(bob, async () => {
    for (let i = 0; i < 3; i++) await alice.keyboard.press('ArrowLeft')
  })
  expect(near.some((t) => /translate\(\d*[1-9]/.test(t))).toBe(true)
  await expect(caret).toHaveCSS('transform', 'none')

  // to the next line and back to its start: far, so it jumps
  const far = await shiftsDuring(bob, () => alice.keyboard.press('Enter'))
  expect(far).toEqual([])
  await expect(caret).toHaveCSS('transform', 'none')
})

test('remote selections glide open and shut, over the selected text', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the same on every screen')
  const id = await createDocument(testName('Auswahl', testInfo))
  const alice = await userPage(browser, USERS.alice, testInfo.project.use)
  const bob = await userPage(browser, USERS.bob, testInfo.project.use)
  await openEditor(alice, id)
  await openEditor(bob, id)
  await typeAt(alice, 'end', 'Eins zwei drei vier')
  await expect(bob.locator('.cm-remote-caret')).toBeVisible()

  const growing = bob.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const seen: number[] = []
        const sample = () => {
          const box = document.querySelector<HTMLElement>('.cm-remote-selection')
          seen.push(box ? Math.round(box.getBoundingClientRect().width) : 0)
          if (seen.length < 90) requestAnimationFrame(sample)
          else resolve(seen)
        }
        sample()
      }),
  )
  // "drei vier" selected: the highlight grows from the caret over a few frames
  for (let i = 0; i < 9; i++) await alice.keyboard.press('Shift+ArrowLeft')
  const seen = await growing
  const final = Math.max(...seen)
  expect(final).toBeGreaterThan(0)
  // sizes between none and the full selection: it grew, not jumped
  expect(seen.some((w) => w > 0 && w < final)).toBe(true)

  // it covers the selected text, once the last move has arrived and the glide is over
  await expect(async () => {
    const box = await bob.locator('.cm-remote-selection').boundingBox()
    const text = await bob.evaluate(() => {
      // the text of the line, without the name flag
      const walker = document.createTreeWalker(
        document.querySelector('.cm-line')!,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) =>
            node.parentElement?.closest('.cm-remote-caret')
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT,
        },
      )
      const range = document.createRange()
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent!.indexOf('drei')
        if (at >= 0) range.setStart(node, at)
        if (node.textContent!.includes('vier'))
          range.setEnd(node, node.textContent!.indexOf('vier') + 4)
      }
      const r = range.getBoundingClientRect()
      return { x: r.left, width: r.width }
    })
    expect(Math.abs(box!.x - text.x)).toBeLessThan(2)
    expect(Math.abs(box!.width - text.width)).toBeLessThan(3)
  }).toPass({ timeout: 5_000 })
  await bob.locator('.cm-editor').screenshot({ path: testInfo.outputPath('selection.png') })

  // back to a caret: the highlight goes
  await alice.keyboard.press('ArrowRight')
  await expect(bob.locator('.cm-remote-selection')).toHaveCount(0)
})

test('a far selection jumps as a whole, and a cursor that goes fades out', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the same on every screen')
  const id = await createDocument(testName('Weit', testInfo))
  const alice = await userPage(browser, USERS.alice, testInfo.project.use)
  const bob = await userPage(browser, USERS.bob, testInfo.project.use)
  await openEditor(alice, id)
  await openEditor(bob, id)
  await typeAt(alice, 'end', 'Eins\nZwei\nDrei\nVier ist eine lange Zeile mit Text')
  await expect(bob.locator('.cm-remote-caret')).toBeVisible()

  // from the end up to the start: the caret moves far, so the selection jumps as a whole
  const heights = bob.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const seen: number[] = []
        const sample = () => {
          const boxes = [...document.querySelectorAll<HTMLElement>('.cm-remote-selection')]
          const tops = boxes.map((b) => b.getBoundingClientRect().top)
          seen.push(tops.length ? Math.round(Math.min(...tops)) : -1)
          if (seen.length < 90) requestAnimationFrame(sample)
          else resolve(seen)
        }
        sample()
      }),
  )
  await alice.keyboard.press('ControlOrMeta+Shift+Home')
  const tops = (await heights).filter((t) => t >= 0)
  // the top edge is where it ends from the first frame on: no growing upwards
  expect(new Set(tops).size).toBe(1)

  // the editor of alice loses the focus: her cursor goes, fading
  const fading = bob.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const seen: number[] = []
        const sample = () => {
          const copy = document.querySelector<HTMLElement>(
            '.cm-remoteCaretFadeLayer .cm-remote-gone',
          )
          seen.push(copy ? Number(getComputedStyle(copy).opacity) : -1)
          if (seen.length < 60) requestAnimationFrame(sample)
          else resolve(seen)
        }
        sample()
      }),
  )
  await alice.getByTestId('document-title').click()
  const opacities = (await fading).filter((o) => o >= 0)
  expect(opacities.some((o) => o > 0 && o < 1)).toBe(true)
  await expect(bob.locator('.cm-remote-caret')).toHaveCount(0)
  await expect(bob.locator('.cm-remote-selection')).toHaveCount(0)
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
