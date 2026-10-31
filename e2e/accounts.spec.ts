import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import {
  ADMIN,
  accountMenu,
  confirmIfAsked,
  createAccount,
  devicePage,
  fieldValue,
  logout,
  requireEndpoints,
  uniqueUsername,
} from './accounts'
import { addVirtualAuthenticator, totp } from './authenticators'
import { backendBinary, createWiki, startBackend, TMP, waitForLog, writeConfig } from './backend'
import { login } from './helpers'
import { BACKEND_URL } from './ports'

test.describe('accounts', () => {
  test('the setup link creates the first admin', async ({ browser }, testInfo) => {
    const port = 17440 + (testInfo.project.name === 'phone' ? 1 : 0)
    const workDir = path.join(TMP, `setup-${testInfo.project.name}`)
    rmSync(workDir, { recursive: true, force: true })
    mkdirSync(workDir, { recursive: true })
    const wiki = path.join(workDir, 'wiki')
    createWiki(wiki)
    const bin = backendBinary()
    const config = writeConfig(bin, workDir, wiki, port, { users: false })
    const backend = await startBackend(bin, config, workDir, port)
    try {
      const token = await waitForLog(backend, /setup token: (mdl_\S+)/)
      const link = await waitForLog(backend, /setup link: (\S+)/)
      expect(link).toBe(`${testInfo.project.use.baseURL}/setup#${token}`)

      const context = await browser.newContext(testInfo.project.use)
      await context.route('**/config.json', (route) =>
        route.fulfill({ json: { backendUrl: `http://localhost:${port}`, wikiUrl: '' } }),
      )
      const page = await context.newPage()
      // without a token, the app explains where to find the setup link
      await page.goto('/')
      await expect(page).toHaveURL(/\/setup/)
      await expect(page.getByTestId('token-form')).toContainText('mkdocsrest setup-link')

      await page.goto(`/setup#${token}`)
      await expect(page.getByTestId('link-info')).toContainText('Admin')
      // the token does not stay in the address bar
      await expect(page).toHaveURL(/\/setup$/)
      const form = page.getByTestId('link-form')
      await expect(form.getByLabel('Username')).toHaveAttribute('autocomplete', 'username')
      await expect(form.getByLabel('New password', { exact: true })).toHaveAttribute(
        'autocomplete',
        'new-password',
      )
      await expect(form.getByLabel('Repeat the password')).toHaveAttribute(
        'autocomplete',
        'new-password',
      )
      // Vuetify autofocuses the first field when it scrolls into view; wait, or typing can land there
      await expect(form.getByLabel('Username')).toBeFocused()
      await form.getByLabel('Username').fill('markus')
      await form.getByLabel('Display name').fill('Markus')
      await form.getByLabel('New password', { exact: true }).fill('Zugspitze in the fog 2962')
      await form.getByLabel('Repeat the password').fill('Zugspitze in the fog 2962')
      await page.getByRole('button', { name: 'Create account' }).click()
      await expect(page.getByTestId('link-done')).toContainText('Welcome, Markus')
      await page.getByTestId('done-continue').click()
      await expect(page.getByTestId('section-title')).toHaveText('Wiki')

      const status = (await (await fetch(`http://127.0.0.1:${port}/auth/status/`)).json()) as {
        setupRequired: boolean
      }
      expect(status.setupRequired).toBe(false)
      // the link works only once
      const reuse = await context.newPage()
      await reuse.goto(`/setup#${token}`)
      await expect(reuse.getByTestId('link-error')).toContainText('invalid')
      await context.close()
    } finally {
      await backend.stop()
    }
  })

  test('an invite link creates an account with the chosen role', async ({ browser }, testInfo) => {
    const admin = await devicePage(browser, testInfo, ADMIN)
    await accountMenu(admin, 'menu-admin')
    await admin.getByRole('tab', { name: 'Invites' }).click()
    const note = `Invite ${testInfo.project.name} ${testInfo.retry}`
    await admin.getByTestId('invite-role').click()
    await admin.getByRole('option', { name: 'Reader' }).click()
    await admin.getByTestId('invite-note').locator('input').fill(note)
    await admin.getByTestId('invite-submit').click()
    const result = admin.getByTestId('link-result')
    await expect(result.getByTestId('qr-code')).toBeVisible()
    const url = await fieldValue(result, 'link-url')
    expect(url).toMatch(/\/invite#mdl_/)
    await result.getByRole('button', { name: 'Done' }).click()
    await expect(admin.getByTestId('invite-list')).toContainText(note)

    const guest = await devicePage(browser, testInfo)
    await guest.goto(url)
    await expect(guest.getByTestId('link-info')).toContainText('Reader')
    await expect(guest.getByTestId('link-info')).toContainText(note)
    const username = uniqueUsername('guest', testInfo)
    const form = guest.getByTestId('link-form')
    await expect(form.getByLabel('Username')).toBeFocused()
    await form.getByLabel('Username').fill(username)
    await form.getByLabel('Display name').fill('Guest')
    await form.getByLabel('New password', { exact: true }).fill('a guest with a hat 7')
    await form.getByLabel('Repeat the password').fill('a guest with a hat 7')
    await guest.getByRole('button', { name: 'Create account' }).click()
    await guest.getByTestId('done-continue').click()
    await expect(guest.getByTestId('section-title')).toHaveText('Wiki')
    await guest.getByTestId('account-menu').click()
    await expect(guest.getByText('signed in (Reader)')).toBeVisible()

    // the invite is used up
    await admin.reload()
    await expect(admin.getByTestId('invite-list')).not.toContainText(note)
  })

  test('password with TOTP, then a recovery code', async ({ browser }, testInfo) => {
    await requireEndpoints('/account/')
    const user = await createAccount(uniqueUsername('totp', testInfo))
    const page = await devicePage(browser, testInfo, user)
    await accountMenu(page, 'menu-account')
    await page.getByRole('tab', { name: 'Security' }).click()
    await page.getByTestId('totp-enroll').click()
    const secretField = page.getByTestId('totp-secret')
    await confirmIfAsked(page, secretField, user.password)
    await expect(page.getByTestId('qr-code')).toBeVisible()
    expect(await fieldValue(page, 'totp-uri')).toMatch(/^otpauth:\/\/totp\//)
    const secret = (await fieldValue(page, 'totp-secret')).replace(/\s/g, '')
    const code = page.getByTestId('totp-confirm-code').locator('input')
    await expect(code).toHaveAttribute('autocomplete', 'one-time-code')
    await expect(code).toHaveAttribute('inputmode', 'numeric')
    // pasted with a space, like many apps show it
    const now = totp(secret)
    await code.fill(`${now.slice(0, 3)} ${now.slice(3)}`)
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    const codes = (await page.getByTestId('recovery-codes').locator('li').allInnerTexts()).map(
      (c) => c.trim(),
    )
    expect(codes).toHaveLength(10)
    await page.getByRole('button', { name: 'I have saved them' }).click()
    await expect(page.getByTestId('totp-status')).toHaveText('on')

    await logout(page)
    await expect(page.getByLabel('Username')).toBeFocused()
    await page.getByLabel('Username').fill(user.username)
    await page.getByLabel('Password', { exact: true }).fill(user.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    const otp = page.getByTestId('totp-input').locator('input')
    await expect(otp).toHaveAttribute('autocomplete', 'one-time-code')
    await otp.fill('000000')
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(page.getByTestId('login-error')).toContainText('Wrong code')
    // the next time step: the current one was used for the enrollment
    await otp.fill(totp(secret, Date.now() + 30_000))
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(page.getByTestId('section-title')).toHaveText('Wiki')

    await logout(page)
    await expect(page.getByLabel('Username')).toBeFocused()
    await page.getByLabel('Username').fill(user.username)
    await page.getByLabel('Password', { exact: true }).fill(user.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('button', { name: 'Use a recovery code' }).click()
    await page.getByTestId('recovery-input').locator('input').fill(codes[0]!.toUpperCase())
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(page.getByTestId('section-title')).toHaveText('Wiki')
    await accountMenu(page, 'menu-account')
    await page.getByRole('tab', { name: 'Security' }).click()
    await expect(page.getByTestId('recovery-left')).toContainText('9 of 10')
  })

  test('a passkey signs in without a password', async ({ browser }, testInfo) => {
    await requireEndpoints('/account/', '/account/passkeys/')
    const user = await createAccount(uniqueUsername('passkey', testInfo))
    const page = await devicePage(browser, testInfo)
    const authenticator = await addVirtualAuthenticator(page)
    await page.goto('/login')
    await expect(page.getByLabel('Username')).toHaveAttribute('autocomplete', 'username webauthn')
    await login(page, user)
    await accountMenu(page, 'menu-account')
    await page.getByRole('tab', { name: 'Security' }).click()
    await page.getByTestId('passkey-add').click()
    const list = page.getByTestId('passkey-list')
    await confirmIfAsked(page, list, user.password)
    await expect(list.locator('.v-list-item')).toHaveCount(1)
    expect(await authenticator.credentialCount()).toBe(1)

    // The login page offers the passkey in the username autofill (conditional mediation). The
    // virtual authenticator answers that request on its own, like picking it from the list.
    // Signing out lands on the login page, which signs in again right away.
    await accountMenu(page, 'menu-logout')
    await expect(page.getByTestId('section-title')).toHaveText('Wiki')

    // The button: the autofill request waits while nobody touches the authenticator.
    await authenticator.setPresence(false)
    await logout(page)
    await page.getByTestId('passkey-login').click()
    await authenticator.setPresence(true)
    await expect(page.getByTestId('section-title')).toHaveText('Wiki')
  })

  test('a reset link sets a new password and signs out the old sessions', async ({
    browser,
  }, testInfo) => {
    await requireEndpoints('/admin/users/')
    const user = await createAccount(uniqueUsername('forgetful', testInfo))
    const oldDevice = await devicePage(browser, testInfo, user)

    const admin = await devicePage(browser, testInfo, ADMIN)
    await accountMenu(admin, 'menu-admin')
    const row = admin.getByTestId(`user-${user.username}`)
    // A click that lands while the menu is still opening does nothing, so try again.
    await expect(async () => {
      if (!(await admin.getByTestId('user-reset').isVisible())) {
        await row.getByTestId('user-actions').click()
      }
      await admin.getByTestId('user-reset').click()
      await expect(admin.getByTestId('reset-create')).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 15_000 })
    await admin.getByTestId('reset-create').click()
    const result = admin.getByTestId('link-result')
    await confirmIfAsked(admin, result, ADMIN.password)
    const url = await fieldValue(result, 'link-url')
    expect(url).toMatch(/\/reset#mdl_/)

    const newDevice = await devicePage(browser, testInfo)
    await newDevice.goto(url)
    await expect(newDevice.getByTestId('link-info')).toContainText(user.username)
    const form = newDevice.getByTestId('link-form')
    // a hidden username, so password managers update the right entry
    await expect(form.locator('input[name="username"]')).toHaveValue(user.username)
    await expect(form.getByLabel('New password', { exact: true })).toBeFocused()
    await form.getByLabel('New password', { exact: true }).fill('a brand new password')
    await form.getByLabel('Repeat the password').fill('a brand new password')
    await newDevice.getByRole('button', { name: 'Set password' }).click()
    await expect(newDevice.getByTestId('link-done')).toContainText('New password set')
    await newDevice.getByTestId('done-continue').click()
    await expect(newDevice.getByTestId('section-title')).toHaveText('Wiki')

    await oldDevice.reload()
    await expect(oldDevice).toHaveURL(/\/login/)
    const oldPassword = await fetch(`${BACKEND_URL}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ username: user.username, password: user.password }),
    })
    expect(oldPassword.status).toBe(401)
  })

  test('an admin changes a role', async ({ browser }, testInfo) => {
    await requireEndpoints('/admin/users/')
    const user = await createAccount(uniqueUsername('demoted', testInfo), 'editor')
    const userPage = await devicePage(browser, testInfo, user)
    const admin = await devicePage(browser, testInfo, ADMIN)
    await accountMenu(admin, 'menu-admin')
    const row = admin.getByTestId(`user-${user.username}`)
    await row.getByTestId('user-role').click()
    await admin.getByRole('option', { name: 'Reader' }).click()
    await confirmIfAsked(
      admin,
      admin
        .getByText(`${user.username} is now Reader`)
        .or(admin.getByText('is now Reader'))
        .first(),
      ADMIN.password,
    )

    await userPage.reload()
    await userPage.getByTestId('account-menu').click()
    await expect(userPage.getByText('signed in (Reader)')).toBeVisible()
  })

  test('signing out the other devices ends their sessions', async ({ browser }, testInfo) => {
    const user = await createAccount(uniqueUsername('twodevices', testInfo))
    const phone = await devicePage(browser, testInfo, user)
    const laptop = await devicePage(browser, testInfo, user)
    await accountMenu(laptop, 'menu-account')
    await laptop.getByRole('tab', { name: 'Devices' }).click()
    await expect(laptop.getByTestId('session-current')).toBeVisible()
    await expect(laptop.getByTestId('session-other')).toHaveCount(2) // the phone and the REST session
    await laptop.getByTestId('revoke-others').click()
    await laptop.getByTestId('confirm-button').click()
    await expect(laptop.getByTestId('session-other')).toHaveCount(0)

    await phone.reload()
    await expect(phone).toHaveURL(/\/login/)
    await laptop.reload()
    await expect(laptop.getByTestId('sessions-card')).toBeVisible()
  })

  test('the password change form works with password managers', async ({ browser }, testInfo) => {
    await requireEndpoints('/account/')
    const user = await createAccount(uniqueUsername('newpw', testInfo))
    const page = await devicePage(browser, testInfo, user)
    await accountMenu(page, 'menu-account')
    await page.getByRole('tab', { name: 'Security' }).click()
    const form = page.getByTestId('password-form')
    await expect(form.locator('input[name="username"]')).toHaveAttribute('autocomplete', 'username')
    await expect(form.locator('input[name="username"]')).toHaveValue(user.username)
    await expect(form.getByLabel('Current password')).toHaveAttribute(
      'autocomplete',
      'current-password',
    )
    await expect(form.getByLabel('New password', { exact: true })).toHaveAttribute(
      'autocomplete',
      'new-password',
    )
    await form.getByLabel('Current password').fill(user.password)
    await form.getByLabel('New password', { exact: true }).fill('Coffee with milk and sugar')
    await form.getByLabel('Repeat the new password').fill('Coffee with milk and sugar')
    await page.getByRole('button', { name: 'Save password' }).click()
    await expect(page.getByText('Password changed')).toBeVisible()
    await logout(page)
    await login(page, { username: user.username, password: 'Coffee with milk and sugar' })
  })
})

test('too many attempts are slowed down with a clear message', async ({ browser }, testInfo) => {
  const port = 17442 + (testInfo.project.name === 'phone' ? 1 : 0)
  const workDir = path.join(TMP, `ratelimit-${testInfo.project.name}`)
  rmSync(workDir, { recursive: true, force: true })
  mkdirSync(workDir, { recursive: true })
  const wiki = path.join(workDir, 'wiki')
  createWiki(wiki)
  const bin = backendBinary()
  const config = writeConfig(bin, workDir, wiki, port, { perIpBurst: 2 })
  const backend = await startBackend(bin, config, workDir, port)
  try {
    const context = await browser.newContext(testInfo.project.use)
    await context.route('**/config.json', (route) =>
      route.fulfill({ json: { backendUrl: `http://localhost:${port}`, wikiUrl: '' } }),
    )
    const page = await context.newPage()
    await page.goto('/login')
    await expect(page.getByLabel('Username')).toBeFocused()
    await page.getByLabel('Username').fill('alice')
    const password = page.getByLabel('Password', { exact: true })
    const error = page.getByTestId('login-error')
    for (let attempt = 0; attempt < 5; attempt++) {
      await password.fill(`wrong ${attempt}`)
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('/auth/login/')),
        page.getByRole('button', { name: 'Sign in', exact: true }).click(),
      ])
      await expect(error).toBeVisible()
      if ((await error.innerText()).includes('Too many attempts')) break
    }
    await expect(error).toContainText(/Too many attempts\. Please wait \d+ (seconds?|minutes?)/)
    await context.close()
  } finally {
    await backend.stop()
  }
})
