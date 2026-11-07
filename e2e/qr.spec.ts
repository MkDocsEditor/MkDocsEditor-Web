import { expect, test } from '@playwright/test'

import { backendRequest, createDocument, editorText, login, openEditor, testName } from './helpers'
import { BACKEND_URL } from './ports'

async function hasQrCodes(): Promise<boolean> {
  const info = (await (await fetch(`${BACKEND_URL}/server-info/`)).json()) as {
    features?: string[]
  }
  return info.features?.includes('qr-codes') === true
}

test('a QR code opens its page, also after a rename, and can move to another page', async ({
  page,
}, testInfo) => {
  test.skip(!(await hasQrCodes()), 'the backend has no QR codes')
  const name = testName('Waschmaschine', testInfo)
  const key = name.toLowerCase().replace(/\s+/g, '-')
  const id = await createDocument(name)
  const other = await createDocument(testName('Trockner', testInfo))
  await login(page)
  await openEditor(page, id)

  // add the code on the page: the key is suggested from its name
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByTestId('open-qr').click()
  const dialog = page.getByTestId('page-qr-dialog')
  await expect(dialog.getByTestId('page-qr-key').locator('input')).toHaveValue(key)
  await dialog.getByTestId('page-qr-label').locator('input').fill('Keller')
  await dialog.getByTestId('page-qr-add').click()
  await expect(dialog.getByTestId('page-qr-code')).toHaveCount(1)
  await expect(dialog.getByTestId('qr-code')).toBeVisible()
  await expect.poll(() => editorText(page)).toContain(`qr:\n  - key: ${key}\n    label: "Keller"`)
  await expect(page.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')
  await page.keyboard.press('Escape')

  // a scan opens the page, also once it is renamed
  const renamed = `${name} neu`
  const rename = await backendRequest('PUT', `/document/${id}/`, { name: renamed })
  expect(rename.ok).toBe(true)
  await page.goto(`/q/${key}`)
  await expect(page.getByTestId('document-title')).toHaveText(renamed)
  const current = page.url()

  // the list has the code, scanned just now; the sheet prints it
  await page.goto('/qr-codes')
  const row = page.getByTestId('qr-code-row').filter({ hasText: key })
  await expect(row).toContainText('Keller')
  await expect(row).toContainText('Scanned')
  await row.getByRole('checkbox').check()
  await page.getByTestId('qr-print-selected').click()
  await expect(page.getByTestId('qr-sticker')).toHaveCount(1)
  await expect(page.getByTestId('qr-sticker')).toContainText('Keller')

  // deleting the page warns about the sticker
  await page.goto(current)
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByTestId('item-delete').click()
  await expect(page.getByRole('dialog')).toContainText(`QR code “${key}”`)
  await page.getByTestId('confirm-button').click()
  await expect(page.getByText(`Deleted “${renamed}”`)).toBeVisible()

  // a scan now says so, and puts the code on another page
  await page.goto(`/q/${key}`)
  await expect(page.getByTestId('qr-open-message')).toContainText('No page has this code any more')
  await page.getByTestId('qr-open-page').locator('input').fill(testName('Trockner', testInfo))
  await page.getByRole('option', { name: testName('Trockner', testInfo) }).click()
  await page.getByTestId('qr-open-assign').click()
  await expect(page).toHaveURL(new RegExp(`/document/${other}$`))
  await expect(dialog.getByTestId('page-qr-key').locator('input')).toHaveValue(key)
  await dialog.getByTestId('page-qr-add').click()
  await expect(page.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')
  await page.keyboard.press('Escape')
  await expect(async () => {
    await page.goto(`/q/${key}`)
    await expect(page).toHaveURL(new RegExp(`/document/${other}$`), { timeout: 2000 })
  }).toPass({ timeout: 20_000 })
})

test('an unknown QR code says that no page has it', async ({ page }) => {
  test.skip(!(await hasQrCodes()), 'the backend has no QR codes')
  await login(page)
  await page.goto('/q/gibt-es-nicht')
  await expect(page.getByTestId('qr-open-message')).toHaveText('No page has this code yet.')
})
