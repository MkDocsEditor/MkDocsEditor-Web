import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { settingsSection } from './accounts'
import { MAIN_WIKI } from './backend'
import { createDocument, documentContent, login, openEditor, testName, userPage } from './helpers'
import { BACKEND_URL, USERS } from './ports'

async function features(): Promise<string[]> {
  const info = (await (await fetch(`${BACKEND_URL}/server-info/`)).json()) as {
    features?: string[]
  }
  return info.features ?? []
}

test('starts with the start page of the wiki, or with the files', async ({ page }) => {
  await login(page)
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByTestId('dashboard-index')).toContainText('Das ist das Test-Wiki.')
  // the title of the start page shows when it is opened, not here
  await expect(page.getByTestId('dashboard-index').getByText('Willkommen')).toBeHidden()

  await page.getByTestId('all-files').click()
  await expect(page.getByTestId('section-title')).toHaveText('Wiki')

  // the setting of this browser, under Settings > Appearance: `/` shows the files instead
  await page.getByTestId('account-menu').click()
  await page.getByTestId('menu-settings').click()
  await settingsSection(page, 'appearance')
  await page.getByTestId('setting-start-page').getByLabel('Files of the top folder').check()
  await page.goto('/')
  await expect(page.getByTestId('section-title')).toHaveText('Wiki')
  await page.goto('/settings/appearance')
  await page.getByTestId('setting-start-page').getByLabel('What’s going on').check()
  await page.goto('/')
  await expect(page.getByTestId('dashboard-title')).toBeVisible()
})

test('pins pages for oneself and for everyone', async ({ browser }, testInfo) => {
  test.skip(!(await features()).includes('pins'), 'the backend has no pins')
  const name = testName('Angepinnt', testInfo)
  const id = await createDocument(name)

  // an editor pins it for everyone, a reader only for themselves
  const bob = await userPage(browser, USERS.bob)
  await bob.goto(`/document/${id}`)
  await bob.getByRole('button', { name: 'More' }).click()
  await bob.getByTestId('item-pin-family').click()
  await bob.goto('/')
  await expect(bob.getByTestId('pins-family').getByText(name)).toBeVisible()
  await expect(bob.getByTestId('pins-family')).toContainText('pinned by')

  const carol = await userPage(browser, USERS.carol)
  await expect(carol.getByTestId('pins-family').getByText(name)).toBeVisible()
  await carol.goto(`/document/${id}`)
  await carol.getByRole('button', { name: 'More' }).click()
  await expect(carol.getByTestId('item-pin-family')).toHaveCount(0)
  await carol.getByTestId('item-pin-personal').click()
  await carol.goto('/')
  await expect(carol.getByTestId('pins-personal').getByText(name)).toBeVisible()
  // nobody else sees it
  await expect(bob.getByTestId('pins-personal').getByText(name)).toHaveCount(0)

  // unpinned for everyone: the others see it go without a reload
  await bob
    .getByTestId('pins-family')
    .getByRole('button', { name: `Unpin ${name}` })
    .click()
  await expect(carol.getByTestId('pins-family').getByText(name)).toHaveCount(0)
  await expect(carol.getByTestId('pins-personal').getByText(name)).toBeVisible()
})

test('changes the order of the pins', async ({ browser }, testInfo) => {
  test.skip(!(await features()).includes('pin-order'), 'the backend keeps no order of pins')
  const first = testName('Erster', testInfo)
  const second = testName('Zweiter', testInfo)
  const ids = [await createDocument(first), await createDocument(second)]
  const carol = await userPage(browser, USERS.carol)
  for (const id of ids) {
    await carol.goto(`/document/${id}`)
    await carol.getByRole('button', { name: 'More' }).click()
    await carol.getByTestId('item-pin-personal').click()
  }
  await carol.goto('/')
  const pins = carol.getByTestId('pins-personal').getByTestId('pin')
  const names = async () =>
    (await pins.allInnerTexts()).filter((t) => t.includes(first) || t.includes(second))
  const order = (...expected: string[]) =>
    expect
      .poll(async () => (await names()).map((t) => (t.includes(first) ? first : second)))
      .toEqual(expected)
  // new pins go to the end
  await order(first, second)

  // with the keyboard: the moved pin keeps the focus
  const pinOf = (name: string) => pins.filter({ hasText: name })
  await pinOf(second).focus()
  await carol.keyboard.press('Alt+ArrowUp')
  await order(second, first)
  await expect(pinOf(second)).toBeFocused()

  // the order is kept by the server
  await carol.reload()
  await order(second, first)

  if (testInfo.project.name === 'desktop') {
    await pinOf(second).dragTo(pinOf(first), { targetPosition: { x: 20, y: 40 } })
    await order(first, second)
    await carol.reload()
    await order(first, second)
  }
})

