import { expect, test } from '@playwright/test'

import { BACKEND_URL, USERS } from './ports'
import { backendRequest, createDocument, openEditor, testName, userPage } from './helpers'

interface Frame {
  time: number
  /** Where the agent's caret is drawn, and the top of its row. */
  x: number
  y: number
  /** The width of the text. */
  width: number
  /** The label: its top relative to the caret's, and its alpha. */
  labelTop: number
}

// R8 of KodeEditor's docs/reveal.md: a word revealed at the start of a wrapped row is drawn at the
// end of the row above while it fits, and slides to its row with the cursor; never a jump
test('the cursor of an agent goes over a wrap like that of somebody who types', async ({
  browser,
}, testInfo) => {
  const info = (await (await fetch(`${BACKEND_URL}/server-info/`)).json()) as {
    features?: string[]
  }
  test.skip(!info.features?.includes('agent-focus'), 'the backend has no agent focus yet')
  test.setTimeout(60_000)

  const user = USERS.bob
  const name = testName('Wrapping agent', testInfo)
  const created = await backendRequest(
    'POST',
    '/account/tokens/',
    { name, scope: 'write', expiresInDays: 1 },
    user,
  )
  const { token } = (await created.json()) as { token: string }
  const id = await createDocument(testName('Wrap carry', testInfo))
  const page = await userPage(browser, USERS.alice, testInfo.project.use)
  await openEditor(page, id)

  await page.evaluate(() => {
    const w = window as unknown as { frames: Frame[]; stop: boolean }
    w.frames = []
    w.stop = false
    const content = document.querySelector('.cm-content')!
    const probe = document.body.appendChild(document.createElement('div'))
    probe.style.cssText = 'position:fixed;top:0;left:0;height:1px'
    let flip = false
    let frameTime = performance.now()
    new ResizeObserver(() => {
      const caret = content.querySelector('.cm-remote-caret')
      if (caret) {
        const c = caret.getBoundingClientRect()
        const label = caret.querySelector('.cm-remote-caret-label')?.getBoundingClientRect()
        w.frames.push({
          time: frameTime,
          x: c.left,
          y: c.top,
          width: content.getBoundingClientRect().width,
          labelTop: label ? label.top - c.top : NaN,
        })
      }
      if (!w.stop)
        requestAnimationFrame((t) => {
          frameTime = t
          probe.style.width = (flip = !flip) ? '1px' : '2px'
        })
    }).observe(probe)
  })

  const text = 'Ein Agent schreibt diesen Absatz live, Wort für Wort, über das Ende der Zeile. '
    .repeat(4)
    .trim()
  const answer = await fetch(`${BACKEND_URL}/mcp`, {
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
        arguments: { document: id, edits: [{ old: '', new: text }], live: true },
      },
    }),
  })
  expect(answer.ok, await answer.clone().text()).toBe(true)
  await expect(page.locator('.cm-unrevealed')).toBeVisible()
  await expect(page.locator('.cm-unrevealed')).toHaveCount(0, { timeout: 10_000 })
  await page.waitForTimeout(500)
  const frames = await page.evaluate(() => {
    const w = window as unknown as { frames: Frame[]; stop: boolean }
    w.stop = true
    return w.frames
  })

  const lineHeight = 20
  const rows = new Set(frames.map((f) => Math.round(f.y / lineHeight))).size
  expect(rows, 'rows the cursor went through').toBeGreaterThanOrEqual(3)
  // a jump to the next row moves all the way in one frame; a slide takes several (a browser under
  // load draws at 30 Hz or slower, where a slide of 120 ms moves 60 % in its first frame, and the
  // frames of a full run of the tests can come further apart than the whole slide)
  const steps = frames.slice(1).map((f, i) => {
    const before = frames[i]!
    return {
      at: Math.round(f.time),
      dt: f.time - before.time,
      dx: f.x - before.x,
      dy: f.y - before.y,
      width: f.width,
    }
  })
  const jumps = steps.filter((step, i) => {
    // a frame that comes after the time of a slide cannot tell it from a jump
    if (step.dt > 40 || Math.abs(step.dx) < 0.25 * step.width) return false
    // a frame before or after it that goes on the same way (frames come late under load)
    const along = (other?: { dx: number }) =>
      !!other && other.dx * Math.sign(step.dx) >= 0.05 * Math.abs(step.dx)
    return !along(steps[i - 1]) && !along(steps[i + 1])
  })
  const around = jumps.map((j) => {
    const k = steps.indexOf(j)
    return frames
      .slice(Math.max(0, k - 4), k + 4)
      .map((f) => [Math.round(f.time), Math.round(f.x), Math.round(f.y)])
  })
  expect(jumps, `jumps of the cursor over a wrap: ${JSON.stringify(around)}`).toEqual([])
  expect(steps.some((s) => Math.abs(s.dx) >= 0.25 * s.width && s.dy > 0)).toBe(true)
  // R9: the label went below at the start of a wrapped row, and is above again after the rest
  expect(frames.some((f) => f.labelTop > 0)).toBe(true)
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const caret = document.querySelector('.cm-remote-caret')!.getBoundingClientRect()
          const label = document.querySelector('.cm-remote-caret-label')!.getBoundingClientRect()
          return label.bottom <= caret.top + 1
        }),
      { timeout: 5_000 },
    )
    .toBe(true)
})
