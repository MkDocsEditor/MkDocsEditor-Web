import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { git, MAIN_WIKI } from './backend'
import {
  backendRequest,
  createDocument,
  documentContent,
  editorText,
  login,
  openEditor,
  testName,
  userPage,
} from './helpers'
import { BACKEND_URL, USERS } from './ports'

test('shows the versions of a page and restores an old one', async ({ page }, testInfo) => {
  const name = testName('Verlauf', testInfo)
  const id = await createDocument(name)
  // two commits made with git on the server, like a git pull
  const file = path.join(MAIN_WIKI, 'docs', `${name}.md`)
  writeFileSync(file, '# Rezept\n\nVersion eins\n')
  git(MAIN_WIKI, ['commit', '-q', '-m', 'Erste Fassung', '--', file], 'Oma Erna <oma@example.com>')
  await expect.poll(() => documentContent(id)).toContain('Version eins')
  writeFileSync(file, '# Rezept\n\nVersion zwei\n')
  git(MAIN_WIKI, ['commit', '-q', '-m', 'Zweite Fassung', '--', file], 'Opa Hans <opa@example.com>')
  await expect.poll(() => documentContent(id)).toContain('Version zwei')

  await login(page)
  await openEditor(page, id)
  await expect.poll(() => editorText(page)).toContain('Version zwei')

  await page.getByRole('button', { name: 'More' }).click()
  await page.getByTestId('open-history').click()
  const dialog = page.getByTestId('history-dialog')
  const entries = dialog.getByTestId('history-entry')
  // newest first: Opa, Oma, and the creation by alice
  await expect(entries).toHaveCount(3)
  await expect(entries.nth(0)).toContainText('Opa Hans')
  await expect(entries.nth(1)).toContainText('Oma Erna')
  await expect(entries.nth(1)).toContainText('Erste Fassung')

  await entries.nth(1).click()
  const diff = dialog.getByTestId('history-diff')
  await expect(diff.locator('.history__line--add')).toContainText(['Version eins'])
  await dialog.getByRole('tab', { name: 'Compare with now' }).click()
  await expect(diff.locator('.history__line--del')).toContainText(['Version eins'])
  await expect(diff.locator('.history__line--add')).toContainText(['Version zwei'])
  await dialog.getByRole('tab', { name: 'Text' }).click()
  await expect(dialog.getByTestId('history-content')).toHaveText('# Rezept\n\nVersion eins\n')

  // the restore arrives in the open editor like any other edit
  await dialog.getByTestId('history-restore').click()
  await page.getByTestId('confirm-button').click()
  await expect(dialog).toBeHidden()
  await expect.poll(() => editorText(page)).toBe('# Rezept\n\nVersion eins\n')
  await expect.poll(() => documentContent(id)).toBe('# Rezept\n\nVersion eins\n')

  // and is committed right away
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByTestId('open-history').click()
  await expect(entries).toHaveCount(4)
  await expect(entries.nth(0)).toContainText('Restore')
})

