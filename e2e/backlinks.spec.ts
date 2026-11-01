import { expect, test } from '@playwright/test'

import {
  backendRequest,
  documentContent,
  login,
  openEditor,
  testName,
  uploadResource,
} from './helpers'

// a 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

type Item = { id: string; name: string }

async function create(kind: 'section' | 'document', parent: string, name: string): Promise<Item> {
  const response = await backendRequest('POST', `/${kind}/`, { parent, name })
  expect(response.ok).toBe(true)
  return (await response.json()) as Item
}

test('pages and files show what links to them', async ({ page }, testInfo) => {
  const base = testName('Verweise', testInfo)
  const root = (await (await backendRequest('GET', '/section/')).json()) as Item
  const top = await create('section', root.id, base)
  const quelle = await create('document', top.id, 'Quelle')
  const ziel = await create('document', top.id, 'Ziel')
  const bild = await uploadResource(top.id, 'Bild.png', PNG, 'image/png')
  const unbenutzt = await uploadResource(top.id, 'Unbenutzt.png', PNG, 'image/png')

  const missing = `Fehlt-${testInfo.project.name}.md`

  await login(page)
  await openEditor(page, quelle.id)
  await page.locator('.cm-content').click()
  await page.keyboard.insertText(
    `Erste Zeile.\n\n![Bild](Bild.png) und [Ziel](Ziel.md)\n\n[weg](${missing})`,
  )
  await expect.poll(() => documentContent(quelle.id)).toContain(`[weg](${missing})`)

  // "linked from" in the files drawer of the target page
  await page.goto(`/document/${ziel.id}`)
  await page.getByTestId('toggle-files').click()
  const backlink = page.getByTestId('backlink').filter({ hasText: 'Quelle' })
  await expect(backlink).toContainText('line 3', { timeout: 10_000 })
  await backlink.click()
  await expect(page).toHaveURL(new RegExp(`/document/${quelle.id}$`))
  // the line of the link is selected
  await expect(page.locator('.cm-selectionBackground').first()).toBeVisible()
  await expect(page.locator('.cm-activeLine')).toHaveText('![Bild](Bild.png) und [Ziel](Ziel.md)')

  // "used by" on the file page, and the delete warning
  await page.goto(`/resource/${bild.id}`)
  await expect(page.getByTestId('backlink').filter({ hasText: 'Quelle' })).toBeVisible()
  await page.getByTestId('resource-delete').click()
  await expect(page.getByRole('dialog')).toContainText('1 page links to this file')
  await page.keyboard.press('Escape')

  // the maintenance page
  await page.getByTestId('account-menu').click()
  await page.getByTestId('menu-references').click()
  await expect(page.getByTestId('broken-link').filter({ hasText: missing })).toContainText('Line 5')
  await page.getByTestId('tab-unused').click()
  const unused = page.getByTestId('unused-file')
  await expect(unused.filter({ hasText: `${base}/${unbenutzt.name}` })).toHaveCount(1)
  await expect(unused.filter({ hasText: `${base}/Bild.png` })).toHaveCount(0)
})
