import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { git, MAIN_WIKI } from './backend'
import { createDocument, documentContent, editorText, login, openEditor, testName } from './helpers'

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

  await page.getByRole('button', { name: 'Mehr' }).click()
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
  await dialog.getByRole('tab', { name: 'Vergleich mit jetzt' }).click()
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
  await page.getByRole('button', { name: 'Mehr' }).click()
  await page.getByTestId('open-history').click()
  await expect(entries).toHaveCount(4)
  await expect(entries.nth(0)).toContainText('Restore')
})
