import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { backendRequest, documentContent, editorText, login, openEditor, testName } from './helpers'

type Item = { id: string; name: string }

async function create(kind: 'section' | 'document', parent: string, name: string): Promise<Item> {
  const response = await backendRequest('POST', `/${kind}/`, { parent, name })
  expect(response.ok).toBe(true)
  return (await response.json()) as Item
}

/** `base/Alpha/Seite.md` links to `base/Beta/Ziel.md`. */
async function wiki(page: Page, base: string) {
  const root = (await (await backendRequest('GET', '/section/')).json()) as Item
  const top = await create('section', root.id, base)
  const alpha = await create('section', top.id, 'Alpha')
  const beta = await create('section', top.id, 'Beta')
  const seite = await create('document', alpha.id, 'Seite')
  const ziel = await create('document', beta.id, 'Ziel')
  await openEditor(page, seite.id)
  await page.locator('.cm-content').click()
  await page.keyboard.insertText('Siehe [Ziel](../Beta/Ziel.md).')
  await expect.poll(() => documentContent(seite.id)).toBe('Siehe [Ziel](../Beta/Ziel.md).')
  return { top, alpha, beta, seite, ziel }
}

async function movedId(path: string): Promise<string> {
  type S = { id: string; name: string; subsections: S[]; documents: Item[] }
  let section = (await (await backendRequest('GET', '/section/')).json()) as S
  const parts = path.split('/')
  const file = parts.pop()!
  for (const part of parts) section = section.subsections.find((s) => s.name === part)!
  return section.documents.find((d) => d.name === file)!.id
}

test('moving a page from its folder list updates the links to it', async ({ page }, testInfo) => {
  const base = testName('Umzug', testInfo)
  await login(page)
  const { beta, seite } = await wiki(page, base)

  await page.goto(`/section/${beta.id}`)
  await page.getByRole('button', { name: 'Actions for Ziel' }).click()
  await page.getByTestId('entry-move').click()
  const dialog = page.getByTestId('move-dialog')
  await expect(dialog.getByTestId('move-target')).toHaveText(`${base}/Beta`)
  await dialog.getByTestId('browser-up').click()
  await dialog.getByTestId('browser-section').filter({ hasText: 'Alpha' }).click()
  await expect(dialog.getByTestId('move-new-path')).toHaveText(`${base}/Alpha/Ziel.md`)
  await expect(dialog.getByTestId('move-summary')).toContainText('Links are updated in 1 page')
  await dialog.getByTestId('move-document').click()
  await expect(dialog).toContainText('+ Siehe [Ziel](Ziel.md).')
  await dialog.getByTestId('move-apply').click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(`Moved to ${base}/Alpha/Ziel.md`)).toBeVisible()
  await expect.poll(() => documentContent(seite.id)).toBe('Siehe [Ziel](Ziel.md).')
})

test('an open page can be moved and renamed and stays editable', async ({ page }, testInfo) => {
  const base = testName('Offen', testInfo)
  await login(page)
  const { ziel, seite } = await wiki(page, base)

  await openEditor(page, ziel.id)
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByTestId('document-move').click()
  const dialog = page.getByTestId('move-dialog')
  await dialog.getByTestId('move-name').locator('input').fill('Neues Ziel')
  await expect(dialog.getByTestId('move-new-path')).toHaveText(`${base}/Beta/Neues Ziel.md`)
  await dialog.getByTestId('move-apply').click()
  await expect(dialog).toBeHidden()

  const newId = await movedId(`${base}/Beta/Neues Ziel`)
  await expect(page).toHaveURL(new RegExp(`/document/${newId}$`))
  await expect(page.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')
  await page.locator('.cm-content').click()
  await page.keyboard.insertText('Nach dem Umzug.')
  await expect.poll(() => documentContent(newId)).toBe('Nach dem Umzug.')
  expect(await editorText(page)).toBe('Nach dem Umzug.')
  await expect.poll(() => documentContent(seite.id)).toBe('Siehe [Ziel](../Beta/Neues%20Ziel.md).')
})

test('dragging a page onto a folder in the tree moves it', async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, 'drag and drop is for pointers; phones use "Move to…"')
  const base = testName('Ziehen', testInfo)
  await login(page)
  const { top, seite } = await wiki(page, base)
  await page.goto(`/section/${top.id}`)
  const drawer = page.getByTestId('nav-drawer')
  await drawer.getByTestId('tree-section').filter({ hasText: 'Alpha' }).click()
  await drawer.getByTestId('tree-section').filter({ hasText: 'Beta' }).click()
  await drawer
    .getByTestId('tree-document')
    .filter({ hasText: 'Ziel' })
    .dragTo(drawer.getByTestId('tree-section').filter({ hasText: 'Alpha' }))
  const dialog = page.getByTestId('move-dialog')
  await expect(dialog.getByTestId('move-target')).toHaveText(`${base}/Alpha`)
  await expect(dialog.getByTestId('move-summary')).toContainText('Links are updated in 1 page')
  await dialog.getByTestId('move-apply').click()
  await expect(dialog).toBeHidden()
  await expect(drawer.getByTestId('tree-document').filter({ hasText: 'Ziel' })).toBeVisible()
  await expect.poll(() => documentContent(seite.id)).toBe('Siehe [Ziel](Ziel.md).')
})
