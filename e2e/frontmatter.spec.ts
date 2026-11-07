import { expect, test } from '@playwright/test'

import { createDocument, login, openEditor, openFiles, testName, typeAt } from './helpers'

test('front matter names the page and is never shown as text', async ({ page }, testInfo) => {
  const name = testName('Vorne', testInfo)
  const title = `Apfelkuchen ${testInfo.project.name}`
  const id = await createDocument(name)
  await login(page)
  await openEditor(page, id)

  await typeAt(page, 'end', '')
  // typed line breaks get lost in the phone emulation, pasted ones do not
  await page.keyboard.insertText(
    `---\ntitle: ${title}\ndescription: Mit Streuseln\nstatus: new\ntags: [Backen]\n---\nTeig kneten.`,
  )
  // the title follows the text as it is typed
  await expect(page.getByTestId('document-title')).toHaveText(title)

  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  const preview = page.getByTestId('markdown-preview')
  await expect(preview.locator('h1')).toContainText(title)
  await expect(preview.locator('.md-status')).toHaveText('New')
  await expect(preview.locator('.md-tag')).toHaveText('Backen')
  await expect(preview).toContainText('Teig kneten.')
  await expect(preview).not.toContainText('description:')

  // lists show the title and the description of the page
  await openFiles(page)
  const entry = page.getByTestId('entry-document').filter({ hasText: title })
  await expect(entry).toContainText('Mit Streuseln')
  await expect(entry.getByTestId('entry-status')).toHaveText('New')
})
