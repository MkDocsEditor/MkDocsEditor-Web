import { expect, test } from '@playwright/test'

import { createDocument, openEditor, userPage } from './helpers'
import { BACKEND_URL, USERS } from './ports'

const LINES = Array.from({ length: 300 }, (_, i) => `Zeile ${i + 1}`).join('\n')

/** Older backends lack this; the backend clone of CI follows its master branch. */
async function requireJoinPresence(): Promise<void> {
  const info = (await (await fetch(`${BACKEND_URL}/server-info/`)).json()) as {
    features?: string[]
  }
  test.skip(!info.features?.includes('join-presence'), 'the backend has no join-presence')
}

test.describe('following another user', () => {
  test.skip(({ isMobile }) => isMobile, 'these tests scroll with the mouse wheel')

  test('follows, pauses on manual input, and can be stopped', async ({ browser }, testInfo) => {
    await requireJoinPresence()
    const id = await createDocument(`Follow ${testInfo.project.name} ${testInfo.retry}`)
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
    const id = await createDocument(`Follow typing ${testInfo.project.name} ${testInfo.retry}`)
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

  test('stays on the ghost of a user who has left', async ({ browser }, testInfo) => {
    await requireJoinPresence()
    const id = await createDocument(`Follow ghost ${testInfo.project.name} ${testInfo.retry}`)
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
    await expect(follower.locator('.cm-remote-caret--ghost')).toBeVisible()
    await expect(follower.getByTestId('following')).toBeVisible()
    await expect(follower.getByTestId('online-user')).toHaveCount(0)
  })
})
