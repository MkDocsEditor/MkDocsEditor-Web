import { expect, test } from '@playwright/test'

import { createDocument, login, openEditor, testName, userPage } from './helpers'
import { BACKEND_URL, USERS } from './ports'

const LINES = Array.from({ length: 300 }, (_, i) => `Zeile ${i + 1}`).join('\n')

/** Older backends lack this; the backend clone of CI follows its master branch. */
async function requireJoinPresence(): Promise<void> {
  const info = (await (await fetch(`${BACKEND_URL}/server-info/`)).json()) as {
    features?: string[]
  }
  test.skip(!info.features?.includes('join-presence'), 'the backend has no join-presence')
}

/** The backend needs client instances for these. */
async function requireInstances(): Promise<void> {
  const info = (await (await fetch(`${BACKEND_URL}/server-info/`)).json()) as {
    features?: string[]
  }
  test.skip(!info.features?.includes('instance-presence'), 'the backend has no instance-presence')
}

test.describe('following another user', () => {
  test.skip(({ isMobile }) => isMobile, 'these tests scroll with the mouse wheel')

  test('follows, pauses on manual input, and can be stopped', async ({ browser }, testInfo) => {
    await requireJoinPresence()
    const id = await createDocument(testName('Follow', testInfo))
    const leader = await userPage(browser, USERS.alice)
    await openEditor(leader, id)
    await leader.locator('.cm-content').click()
    await leader.keyboard.insertText(LINES)
    await expect(leader.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')

    const follower = await userPage(browser, USERS.bob)
    await openEditor(follower, id)
    await follower.getByTestId('online-user').click()
    await expect(follower.getByTestId('following')).toContainText('Following')
    await expect(follower.getByText('Zeile 300', { exact: true })).toBeInViewport()
    const caret = await follower.evaluate(() => getSelection()?.anchorOffset)

    // the leader moves their cursor: the follower goes along, and keeps their own caret
    await leader.keyboard.press('ControlOrMeta+Home')
    await expect(follower.getByText('Zeile 1', { exact: true })).toBeInViewport()
    expect(await follower.evaluate(() => getSelection()?.anchorOffset)).toBe(caret)

    // moving the view by hand only pauses it
    await follower.locator('.cm-scroller').hover()
    await follower.mouse.wheel(0, 2000)
    await expect(follower.getByTestId('following')).toContainText('paused')
    await expect(follower.getByTestId('following')).not.toContainText('paused', {
      timeout: 10_000,
    })
    await expect(follower.getByText('Zeile 1', { exact: true })).toBeInViewport()

    await follower.getByTestId('following').getByRole('button').click()
    await expect(follower.getByTestId('following')).toBeHidden()
    await leader.keyboard.press('ControlOrMeta+End')
    await expect(follower.getByText('Zeile 1', { exact: true })).toBeInViewport()
  })

  test('ends without a note when the follower types', async ({ browser }, testInfo) => {
    await requireJoinPresence()
    const id = await createDocument(testName('Follow typing', testInfo))
    const leader = await userPage(browser, USERS.alice)
    await openEditor(leader, id)
    await leader.locator('.cm-content').click()

    const follower = await userPage(browser, USERS.bob)
    await openEditor(follower, id)
    await follower.getByTestId('online-user').click()
    await expect(follower.getByTestId('following')).toBeVisible()

    await follower.locator('.cm-content').click()
    await follower.keyboard.type('x')
    await expect(follower.getByTestId('following')).toBeHidden()
    await expect(follower.getByText('no longer following')).toBeHidden()
  })

  test('follows the own account on another device', async ({ browser }, testInfo) => {
    await requireInstances()
    const id = await createDocument(testName('Follow own', testInfo))
    const device = await userPage(browser, USERS.alice)
    await openEditor(device, id)
    await device.locator('.cm-content').click()
    await device.keyboard.insertText(LINES)
    await expect(device.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')
    const from = await device.evaluate(
      () => JSON.parse(localStorage.getItem('mkdocseditor.user')!).id as string,
    )

    // the own join link turns it on
    const other = await userPage(browser, USERS.alice)
    await other.goto(`/join/${id}?from=${from}`)
    await expect(other.getByTestId('following')).toBeVisible({ timeout: 15_000 })
    await expect(other.getByText('Zeile 300', { exact: true })).toBeInViewport()
    await device.keyboard.press('ControlOrMeta+Home')
    await expect(other.getByText('Zeile 1', { exact: true })).toBeInViewport()

    // and so does the own avatar
    await other.getByTestId('following').getByRole('button').click()
    await expect(other.getByTestId('following')).toBeHidden()
    await other.getByTestId('online-user').click()
    await expect(other.getByTestId('following')).toBeVisible()

    // the other device goes away: following stays on its ghost, and goes on when it is back
    await device.locator('.cm-content').click()
    await device.keyboard.press('ControlOrMeta+End')
    await expect(other.getByText('Zeile 300', { exact: true })).toBeInViewport()
    await device.goto('/')
    await expect(other.locator('.cm-remote-caret--ghost')).toBeVisible()
    await expect(other.getByTestId('following')).toBeVisible()
    await expect(other.getByTestId('online-user')).toHaveCount(0)

    // the same instance, because the tab is the same
    await openEditor(device, id)
    await expect(other.getByTestId('online-user')).toHaveCount(1)
    await expect(other.locator('.cm-remote-caret--ghost')).toHaveCount(0)
    await device.locator('.cm-content').click()
    await device.keyboard.press('ControlOrMeta+Home')
    await expect(other.getByText('Zeile 1', { exact: true })).toBeInViewport()
    await expect(other.getByTestId('following')).toBeVisible()
  })

  test('treats two tabs of one browser as two instances', async ({ browser }, testInfo) => {
    await requireInstances()
    const id = await createDocument(testName('Follow tabs', testInfo))
    const first = await userPage(browser, USERS.alice)
    await openEditor(first, id)
    await first.locator('.cm-content').click()
    await first.keyboard.insertText(LINES)
    await expect(first.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')

    const second = await first.context().newPage()
    await openEditor(second, id)
    await expect(second.getByTestId('online-user')).toHaveCount(1)
    await second.getByTestId('online-user').click()
    await expect(second.getByText('Zeile 300', { exact: true })).toBeInViewport()

    await first.close()
    await expect(second.locator('.cm-remote-caret--ghost')).toBeVisible()
    await expect(second.getByTestId('following')).toBeVisible()
  })

  test('shows the color an instance chose to the others', async ({ browser }, testInfo) => {
    await requireInstances()
    const id = await createDocument(testName('Follow color', testInfo))
    const chooser = await userPage(browser, USERS.alice)
    await openEditor(chooser, id)
    await chooser.locator('.cm-content').click()
    const other = await userPage(browser, USERS.bob)
    await openEditor(other, id)
    const caret = other.locator('.cm-remote-caret')
    await expect(caret).toBeVisible()
    const before = await caret.evaluate((el) => getComputedStyle(el).borderLeftColor)

    await chooser.getByTestId('open-view-panel').click()
    await chooser.getByTestId('cursor-color-9c36b5').click()
    await chooser.keyboard.press('Escape')
    // the panel took the focus, and without it there is no cursor to see
    await chooser.locator('.cm-content').click()
    await expect
      .poll(() => caret.evaluate((el) => getComputedStyle(el).borderLeftColor))
      .not.toBe(before)
    const chosen = await caret.evaluate((el) => getComputedStyle(el).borderLeftColor)

    // a reload keeps it
    await chooser.reload()
    await chooser.locator('.cm-content').click()
    await expect
      .poll(() => caret.evaluate((el) => getComputedStyle(el).borderLeftColor))
      .toBe(chosen)
  })

  test('shows no ghost of the own previous connection after a reload', async ({
    browser,
  }, testInfo) => {
    await requireInstances()
    const id = await createDocument(testName('Follow reload', testInfo))
    const page = await userPage(browser, USERS.alice)
    await openEditor(page, id)
    await page.locator('.cm-content').click()
    await page.keyboard.insertText('Text')
    await expect(page.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')

    await page.reload()
    await expect(page.locator('.cm-content')).toBeVisible()
    await expect(page.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')
    await expect(page.locator('.cm-remote-caret')).toHaveCount(0)
    await expect(page.getByTestId('online-user')).toHaveCount(0)
  })

  test('stays on the ghost of a user who has left', async ({ browser }, testInfo) => {
    await requireJoinPresence()
    const id = await createDocument(testName('Follow ghost', testInfo))
    const leader = await userPage(browser, USERS.alice)
    await openEditor(leader, id)
    await leader.locator('.cm-content').click()
    await leader.keyboard.insertText(LINES)
    await expect(leader.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')

    const follower = await userPage(browser, USERS.bob)
    await openEditor(follower, id)
    await follower.getByTestId('online-user').click()
    await expect(follower.getByText('Zeile 300', { exact: true })).toBeInViewport()

    await leader.context().close()
    const ghost = follower.locator('.cm-remote-caret--ghost')
    await expect(ghost).toBeVisible()
    // faint, until pointed at
    await expect(ghost).toHaveCSS('opacity', '0.4')
    await ghost.locator('.cm-remote-caret-label').hover()
    await expect(ghost).toHaveCSS('opacity', '1')
    await expect(follower.getByTestId('following')).toBeVisible()
    await expect(follower.getByTestId('online-user')).toHaveCount(0)
  })

  test('follows someone who only reads the preview', async ({ browser }, testInfo) => {
    await requireJoinPresence()
    const id = await createDocument(testName('Follow preview', testInfo))
    const leader = await userPage(browser, USERS.alice)
    await openEditor(leader, id)
    await leader.locator('.cm-content').click()
    await leader.keyboard.insertText(LINES.split('\n').join('\n\n'))
    await expect(leader.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')
    await leader.keyboard.press('ControlOrMeta+Home')

    const follower = await userPage(browser, USERS.bob)
    await openEditor(follower, id)
    await follower.getByTestId('online-user').click()
    const followerEditor = follower.getByTestId('markdown-editor')
    await expect(followerEditor.getByText('Zeile 1', { exact: true })).toBeInViewport()

    // the leader reads the end in the preview: the follower's editor goes there
    await leader.getByRole('button', { name: 'Preview', exact: true }).click()
    const preview = leader.getByTestId('markdown-preview')
    await preview.hover()
    await leader.mouse.wheel(0, 100_000)
    await expect(preview.getByText('Zeile 300', { exact: true })).toBeInViewport()
    await expect(followerEditor.getByText('Zeile 300', { exact: true })).toBeInViewport()
    await expect(follower.getByTestId('following')).toBeVisible()
  })

  test('split scrolling can be unlinked, and links up again', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'phones have no split view')
    const id = await createDocument(testName('Unsync', testInfo))
    await login(page)
    await openEditor(page, id)
    await page.getByRole('button', { name: 'Edit and preview', exact: true }).click()
    await page.locator('.cm-content').click()
    await page.keyboard.insertText(LINES.split('\n').join('\n\n'))
    await page.keyboard.press('ControlOrMeta+Home')
    const preview = page.getByTestId('markdown-preview')
    const editor = page.locator('.cm-scroller')
    await expect(preview.getByText('Zeile 300', { exact: true })).toBeAttached()
    await expect(preview.getByText('Zeile 1', { exact: true })).toBeInViewport()

    // off: the editor goes to the end, the preview stays at the start
    await page.getByTestId('open-view-panel').click()
    await page.getByTestId('toggle-sync-scroll').locator('input').click()
    await page.keyboard.press('Escape')
    await editor.hover()
    await page.mouse.wheel(0, 100_000)
    await expect(editor.getByText('Zeile 300', { exact: true })).toBeInViewport()
    await page.waitForTimeout(300)
    await expect(preview.getByText('Zeile 1', { exact: true })).toBeInViewport()

    // on again: the preview goes to where the editor is, once
    await page.getByTestId('open-view-panel').click()
    await page.getByTestId('toggle-sync-scroll').locator('input').click()
    await expect(preview.getByText('Zeile 300', { exact: true })).toBeInViewport()
  })

  test('scrolls editor and preview together in split mode', async ({ page }, testInfo) => {
    const id = await createDocument(testName('Split', testInfo))
    await login(page)
    await openEditor(page, id)
    await page.getByRole('button', { name: 'Edit and preview', exact: true }).click()
    await page.locator('.cm-content').click()
    await page.keyboard.insertText(LINES.split('\n').join('\n\n'))
    await page.keyboard.press('ControlOrMeta+Home')
    const preview = page.getByTestId('markdown-preview')
    const editor = page.locator('.cm-scroller')
    // the preview renders a moment after the typing; before, it has nothing to scroll
    await expect(preview.getByText('Zeile 300', { exact: true })).toBeAttached()

    // the preview drives: the editor shows its reading line at the same height
    await preview.hover()
    await page.mouse.wheel(0, 3000)
    await expect.poll(() => preview.evaluate((root) => root.scrollTop)).toBeGreaterThan(1000)
    const reading = await preview.evaluate((root) => {
      const max = root.scrollHeight - root.clientHeight
      const progress = max > 0 ? root.scrollTop / max : 0
      const box = root.getBoundingClientRect()
      const y = box.top + progress * root.clientHeight
      const line = [...root.querySelectorAll('p')].find(
        (p) => p.getBoundingClientRect().bottom >= y,
      )
      return { text: line?.textContent ?? '', progress }
    })
    expect(reading.text).toMatch(/^Zeile \d+$/)
    expect(reading.text).not.toBe('Zeile 1')
    await expect(editor.getByText(reading.text, { exact: true })).toBeInViewport()

    // both reach the end together
    await page.mouse.wheel(0, 100_000)
    await expect(preview.getByText('Zeile 300', { exact: true })).toBeInViewport()
    await expect(editor.getByText('Zeile 300', { exact: true })).toBeInViewport()

    // and back: the editor drives, and both start together
    await editor.hover()
    await page.mouse.wheel(0, -100_000)
    await expect(editor.getByText('Zeile 1', { exact: true })).toBeInViewport()
    await expect(preview.getByText('Zeile 1', { exact: true })).toBeInViewport()

    // typing: the preview shows the line with the caret
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.insertText('\n\nGanz unten')
    await expect(preview.getByText('Ganz unten', { exact: true })).toBeInViewport()
  })
})
