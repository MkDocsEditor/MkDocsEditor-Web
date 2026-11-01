import { expect, test } from '@playwright/test'

import {
  backendRequest,
  documentContent,
  editorText,
  login,
  openEditor,
  testName,
  typeAt,
} from './helpers'

type Item = { id: string; name: string }

async function create(kind: 'section' | 'document', name: string, parent?: string): Promise<Item> {
  const root = (await (await backendRequest('GET', '/section/')).json()) as Item
  const response = await backendRequest('POST', `/${kind}/`, { parent: parent ?? root.id, name })
  expect(response.ok).toBe(true)
  return (await response.json()) as Item
}

async function rename(kind: 'section' | 'document', id: string, name: string): Promise<Item> {
  const response = await backendRequest('PUT', `/${kind}/${id}/`, { name })
  expect(response.ok).toBe(true)
  return (await response.json()) as Item
}

test('an open page follows a rename made while it was offline', async ({
  page,
  context,
}, testInfo) => {
  const folder = await create('section', testName('Umbenannt', testInfo))
  const doc = await create('document', 'Alt', folder.id)
  await login(page)
  await openEditor(page, doc.id)
  await typeAt(page, 'end', 'Start.')
  await expect.poll(() => documentContent(doc.id)).toBe('Start.')

  await context.setOffline(true)
  await expect(page.getByTestId('connection-state')).toHaveAttribute('title', /Offline/, {
    timeout: 20_000,
  })
  await typeAt(page, 'end', ' Offline.')
  const renamed = await rename('document', doc.id, 'Neu')
  expect(renamed.id).not.toBe(doc.id)
  await context.setOffline(false)

  await expect(page).toHaveURL(new RegExp(`/document/${renamed.id}$`), { timeout: 30_000 })
  await expect(page.getByTestId('connection-state')).toHaveAttribute('title', 'Saved', {
    timeout: 20_000,
  })
  await expect.poll(() => documentContent(renamed.id)).toBe('Start. Offline.')
  expect(await editorText(page)).toBe('Start. Offline.')
})

test('offline edits of a closed page reach it after it moved', async ({
  page,
  context,
}, testInfo) => {
  const folder = await create('section', testName('Später', testInfo))
  const doc = await create('document', 'Alt', folder.id)
  await login(page)
  await openEditor(page, doc.id)
  await typeAt(page, 'end', 'Start.')
  await expect.poll(() => documentContent(doc.id)).toBe('Start.')
  await context.setOffline(true)
  await expect(page.getByTestId('connection-state')).toHaveAttribute('title', /Offline/, {
    timeout: 20_000,
  })
  await typeAt(page, 'end', ' Offline.')
  // leave the page while offline; the copy stays in IndexedDB (written 300 ms after the last
  // change, or when the page is hidden)
  await page.waitForTimeout(1000)
  await page.close()

  const renamed = await rename('document', doc.id, 'Neu')
  await context.setOffline(false)
  const again = await context.newPage()
  // an old link or bookmark: the stored copy loads and follows the redirect
  await again.goto(`/document/${doc.id}`)
  await again.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(again).toHaveURL(new RegExp(`/document/${renamed.id}$`), { timeout: 30_000 })
  await expect.poll(() => documentContent(renamed.id), { timeout: 20_000 }).toBe('Start. Offline.')
})

test('folders follow moves: open views and old links', async ({ page }, testInfo) => {
  const folder = await create('section', testName('Verschoben', testInfo))
  await login(page)
  await page.goto(`/section/${folder.id}`)
  await expect(page.locator('main')).toContainText('Nothing here yet')

  // someone else renames the open folder
  const renamed = await rename('section', folder.id, `${folder.name} neu`)
  await expect(page).toHaveURL(new RegExp(`/section/${renamed.id}$`))

  // a bookmark with the old id
  await page.goto(`/section/${folder.id}`)
  await expect(page).toHaveURL(new RegExp(`/section/${renamed.id}$`))
  await expect(page.locator('main')).not.toContainText('Not found')
})
