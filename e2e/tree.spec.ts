import { expect, test } from '@playwright/test'

import { login, testName } from './helpers'

test('rejects a wrong password', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Benutzername').fill('anna')
  await page.getByLabel('Passwort', { exact: true }).fill('falsch')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByTestId('login-error')).toContainText('stimmt nicht')
})

test('logs in, loads the tree and opens a page', async ({ page }) => {
  await login(page)
  const main = page.locator('main')
  await expect(main.getByText('Rezepte')).toBeVisible()
  await expect(main.getByText('Urlaub')).toBeVisible()

  await main.getByText('Rezepte').click()
  await expect(page.getByTestId('section-title')).toHaveText('Rezepte')
  await main.getByText('Kuchen').click()
  await main.getByText('Apfelkuchen').click()
  await expect(page.getByTestId('document-title')).toHaveText('Apfelkuchen')
  await expect(page.getByTestId('markdown-preview')).toContainText('Äpfel schälen')

  // a reload keeps the session and the route
  await page.reload()
  await expect(page.getByTestId('document-title')).toHaveText('Apfelkuchen')
})

test('creates, renames and deletes a folder', async ({ page }, testInfo) => {
  await login(page)
  const name = testName('Ordner', testInfo)
  await page.getByTestId('create-fab').click()
  await page.getByTestId('create-section').click()
  await page.getByTestId('name-input').locator('input').fill(name)
  await page.getByTestId('name-confirm').click()
  const main = page.locator('main')
  await expect(main.getByText(name, { exact: true })).toBeVisible()

  await page.getByRole('button', { name: `Aktionen für ${name}` }).click()
  await page.getByText('Umbenennen').click()
  await page.getByTestId('name-input').locator('input').fill(`${name} neu`)
  await page.getByTestId('name-confirm').click()
  await expect(main.getByText(`${name} neu`, { exact: true })).toBeVisible()

  await page.getByRole('button', { name: `Aktionen für ${name} neu` }).click()
  await page.getByText('Löschen').click()
  await page.getByTestId('confirm-button').click()
  await expect(main.getByText(`${name} neu`, { exact: true })).toHaveCount(0)
})

test('finds pages with the search', async ({ page }) => {
  await login(page)
  await page.getByTestId('search-button').click()
  await page.getByTestId('search-input').locator('input').fill('kurbis')
  await page.getByText('Kürbissuppe').click()
  await expect(page.getByTestId('document-title')).toHaveText('Kürbissuppe')
})

test('renders the preview like the wiki, with images and links', async ({ page }) => {
  await login(page)
  await page.getByTestId('search-button').click()
  await page.getByTestId('search-input').locator('input').fill('apfelkuchen')
  await page.keyboard.press('Enter')
  const preview = page.getByTestId('markdown-preview')
  await expect(preview.locator('.admonition.tip .admonition-title')).toHaveText('Tipp')
  await expect(preview.locator('input[type=checkbox]')).toHaveCount(2)
  // the image is a resource that needs auth: it is loaded as a blob
  const image = preview.locator('img[alt="Foto"]')
  await expect(image).toHaveAttribute('src', /^blob:/)
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  // links to other pages stay in the app
  await preview.getByRole('link', { name: 'Kürbissuppe' }).click()
  await expect(page.getByTestId('document-title')).toHaveText('Kürbissuppe')
})