test('summarizes a version and opens the page where it changed', async ({ page }, testInfo) => {
  const name = testName('Abschnitte', testInfo)
  const id = await createDocument(name)
  const file = path.join(MAIN_WIKI, 'docs', `${name}.md`)
  const filler = Array.from({ length: 30 }, (_, i) => `Zeile ${i + 1}`).join('\n')
  writeFileSync(
    file,
    `# Rezept\n\n## Zutaten\n\nMehl.\n\n${filler}\n\n## Backen\n\nBei 180 Grad.\n`,
  )
  git(MAIN_WIKI, ['commit', '-q', '-m', 'Erste Fassung', '--', file], 'Oma Erna <oma@example.com>')
  await expect.poll(() => documentContent(id)).toContain('180 Grad')
  writeFileSync(
    file,
    `# Rezept\n\n## Zutaten\n\nMehl.\n\n${filler}\n\n## Backen\n\nBei 200 Grad.\n`,
  )
  git(MAIN_WIKI, ['commit', '-q', '-m', 'Heißer', '--', file], 'Opa Hans <opa@example.com>')
  await expect.poll(() => documentContent(id)).toContain('200 Grad')

  await login(page)
  await openEditor(page, id)
  // the editor shows only the lines on screen; the change is far below
  await expect.poll(() => editorText(page)).toContain('Mehl.')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByTestId('open-history').click()
  const dialog = page.getByTestId('history-dialog')
  const newest = dialog.getByTestId('history-entry').first()
  await expect(newest).toContainText('Opa Hans')
  await expect(newest.getByTestId('history-summary')).toHaveText('Heißer · +1 −1 · Backen')

  await newest.click()
  const diff = dialog.getByTestId('history-diff')
  // only the changed word is marked, inside the changed lines
  await expect(diff.locator('.history__word--changed')).toHaveText(['180', '200'])
  const show = dialog.getByTestId('history-hunk-show')
  await expect(show).toHaveText(['Backen'])
  // the page opens at the changed line, far below the top
  await show.click()
  await expect(dialog).toBeHidden()
  const editorFlash = page.locator('.cm-flash-line:visible')
  const previewFlash = page.locator('.markdown-preview__flash:visible')
  await expect(editorFlash.or(previewFlash).first()).toBeInViewport()
  if (await editorFlash.count()) await expect(editorFlash.first()).toContainText('200 Grad')
})

/** When alice last saw the page, as the server remembers it. */
async function lastSeen(id: string): Promise<string | null> {
  const response = await backendRequest('GET', `/document/${id}/changes/`, undefined, USERS.alice)
  const body = (await response.json()) as { since: { time: string; seenToken: string } | null }
  return body.since?.seenToken ?? null
}

