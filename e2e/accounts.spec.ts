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
import { backendRequest, login, skipPasskeyStep } from './helpers'
import { BACKEND_URL, BROWSER_BACKEND_URL } from './ports'

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
    await skipPasskeyStep(page)

    await logout(page)
    await expect(page.getByLabel('Username')).toBeFocused()
    await page.getByLabel('Username').fill(user.username)
    await page.getByLabel('Password', { exact: true }).fill(user.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('button', { name: 'Use a recovery code' }).click()
    await page.getByTestId('recovery-input').locator('input').fill(codes[0]!.toUpperCase())
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await skipPasskeyStep(page)
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

    // The button, in a browser without passkey autofill: the autofill request would answer
    // first. Presence is off until the reload, so signing out does not sign in again.
    await page.addInitScript(() => {
      Object.defineProperty(PublicKeyCredential, 'isConditionalMediationAvailable', {
        value: async () => false,
      })
    })
    await authenticator.setPresence(false)
    await logout(page)
    await page.reload()
    await authenticator.setPresence(true)
    await expect(page.getByTestId('passkey-login')).toBeVisible()
    await page.getByTestId('passkey-login').click()
    await expect(page.getByTestId('section-title')).toHaveText('Wiki')
  })

  test('a passkey confirms a sensitive action', async ({ browser }, testInfo) => {
    await requireEndpoints('/account/', '/account/passkeys/', '/account/device-links/')
    const user = await createAccount(uniqueUsername('stepup', testInfo))
    const page = await devicePage(browser, testInfo)
    const authenticator = await addVirtualAuthenticator(page)
    await login(page, user)
    await accountMenu(page, 'menu-account')
    await page.getByRole('tab', { name: 'Security' }).click()
    await page.getByTestId('passkey-add').click()
    await expect(page.getByTestId('passkey-list').locator('.v-list-item')).toHaveCount(1)
    expect(await authenticator.credentialCount()).toBe(1)

    // A fresh login counts as recent for 10 minutes. A session from a device link does not, so
    // swap the browser's session for one of those.
    const paired = await page.evaluate(async (backend) => {
      const post = (path: string, body: object) =>
        fetch(backend + path, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify(body),
        })
      const created = await post('/account/device-links/', {})
      const { token } = (await created.json()) as { token: string }
      return (await post('/auth/device-link/redeem/', { token, sessionType: 'cookie' })).status
    }, BROWSER_BACKEND_URL)
    expect(paired).toBe(200)
    await page.reload()
    await page.getByRole('tab', { name: 'Devices' }).click()

    // the provider fails, as with two copies of Bitwarden's scripts in the page
    await page.evaluate(() => {
      navigator.credentials.get = () => Promise.reject(new Error('Something went wrong.'))
    })
    const dialog = page.getByTestId('reauth-dialog')
    await page.getByTestId('connect-create').click()
    await dialog.getByTestId('reauth-passkey').click()
    await expect(dialog).toContainText('reload the page')
    await expect(dialog).toContainText('confirm with your password')
    await expect(dialog.getByTestId('reauth-reload')).toBeVisible()
    await expect(dialog.getByTestId('reauth-passkey')).toHaveCount(0)

    // after the reload the passkey works, and the dialog is not needed again for 10 minutes
    await dialog.getByTestId('reauth-reload').click()
    await page.getByTestId('connect-create').click()
    const finish = page.waitForResponse((r) => r.url().includes('/auth/reauth/passkey/finish/'))
    await dialog.getByTestId('reauth-passkey').click()
    expect((await finish).status()).toBe(200)
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('connect-countdown')).toBeVisible()
  })

  test('the passkey step after an invite, and the reminder after "Later"', async ({
    browser,
  }, testInfo) => {
    await requireEndpoints('/account/', '/account/passkeys/')
    // the invite: the done page offers the passkey right away
    const invite = await backendRequest('POST', '/admin/invites/', {
      role: 'editor',
      expiresInHours: 1,
    })
    const { token } = (await invite.json()) as { token: string }
    const page = await devicePage(browser, testInfo)
    const authenticator = await addVirtualAuthenticator(page)
    await page.goto(`/invite#${token}`)
    const username = uniqueUsername('stepper', testInfo)
    const password = 'lemonade in the shade 7'
    const form = page.getByTestId('link-form')
    await expect(form.getByLabel('Username')).toBeFocused()
    await form.getByLabel('Username').fill(username)
    await form.getByLabel('New password', { exact: true }).fill(password)
    await form.getByLabel('Repeat the password').fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()
    const step = page.getByTestId('passkey-step')
    await expect(step).toContainText('Sign in with a passkey next time')
    await expect(step).toContainText('Bitwarden')
    await step.getByTestId('passkey-step-create').click()
    await confirmIfAsked(page, page.getByTestId('link-done').getByText('Passkey created'), password)
    expect(await authenticator.credentialCount()).toBe(1)

    // a second account without a passkey: "Later" after the login, then the reminder
    const other = await createAccount(uniqueUsername('later', testInfo))
    const probe = await fetch(`${BACKEND_URL}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ ...other, sessionType: 'bearer' }),
    })
    const { user } = (await probe.json()) as { user: { passkeyCount?: number } }
    test.skip(user.passkeyCount === undefined, 'the backend does not send passkeyCount yet')

    const laptop = await devicePage(browser, testInfo)
    await laptop.goto('/login')
    await expect(laptop.getByLabel('Username')).toBeFocused()
    await laptop.getByLabel('Username').fill(other.username)
    await laptop.getByLabel('Password', { exact: true }).fill(other.password)
    await laptop.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(laptop).toHaveURL(/\/welcome\?passkey=1/)
    await skipPasskeyStep(laptop)
    await accountMenu(laptop, 'menu-account')
    await expect(laptop.getByRole('heading', { name: 'Account' })).toBeVisible()
    await expect(laptop.getByTestId('passkey-reminder')).toHaveCount(0)

    // a few days later
    await laptop.evaluate((name) => {
      localStorage.setItem(
        'mkdocseditor.passkeyReminder',
        JSON.stringify({ [name.toLowerCase()]: '2000-01-01T00:00:00Z' }),
      )
    }, other.username)
    await laptop.reload()
    await expect(laptop.getByTestId('passkey-reminder')).toBeVisible()
    await laptop
      .getByTestId('passkey-reminder')
      .getByRole('button', { name: 'Remind me later' })
      .click()
    await expect(laptop.getByTestId('passkey-reminder')).toHaveCount(0)
    await laptop.reload()
    await expect(laptop.getByRole('heading', { name: 'Account' })).toBeVisible()
    await expect(laptop.getByTestId('passkey-reminder')).toHaveCount(0)
  })

  test('a connect link for the Android app', async ({ browser }, testInfo) => {
    await requireEndpoints('/account/device-links/')
    const user = await createAccount(uniqueUsername('android', testInfo))
    const page = await devicePage(browser, testInfo, user)
    await accountMenu(page, 'menu-account')
    await page.getByRole('tab', { name: 'Devices' }).click()
    const card = page.getByTestId('connect-app')
    await expect(card.getByRole('link', { name: 'Obtainium' })).toHaveAttribute(
      'href',
      'https://apps.obtainium.imranr.dev/redirect?r=obtainium://add/https://github.com/MkDocsEditor/MkDocsEditor-Android',
    )
    await card.getByTestId('connect-create').click()
    await confirmIfAsked(page, card.getByTestId('qr-code'), user.password)
    await expect(card.getByTestId('connect-countdown')).toContainText(/Valid for [45]:\d\d/)
    const connectUrl = await card.getByTestId('connect-open').getAttribute('href')
    expect(connectUrl).toMatch(/^http:\/\/localhost:4174\/connect#[A-Za-z0-9_-]+$/)

    // the page the link opens when the app is not installed: no request carries the payload
    const fragment = connectUrl!.split('#')[1]!
    const phone = await devicePage(browser, testInfo)
    const requests: string[] = []
    phone.on('request', (request) => requests.push(request.url()))
    await phone.goto(connectUrl!)
    await expect(phone.getByTestId('connect-info')).toContainText(user.username)
    await expect(phone.getByTestId('connect-open-app')).toHaveAttribute(
      'href',
      `mkdocseditor://connect#${fragment}`,
    )
    await expect(phone.getByTestId('connect-install')).toContainText('Obtainium')
    expect(requests.some((url) => url.includes(fragment))).toBe(false)

    // the app redeems it; the account page shows the device
    const payload = JSON.parse(Buffer.from(fragment, 'base64url').toString('utf8')) as {
      token: string
      username: string
    }
    const redeemed = await fetch(`${BACKEND_URL}/auth/device-link/redeem/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        token: payload.token,
        username: payload.username,
        deviceName: 'Pixel 8',
      }),
    })
    expect(redeemed.ok, await redeemed.clone().text()).toBe(true)
    await expect(card.getByTestId('connect-done')).toContainText('Pixel 8')
  })

  test('on a phone, the first login offers the Android app', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone-sized screens only')
    await requireEndpoints('/account/device-links/')
    const user = await createAccount(uniqueUsername('mobile', testInfo))
    const page = await devicePage(browser, testInfo)
    await page.goto('/login')
    await expect(page.getByLabel('Username')).toBeFocused()
    await page.getByLabel('Username').fill(user.username)
    await page.getByLabel('Password', { exact: true }).fill(user.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    const hint = page.getByTestId('android-hint')
    await expect(hint).toContainText('Use the Android app')
    // the passkey step comes first on the same page; put it off
    await page.getByTestId('passkey-step-later').click()
    await hint.getByTestId('android-hint-open').click()
    // without the app, the link opens the connect page on this phone
    await expect(page).toHaveURL(/\/connect#[A-Za-z0-9_-]+$/)
    await expect(page.getByTestId('connect-info')).toContainText(user.username)
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
