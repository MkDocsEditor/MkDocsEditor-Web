import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import { E2E_USER } from './ports'

export async function login(page: Page, user = E2E_USER): Promise<void> {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('Benutzername').fill(user.username)
  await page.getByLabel('Passwort', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByTestId('section-title')).toHaveText('Wiki')
}
