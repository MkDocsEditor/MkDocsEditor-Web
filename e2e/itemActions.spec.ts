import { expect, test } from '@playwright/test'

import { backendRequest, login, testName } from './helpers'

type Item = { id: string; name: string }

async function create(kind: 'section' | 'document', parent: string, name: string): Promise<Item> {
  const response = await backendRequest('POST', `/${kind}/`, { parent, name })
  expect(response.ok).toBe(true)
  return (await response.json()) as Item
}

async function folderWithPage(base: string) {
  const root = (await (await backendRequest('GET', '/section/')).json()) as Item
  const folder = await create('section', root.id, base)
  const page = await create('document', folder.id, 'Seite')
  return { folder, page }
}

test('the open folder and the open page have their own actions', async ({ page }, testInfo) => {
  const base = testName('Aktionen', testInfo)
  const { folder, page: doc } = await folderWithPage(base)
  await login(page)

  // the folder renames itself from its header, and the view follows the new id
  await page.goto(`/section/${folder.id}`)
  await expect(page.getByTestId('section-title')).toHaveText(base)
  await page
    .locator('header')
    .getByRole('button', { name: `Actions for ${base}` })
    .click()
  await page.getByTestId('item-rename').click()
  const dialog = page.getByTestId('move-dialog')
  await dialog.getByTestId('move-name').locator('input').fill(`${base} neu`)
  await expect(dialog.getByTestId('move-new-path')).toHaveText(`${base} neu`)
  await dialog.getByTestId('move-apply').click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('section-title')).toHaveText(`${base} neu`)
  await expect(page).not.toHaveURL(new RegExp(`/section/${folder.id}$`))
  const folderUrl = page.url()

  // the page deletes itself from its menu and leaves for its folder
  await page.locator('main').getByText('Seite', { exact: true }).click()
  await expect(page.getByTestId('document-title')).toHaveText('Seite')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByTestId('item-delete').click()
  await expect(page.getByRole('dialog')).toContainText('Delete page?')
  await page.getByTestId('confirm-button').click()
  await expect(page.getByText('Deleted “Seite”')).toBeVisible()
  await expect(page).toHaveURL(folderUrl)
  await expect(page.locator('main').getByText('Seite', { exact: true })).toHaveCount(0)
  expect(doc.id).not.toBe('')
})

test('a right click in the tree opens the actions of an entry', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'the tree is a drawer there, without a mouse')
  const base = testName('Baum', testInfo)
  await folderWithPage(base)
  await login(page)

  const row = page.getByTestId('tree-section').filter({ hasText: base })
  await row.click({ button: 'right' })
  await page.getByTestId('item-delete').click()
  await expect(page.getByRole('dialog')).toContainText('Delete folder?')
  await expect(page.getByRole('dialog')).toContainText('with everything in it')
  await page.getByTestId('confirm-button').click()
  await expect(row).toHaveCount(0)
})