test('shows what changed since the last visit, once', async ({ browser }, testInfo) => {
  const agent = testName('Agent', testInfo)
  const created = await backendRequest(
    'POST',
    '/account/tokens/',
    { name: agent, scope: 'write', expiresInDays: 1 },
    USERS.bob,
  )
  expect(created.ok, await created.clone().text()).toBe(true)
  const { token } = (await created.json()) as { token: string }
  const id = await createDocument(testName('Besuch', testInfo))
  const edit = (old: string, text: string) =>
    fetch(`${BACKEND_URL}/document/${id}/edits/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ edits: [{ old, new: text }] }),
    })
  expect((await edit('', '# Rezept\n\n## Zutaten\n\nMehl.\n')).ok).toBe(true)

  // alice reads the page and leaves: the server remembers what she saw
  const page = await userPage(browser, USERS.alice)
  await openEditor(page, id)
  await expect.poll(() => editorText(page)).toContain('Mehl.')
  await expect(page.getByTestId('changes-banner')).toHaveCount(0)
  await page.goto('/')
  await expect.poll(() => lastSeen(id)).not.toBeNull()

  // bob's agent changes it while she is away
  expect((await edit('Mehl.', 'Mehl und Zucker.')).ok).toBe(true)
  await openEditor(page, id)
  const banner = page.getByTestId('changes-banner')
  await expect(banner).toContainText(`by bob via ${agent}`)
  await expect(banner).toContainText('Zutaten')
  await banner.getByTestId('changes-show').click()
  const dialog = page.getByTestId('changes-dialog')
  await expect(dialog.getByTestId('changes-author')).toContainText([agent])
  await expect(dialog.locator('.history__word--changed')).toHaveText([' und Zucker'])
  // the heading leads to the change in the page; seen now
  await dialog.getByTestId('history-hunk-show').click()
  await expect(dialog).toBeHidden()
  await expect(banner).toBeHidden()
  const editorFlash = page.locator('.cm-flash-line:visible')
  const previewFlash = page.locator('.markdown-preview__flash:visible')
  await expect(editorFlash.or(previewFlash).first()).toBeVisible()

  // the next visit has nothing new
  await page.goto('/')
  await openEditor(page, id)
  await expect.poll(() => editorText(page)).toContain('Zucker')
  await expect(banner).toHaveCount(0)
})

test('undoes one change and keeps the later ones', async ({ page }, testInfo) => {
  const name = testName('Rückgängig', testInfo)
  const id = await createDocument(name)
  const file = path.join(MAIN_WIKI, 'docs', `${name}.md`)
  const text = (flour: string, heat: string) =>
    `# Rezept\n\n## Zutaten\n\n${flour}\n\n## Backen\n\nBei ${heat} Grad.\n`
  const commit = (content: string, message: string, author: string) => {
    writeFileSync(file, content)
    git(MAIN_WIKI, ['commit', '-q', '-m', message, '--', file], author)
  }
  commit(text('Mehl.', '180'), 'Erste Fassung', 'Oma Erna <oma@example.com>')
  commit(text('Mehl.', '200'), 'Heißer', 'Opa Hans <opa@example.com>')
  commit(text('Mehl und Zucker.', '200'), 'Süßer', 'Oma Erna <oma@example.com>')
  await expect.poll(() => documentContent(id)).toContain('Zucker')

  await login(page)
  await openEditor(page, id)
  await expect.poll(() => editorText(page)).toContain('Zucker')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByTestId('open-history').click()
  const dialog = page.getByTestId('history-dialog')
  const entries = dialog.getByTestId('history-entry')
  await entries.filter({ hasText: 'Heißer' }).click()
  await dialog.getByTestId('history-undo').click()

  // the confirmation shows who made it and what it changed
  const confirm = page.getByTestId('history-undo-dialog')
  await expect(confirm.getByTestId('history-undo-makers')).toHaveText('Made by Opa Hans.')
  await expect(confirm.getByTestId('history-undo-shared')).toHaveCount(0)
  await expect(confirm.locator('.history__word--changed')).toHaveText(['180', '200'])
  await confirm.getByTestId('history-undo-confirm').click()
  await expect(dialog).toBeHidden()

  // the oven goes back to 180, the sugar of the later change stays
  await expect.poll(() => editorText(page)).toContain('Bei 180 Grad.')
  expect(await editorText(page)).toContain('Mehl und Zucker.')
  await expect.poll(() => documentContent(id)).toBe(text('Mehl und Zucker.', '180'))
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByTestId('open-history').click()
  await expect(entries.first()).toContainText('Revert')
})

test('says who wrote a line and when', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'phones have no hover; the Android app has it')
  const name = testName('Wer', testInfo)
  const id = await createDocument(name)
  const file = path.join(MAIN_WIKI, 'docs', `${name}.md`)
  writeFileSync(file, '# Rezept\n\nMehl.\n')
  git(MAIN_WIKI, ['commit', '-q', '-m', 'Erste Fassung', '--', file], 'Oma Erna <oma@example.com>')
  await expect.poll(() => documentContent(id)).toContain('Mehl.')

  await login(page)
  await openEditor(page, id)
  await expect.poll(() => editorText(page)).toContain('Mehl.')
  const numbers = page.locator('.cm-lineNumbers .cm-gutterElement')
  await numbers.filter({ hasText: /^3$/ }).hover()
  const tooltip = page.getByTestId('line-history')
  await expect(tooltip).toContainText('Oma Erna')
  await expect(tooltip).toContainText('Erste Fassung')

  // a line typed now is not in the history yet
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('Zucker.')
  await expect.poll(() => documentContent(id)).toContain('Zucker.')
  // the server learns who wrote the line a moment after it arrives
  await expect(async () => {
    await page.mouse.move(600, 600)
    await expect(tooltip).toBeHidden()
    await numbers.filter({ hasText: /^4$/ }).hover()
    await expect(tooltip).toContainText('alice, not in the history yet', { timeout: 2000 })
  }).toPass({ timeout: 15_000 })
})
