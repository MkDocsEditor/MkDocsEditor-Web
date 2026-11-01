import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { backendRequest, editorText, login, openEditor, testName, uploadResource } from './helpers'

// a 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

type Item = { id: string; name: string }

async function create(kind: 'section' | 'document', parent: string, name: string): Promise<Item> {
  const response = await backendRequest('POST', `/${kind}/`, { parent, name })
  expect(response.ok).toBe(true)
  return (await response.json()) as Item
}

/** A folder with two subfolders: `Alpha/Seite.md` links to things in `Beta`. */
async function wiki(base: string) {
  const root = (await (await backendRequest('GET', '/section/')).json()) as Item
  const top = await create('section', root.id, base)
  const alpha = await create('section', top.id, 'Alpha')
  const beta = await create('section', top.id, 'Beta')
  const seite = await create('document', alpha.id, 'Seite')
  const ziel = await create('document', beta.id, 'Ziel')
  return { top, alpha, beta, seite, ziel }
}

/** Types text at the end and selects its last `select` characters. */
async function typeAndSelect(page: Page, text: string, select: number): Promise<void> {
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.insertText(text)
  for (let i = 0; i < select; i++) await page.keyboard.press('Shift+ArrowLeft')
}

test('the link picker links a heading of another page', async ({ page }, testInfo) => {
  const base = testName('Links', testInfo)
  const { ziel, seite } = await wiki(base)
  await login(page)
  // give the target page headings
  await openEditor(page, ziel.id)
  await page.locator('.cm-content').click()
  await page.keyboard.insertText('# Ziel\n\n## Zweiter Teil\n')
  await expect(page.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')

  await openEditor(page, seite.id)
  await typeAndSelect(page, 'Siehe dort', 4)
  await page.getByTestId('format-link').click()
  const picker = page.getByTestId('link-picker')
  await expect(picker.getByTestId('link-text').locator('input')).toHaveValue('dort')
  // starts in the page's folder
  await expect(picker.getByTestId('browser-current')).toHaveText('Alpha')
  await picker.getByTestId('browser-up').click()
  await picker.getByTestId('browser-section').filter({ hasText: 'Beta' }).click()
  await picker.getByTestId('browser-document').filter({ hasText: 'Ziel' }).click()
  await picker.getByTestId('link-heading').filter({ hasText: 'Zweiter Teil' }).click()
  await expect(picker).toBeHidden()
  await expect.poll(() => editorText(page)).toBe('Siehe [dort](../Beta/Ziel.md#zweiter-teil)')

  // a search hit for a folder links to its index (or the folder itself)
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.insertText(' und ')
  await page.getByTestId('format-link').click()
  // folders are listed with their path; the path names the test's own folder
  await picker.getByTestId('browser-search').locator('input').fill('Beta')
  await picker.getByTestId('browser-hit-section').filter({ hasText: base }).click()
  await expect.poll(() => editorText(page)).toContain(' und [Beta](../Beta/)')
})

test('the image picker inserts existing, uploaded and web images', async ({
  page,
  isMobile,
}, testInfo) => {
  const base = testName('Bilder', testInfo)
  const { beta, seite } = await wiki(base)
  await uploadResource(beta.id, 'Berg (1).png', PNG, 'image/png')
  await login(page)
  await openEditor(page, seite.id)
  await page.locator('.cm-content').click()

  // an existing image in another folder, found by the search
  if (isMobile) await page.getByTestId('format-image').click()
  else await page.keyboard.press('ControlOrMeta+Shift+K')
  const picker = page.getByTestId('resource-picker')
  await picker.getByTestId('browser-search').locator('input').fill('Berg (1)')
  await picker.getByTestId('browser-hit-resource').filter({ hasText: base }).click()
  await expect(picker).toBeHidden()
  await expect.poll(() => editorText(page)).toBe('![Berg (1)](../Beta/Berg%20%281%29.png)')

  // an upload into another folder, with the selection as alt text
  await page.keyboard.insertText('\n')
  await typeAndSelect(page, 'Ein See', 7)
  await page.getByTestId('format-image').click()
  await expect(picker.getByTestId('resource-alt').locator('input')).toHaveValue('Ein See')
  await picker.getByTestId('resource-tab-upload').click()
  await expect(picker.getByTestId('upload-target')).toContainText('/Alpha')
  await picker.getByTestId('browser-up').click()
  await picker.getByTestId('browser-section').filter({ hasText: 'Beta' }).click()
  await expect(picker.getByTestId('upload-target')).toContainText('/Beta')
  await picker
    .getByTestId('resource-file-input')
    .setInputFiles([{ name: 'See.png', mimeType: 'image/png', buffer: PNG }])
  await expect(picker).toBeHidden()
  await expect.poll(() => editorText(page)).toContain('\n![Ein See](../Beta/See.png)')
  const tree = await (await backendRequest('GET', `/section/${beta.id}/`)).text()
  expect(tree).toContain('See.png')

  // an image from the web
  await page.keyboard.insertText('\n')
  await page.getByTestId('format-image').click()
  await picker.getByTestId('resource-tab-web').click()
  await picker.getByTestId('resource-url').locator('input').fill('https://example.com/a b.jpg')
  await picker.getByTestId('resource-insert-web').click()
  await expect.poll(() => editorText(page)).toContain('\n![a b.jpg](https://example.com/a%20b.jpg)')
})
