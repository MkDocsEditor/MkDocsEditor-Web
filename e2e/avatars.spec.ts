import { expect, test } from '@playwright/test'

import { createDocument, openEditor, userPage } from './helpers'
import { BACKEND_URL, USERS } from './ports'

/** A red pixel. The server crops and scales it to its 256 × 256 JPEG. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.beforeEach(async () => {
  const info = (await (await fetch(`${BACKEND_URL}/server-info/`)).json()) as {
    features?: string[]
  }
  test.skip(!info.features?.includes('avatars'), 'the backend has no avatars')
})

test('a profile picture shows wherever its user does', async ({ browser }, testInfo) => {
  const bob = await userPage(browser, USERS.bob)
  await bob.goto('/account/profile')
  const card = bob.getByTestId('avatar-card')
  await expect(card.getByTestId('avatar-upload')).toHaveText('Upload picture')
  await card
    .getByTestId('avatar-input')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PIXEL })
  await expect(card.getByTestId('avatar-image')).toBeVisible()
  await expect(card.getByTestId('avatar-upload')).toHaveText('Replace')

  // the own account button and its menu, also after a reload
  await bob.reload()
  await expect(bob.getByTestId('account-menu').getByTestId('avatar-image')).toBeVisible()
  await bob.getByTestId('account-menu').click()
  await expect(bob.getByTestId('menu-avatar').getByTestId('avatar-image')).toBeVisible()
  await bob.keyboard.press('Escape')

  // in the editor of someone else: the online list and the cursor flag
  const id = await createDocument(`Avatar ${testInfo.project.name} ${testInfo.retry}`)
  await openEditor(bob, id)
  await bob.locator('.cm-content').click()
  const alice = await userPage(browser, USERS.alice)
  await openEditor(alice, id)
  await expect(alice.getByTestId('online-user').getByTestId('avatar-image')).toBeVisible()
  await expect(alice.locator('.cm-remote-caret-label .cm-remote-caret-avatar')).toBeVisible()

  // removed, the initials are back
  await bob.goto('/account/profile')
  await card.getByTestId('avatar-remove').click()
  await expect(card.getByTestId('avatar-image')).toBeHidden()
  await expect(card.getByTestId('avatar-upload')).toHaveText('Upload picture')
  await expect(bob.getByTestId('account-menu').getByTestId('avatar-image')).toBeHidden()
})
