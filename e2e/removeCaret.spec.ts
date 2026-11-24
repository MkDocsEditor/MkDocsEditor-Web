import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  backendRequest,
  createDocument,
  editorText,
  openEditor,
  testName,
  typeAt,
  userPage,
} from './helpers'
import { BACKEND_URL, USERS } from './ports'

/**
 * Where the remote caret is drawn on `page`, each frame right before it is painted, from now
 * until it stood still for 30 frames after `action`.
 */
async function caretXsDuring(page: Page, action: () => Promise<void>): Promise<number[]> {
  const xs = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const seen: number[] = []
        const probe = document.body.appendChild(document.createElement('div'))
        probe.style.cssText = 'position:fixed;top:0;left:0;height:1px'
        let flip = false
        const end = performance.now() + 5_000
        const observer = new ResizeObserver(() => {
          const caret = document.querySelector('.cm-remote-caret')
          if (caret) seen.push(caret.getBoundingClientRect().left)
          const moved = seen.some((x) => Math.abs(x - seen[0]!) > 1)
          const still = seen.length > 30 && seen.slice(-30).every((x) => x === seen.at(-1))
          if ((moved && still) || performance.now() > end) {
            observer.disconnect()
            probe.remove()
            resolve(seen)
          } else
            requestAnimationFrame(() => {
              probe.style.width = (flip = !flip) ? '1px' : '2px'
            })
        })
        observer.observe(probe)
      }),
  )
  // the probe runs before the action
  await page.waitForTimeout(50)
  await action()
  return xs
}

/** Where the character `index` of the first line is drawn on `page`, without the carets. */
function charX(page: Page, index: number): Promise<number> {
  return page.evaluate((index) => {
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
    let left = index
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.textContent!.length
      if (left <= length) {
        const range = document.createRange()
        range.setStart(node, left)
        range.setEnd(node, left)
        return range.getBoundingClientRect().left
      }
      left -= length
    }
    return NaN
  }, index)
}

const CASES: {
  name: string
  /** Alice's caret before: the index in "Eins zwei drei vier". */
  at: number
  /** Keys pressed before: a selection, say; and where her caret is then, if not at `at`. */
  before?: string[]
  head?: number
  keys: string[]
  after: string
  /** Where her caret ends. */
  end: number
  /** Text is typed too: the caret moves right with it, but never right of where it was. */
  typed?: boolean
}[] = [
  { name: 'a backspace', at: 9, keys: ['Backspace'], after: 'Eins zwe drei vier', end: 8 },
  {
    name: 'three backspaces',
    at: 9,
    keys: ['Backspace', 'Backspace', 'Backspace'],
    after: 'Eins z drei vier',
    end: 6,
  },
  {
    name: 'a forward delete',
    at: 5,
    keys: ['Delete', 'Delete'],
    after: 'Eins ei drei vier',
    end: 5,
  },
  {
    name: 'a word removed backwards',
    at: 9,
    before: ['Shift+ControlOrMeta+ArrowLeft'],
    head: 5,
    keys: ['Backspace'],
    after: 'Eins  drei vier',
    end: 5,
  },
  {
    name: 'a word removed forwards',
    at: 5,
    before: ['Shift+ControlOrMeta+ArrowRight'],
    head: 9,
    keys: ['Backspace'],
    after: 'Eins  drei vier',
    end: 5,
  },
  {
    name: 'a word replaced',
    at: 5,
    before: ['Shift+ControlOrMeta+ArrowRight'],
    head: 9,
    keys: ['a', 'b'],
    after: 'Eins ab drei vier',
    end: 7,
    typed: true,
  },
]

for (const c of CASES)
  test(`the caret of others does not move right while they remove text: ${c.name}`, async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the same on every screen')
    const id = await createDocument(testName(`Entfernen ${c.name}`, testInfo))
    const alice = await userPage(browser, USERS.alice, testInfo.project.use)
    const bob = await userPage(browser, USERS.bob, testInfo.project.use)
    await openEditor(alice, id)
    await openEditor(bob, id)
    await typeAt(alice, 'end', 'Eins zwei drei vier')
    await expect.poll(() => editorText(bob)).toBe('Eins zwei drei vier')
    await alice.keyboard.press('ControlOrMeta+Home')
    for (let i = 0; i < c.at; i++) await alice.keyboard.press('ArrowRight')
    for (const key of c.before ?? []) await alice.keyboard.press(key)
    const caret = bob.locator('.cm-remote-caret')
    await expect(caret).toBeVisible()
    // at rest where alice is
    const head = c.head ?? c.at
    await expect
      .poll(async () => {
        const box = await caret.boundingBox()
        return Math.abs((box?.x ?? NaN) - (await charX(bob, head)))
      })
      .toBeLessThan(1.5)
    await bob.waitForTimeout(300)

    const xs = await caretXsDuring(bob, async () => {
      for (const key of c.keys) await alice.keyboard.press(key)
    })
    await expect.poll(() => editorText(bob)).toBe(c.after)
    // never right of where it was before, in any frame: text before it, or at it, went
    const back = xs.findIndex(
      (x, i) => i > 0 && x > (c.typed ? xs[0]! : Math.min(...xs.slice(0, i))) + 1,
    )
    expect(back, `x: ${xs.map((x) => x.toFixed(1)).join(' ')}`).toBe(-1)
    // and it ends where alice is
    await expect
      .poll(async () => {
        const box = await caret.boundingBox()
        return Math.abs((box?.x ?? NaN) - (await charX(bob, c.end)))
      })
      .toBeLessThan(1.5)
  })

test('the caret of an agent does not move right while it removes text live', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the same on every screen')
  const info = (await (await fetch(`${BACKEND_URL}/server-info/`)).json()) as {
    features?: string[]
  }
  test.skip(!info.features?.includes('agent-focus'), 'the backend has no agent focus yet')
  const name = testName('Entfernender Agent', testInfo)
  const created = await backendRequest(
    'POST',
    '/account/tokens/',
    { name, scope: 'write', expiresInDays: 1 },
    USERS.alice,
  )
  const { token } = (await created.json()) as { token: string }
  const id = await createDocument(testName('Entfernen live', testInfo))
  const bob = await userPage(browser, USERS.bob, testInfo.project.use)
  await openEditor(bob, id)

  const edit = (old: string, replacement: string) =>
    fetch(`${BACKEND_URL}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'edit_document',
          arguments: { document: id, edits: [{ old, new: replacement }], live: true },
        },
      }),
    })
  // the agent writes, and its caret is at the end of its text
  expect((await edit('', 'Eins zwei drei')).ok).toBe(true)
  await expect(bob.locator('.cm-unrevealed')).toHaveCount(0, { timeout: 10_000 })
  await expect.poll(() => editorText(bob)).toBe('Eins zwei drei')
  await expect(bob.locator('.cm-remote-caret')).toBeVisible()
  await bob.waitForTimeout(500)

  // it removes " zwei", which is before its caret
  const xs = await caretXsDuring(bob, async () => {
    expect((await edit(' zwei', '')).ok).toBe(true)
  })
  await expect.poll(() => editorText(bob)).toBe('Eins drei')
  const back = xs.findIndex((x, i) => i > 0 && x > Math.min(...xs.slice(0, i)) + 1)
  expect(back, `x: ${xs.map((x) => x.toFixed(1)).join(' ')}`).toBe(-1)
})