test('the feed says who changed which page, and opens it at the change', async ({
  browser,
}, testInfo) => {
  test.skip(!(await features()).includes('feed'), 'the backend has no feed')
  const name = testName('Neuigkeit', testInfo)
  const id = await createDocument(name)
  const alice = await userPage(browser, USERS.alice)
  await openEditor(alice, id)
  await alice.locator('.cm-content').click()
  // a section, not a level-1 heading: that would become the name of the page in the feed; far
  // enough down that opening the page there has to scroll
  const filler = Array.from({ length: 80 }, (_, i) => `Zeile ${i + 1}\n`).join('\n')
  await alice.keyboard.insertText(`${filler}\n## Zutaten\n\nMehl und Zucker\n`)
  await expect(alice.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')

  const bob = await userPage(browser, USERS.bob)
  const entry = bob.getByTestId('feed-entry').filter({ hasText: name }).first()
  await expect(async () => {
    await bob.reload()
    await expect(entry).toContainText('edited', { timeout: 2000 })
  }).toPass({ timeout: 30_000 })
  await expect(entry.getByTestId('feed-headings')).toHaveText('In Zutaten')
  await expect(entry.getByTestId('feed-added')).toHaveText(/^\+\d+$/)
  // nothing was removed: a count of zero is left out
  await expect(entry.getByTestId('feed-removed')).toHaveCount(0)
  await entry.click()
  // the section is shown and highlighted, in whichever pane is on screen; the link is clean again
  await expect(bob).toHaveURL(new RegExp(`/document/${id}$`))
  const editorFlash = bob.locator('.cm-flash-line:visible')
  const previewFlash = bob.locator('.markdown-preview__flash:visible')
  await expect(editorFlash.or(previewFlash).first()).toBeInViewport()
  if (testInfo.project.name === 'desktop') {
    // split: both panes show the section; with changed lines from the server, the whole new text
    // is the change, from its first line
    if (!(await features()).includes('feed-ranges'))
      await expect(editorFlash.first()).toContainText('Zutaten')
    await expect(previewFlash).toHaveCount(1)
  }
  if (await previewFlash.count()) {
    // one band from the heading to the end of the section
    const band = (await previewFlash.boundingBox())!
    const heading = (await bob
      .getByTestId('markdown-preview')
      .getByRole('heading', { name: 'Zutaten' })
      .boundingBox())!
    const text = (await bob
      .getByTestId('markdown-preview')
      .getByText('Mehl und Zucker')
      .boundingBox())!
    expect(band.y).toBeLessThanOrEqual(heading.y)
    expect(band.y + band.height).toBeGreaterThanOrEqual(text.y + text.height)
  }
  await expect(editorFlash.or(previewFlash)).toHaveCount(0, { timeout: 5_000 })
})

test('opens an edit at the lines it changed', async ({ browser }, testInfo) => {
  test.skip(!(await features()).includes('feed-ranges'), 'the backend has no changed lines')
  const name = testName('Nachtrag', testInfo)
  const id = await createDocument(name)
  // a page that is there before the edit, so only the new lines are the change
  const filler = Array.from({ length: 60 }, (_, i) => `Zeile ${i + 1}`).join('\n\n')
  writeFileSync(
    path.join(MAIN_WIKI, 'docs', `${name}.md`),
    `# ${name}\n\n## Zutaten\n\n${filler}\n\n## Ende\n\nletzte Zeile\n`,
  )
  await expect.poll(() => documentContent(id)).toContain('letzte Zeile')

  const alice = await userPage(browser, USERS.alice)
  await openEditor(alice, id)
  await alice.locator('.cm-content').click()
  await alice.keyboard.press('ControlOrMeta+End')
  // a paragraph of its own, whether or not the text ends with a newline
  await alice.keyboard.insertText('\n\nNachtrag\n')
  await expect(alice.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')

  const bob = await userPage(browser, USERS.bob)
  const entry = bob.getByTestId('feed-entry').filter({ hasText: name }).first()
  await expect(async () => {
    await bob.reload()
    await expect(entry).toContainText('edited', { timeout: 2000 })
  }).toPass({ timeout: 30_000 })
  await entry.click()
  await expect(bob).toHaveURL(new RegExp(`/document/${id}$`))

  const editorFlash = bob.locator('.cm-flash-line:visible')
  const previewFlash = bob.locator('.markdown-preview__flash:visible')
  await expect(editorFlash.or(previewFlash).first()).toBeInViewport()
  if (testInfo.project.name === 'desktop') {
    // only the new lines, not the section around them
    await expect(editorFlash.last()).toHaveText('Nachtrag')
    expect(await editorFlash.count()).toBeLessThanOrEqual(3)
  }
  if (await previewFlash.count()) {
    const band = (await previewFlash.first().boundingBox())!
    const preview = bob.getByTestId('markdown-preview')
    const added = (await preview.getByText('Nachtrag', { exact: true }).boundingBox())!
    const before = (await preview.getByText('letzte Zeile', { exact: true }).boundingBox())!
    expect(band.y).toBeGreaterThan(before.y + before.height - 1)
    expect(band.y + band.height).toBeGreaterThanOrEqual(added.y + added.height)
  }
})
