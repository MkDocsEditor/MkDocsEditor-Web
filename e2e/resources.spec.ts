import { expect, test } from '@playwright/test'

import { backendRequest, editorText, login, openEditor, testName, uploadResource } from './helpers'

// a 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

type Section = { id: string; name: string; subsections: Section[] }

async function createFolder(name: string): Promise<Section> {
  const root = (await (await backendRequest('GET', '/section/')).json()) as Section
  const response = await backendRequest('POST', '/section/', { parent: root.id, name })
  expect(response.ok).toBe(true)
  return (await response.json()) as Section
}

async function openDrawer(page: import('@playwright/test').Page, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: 'Menu' }).click()
  return page.getByTestId('nav-drawer')
}

test('shows files in the tree and on their own page', async ({ page, isMobile }, testInfo) => {
  const name = testName('Dateien', testInfo)
  const folder = await createFolder(name)
  await login(page)
  await page.goto(`/section/${folder.id}`)
  await page.getByTestId('file-input').setInputFiles([
    { name: 'Foto.png', mimeType: 'image/png', buffer: PNG },
    { name: 'Plan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') },
    { name: 'Liste.txt', mimeType: 'text/plain', buffer: Buffer.from('Mehl\nZucker\n') },
  ])
  const main = page.locator('main')
  await expect(main.getByText('Liste.txt', { exact: true })).toBeVisible()
  // images get a thumbnail in the folder list
  await expect(main.getByTestId('resource-thumb').locator('img')).toHaveCount(1)

  const drawer = await openDrawer(page, isMobile)
  const files = drawer.getByTestId('tree-resource')
  await expect(files.filter({ hasText: 'Foto.png' })).toBeVisible()
  await expect(files.filter({ hasText: 'Plan.pdf' })).toBeVisible()
  // files can be hidden
  await drawer.getByTestId('tree-toggle-files').click()
  await expect(files).toHaveCount(0)
  await drawer.getByTestId('tree-toggle-files').click()

  await files.filter({ hasText: 'Liste.txt' }).click()
  await expect(page.getByTestId('resource-title')).toHaveText('Liste.txt')
  await expect(page.getByTestId('resource-path')).toContainText(`${name}/Liste.txt`)
  await expect(page.getByTestId('resource-preview')).toContainText('Zucker')

  // rename on the file's page
  await page.getByTestId('resource-rename').click()
  const dialog = page.getByTestId('move-dialog')
  await dialog.getByTestId('move-name').locator('input').fill('Einkauf.txt')
  await expect(dialog.getByTestId('move-new-path')).toContainText('Einkauf.txt')
  await dialog.getByTestId('move-apply').click()
  await expect(page.getByTestId('resource-title')).toHaveText('Einkauf.txt')
})

test('the files panel lists and inserts files of the page', async ({
  page,
  isMobile,
}, testInfo) => {
  const name = testName('Panel', testInfo)
  const folder = await createFolder(name)
  const doc = (await (
    await backendRequest('POST', '/document/', { parent: folder.id, name: 'Seite' })
  ).json()) as { id: string }

  await login(page)
  await openEditor(page, doc.id)
  await page.getByTestId('toggle-files').click()
  const panel = page.getByTestId('resources-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('This page uses no files yet.')

  // upload from the panel: lands in the page's folder and is inserted at the cursor
  await panel
    .getByTestId('panel-file-input')
    .setInputFiles([{ name: 'Bild (1).png', mimeType: 'image/png', buffer: PNG }])
  await expect.poll(() => editorText(page)).toContain('![Bild (1)](Bild%20%281%29.png)')
  await expect(panel.getByTestId('panel-used')).toContainText('Bild (1).png')

  // another file of the folder (uploaded elsewhere): a click inserts a link to it
  await uploadResource(folder.id, 'Plan.pdf', '%PDF-1.4\n%%EOF', 'application/pdf')
  await panel.getByTestId('panel-folder').filter({ hasText: 'Plan.pdf' }).click()
  await expect.poll(() => editorText(page)).toContain('[Plan.pdf](Plan.pdf)')

  // a reference to a file that does not exist shows up as not found
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.insertText('\n![weg](fehlt.png)')
  // on phones the panel closes after inserting
  if (isMobile) await page.getByTestId('toggle-files').click()
  await expect(panel.getByTestId('panel-broken')).toContainText('fehlt.png')
})

test('opens a file in a tab of its own, as the server sends it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the same on every screen')
  const folder = await createFolder(testName('Öffnen', testInfo))
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>'
  const file = await uploadResource(folder.id, 'Bild.svg', svg, 'image/svg+xml')
  await login(page)
  await page.goto(`/resource/${file.id}`)
  const [tab] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByTestId('resource-open').click(),
  ])
  await tab.waitForLoadState()
  expect(tab.url()).toMatch(new RegExp(`/resource/${file.id}/content/$`))
  // the file itself, from the server, with the session's cookie: an SVG with its type and the
  // server's policy, not an object URL of this app
  const response = await page.context().request.get(tab.url())
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/svg+xml')
  expect(response.headers()['content-security-policy']).toContain("default-src 'none'")
  await expect(tab.locator('rect')).toHaveAttribute('fill', 'red')
  expect(await tab.evaluate(() => window.opener)).toBeNull()
})
