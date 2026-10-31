import { expect, test } from '@playwright/test'
import type { Browser, Locator, Page, TestInfo } from '@playwright/test'

import { backendRequest, login } from './helpers'
import type { User } from './helpers'
import { BACKEND_URL, E2E_USER } from './ports'

/** A username that is unique per browser project, attempt and repetition. */
export function uniqueUsername(base: string, testInfo: TestInfo): string {
  const attempt = testInfo.retry * 100 + testInfo.repeatEachIndex
  return `${base}-${testInfo.project.name}${attempt > 0 ? `-${attempt}` : ''}`
}

/**
 * Creates an account over REST like an invited user would: the admin creates an invite, the
 * new user redeems it with a password.
 */
export async function createAccount(
  username: string,
  role: 'admin' | 'editor' | 'reader' = 'editor',
  password = 'tea with lemon and honey 42',
): Promise<User> {
  const invite = await backendRequest('POST', '/admin/invites/', { role, expiresInHours: 1 })
  expect(invite.ok, await invite.clone().text()).toBe(true)
  const { token } = (await invite.json()) as { token: string }
  const redeemed = await fetch(`${BACKEND_URL}/auth/link/redeem/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ token, username, password, sessionType: 'bearer' }),
  })
  expect(redeemed.ok, await redeemed.clone().text()).toBe(true)
  return { username, password }
}

/** A fresh browser context (another device) with the given user signed in. */
export async function devicePage(browser: Browser, testInfo: TestInfo, user?: User): Promise<Page> {
  const context = await browser.newContext(testInfo.project.use)
  const page = await context.newPage()
  if (user) await login(page, user)
  return page
}

/** Opens the account menu in the app bar and picks an entry. */
export async function accountMenu(
  page: Page,
  entry: 'menu-account' | 'menu-admin' | 'menu-logout',
) {
  await page.getByTestId('account-menu').click()
  await page.getByTestId(entry).click()
}

export async function logout(page: Page): Promise<void> {
  await accountMenu(page, 'menu-logout')
  await expect(page).toHaveURL(/\/login/)
}

/** The value of a read-only field with a copy button (links, secrets). */
export function fieldValue(page: Page | Locator, testId: string): Promise<string> {
  return page.getByTestId(testId).locator('input').inputValue()
}

/**
 * Confirms the step-up dialog when it appears. A fresh login counts as recent authentication,
 * so the dialog often does not come; `done` is what the action shows when it went through.
 */
export async function confirmIfAsked(
  page: Page,
  done: Locator,
  password: string,
  code?: () => string,
): Promise<void> {
  const dialog = page.getByTestId('reauth-dialog')
  await expect(dialog.or(done).first()).toBeVisible()
  if (await dialog.isVisible()) {
    await dialog.getByLabel('Password', { exact: true }).fill(password)
    if (code) await dialog.getByLabel('Code from the app').fill(code())
    await page.getByTestId('reauth-confirm').click()
  }
  await expect(done).toBeVisible()
}

export const ADMIN = E2E_USER

/**
 * Skips the test while the backend on master does not have the endpoints it needs yet (the
 * account system lands there in steps). Once the endpoint answers, the test runs by itself.
 */
export async function requireEndpoints(...paths: string[]): Promise<void> {
  for (const path of paths) {
    const response = await backendRequest('GET', path)
    test.skip(response.status === 404, `the backend does not have GET ${path} yet`)
  }
}
