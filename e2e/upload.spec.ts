import { expect, test } from '@playwright/test'

import { backendRequest, documentContent, editorText, login, openEditor, testName } from './helpers'

// a 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

type Section = {
  id: string
  name: string
  resources: { name: string }[]
  subsections: Section[]
}

async function folder(name: string): Promise<Section | undefined> {
  const root = (await (await backendRequest('GET', '/section/')).json()) as Section
  return root.subsections.find((s) => s.name === name)
}

test('uploads files into a folder and pasted images into a page', async ({ page }, testInfo) => {
  const name = testName('Fotos', testInfo)
  const root = (await (await backendRequest('GET', '/section/')).json()) as Section
  const created = await backendRequest('POST', '/section/', { parent: root.id, name })
  expect(created.ok).toBe(true)
  const section = (await created.json()) as Section
  const doc = (await (
    await backendRequest('POST', '/document/', { parent: section.id, name: 'Album' })
  ).json()) as { id: string }

  await login(page)
  await page.goto(`/section/${section.id}`)
  await expect(page.getByTestId('section-title')).toHaveText(name)
  await page.getByTestId('file-input').setInputFiles([
    { name: 'Strand.png', mimeType: 'image/png', buffer: PNG },
    { name: 'Strand.png', mimeType: 'image/png', buffer: PNG },
  ])
  const main = page.locator('main')
  await expect(main.getByText('Strand.png', { exact: true })).toBeVisible()
  await expect(main.getByText('Strand (2).png', { exact: true })).toBeVisible()
  expect((await folder(name))?.resources.map((r) => r.name).sort()).toEqual([
    'Strand (2).png',
    'Strand.png',
  ])

  // pasting an image into the editor uploads it next to the page and embeds it
  await openEditor(page, doc.id)
  await page.locator('.cm-content').click()
  await page.locator('.cm-content').evaluate(
    (el, bytes) => {
      const data = new DataTransfer()
      data.items.add(new File([new Uint8Array(bytes)], 'image.png', { type: 'image/png' }))
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      )
    },
    [...PNG],
  )
  await expect.poll(() => editorText(page)).toContain('![image](image.png)')
  await expect.poll(() => documentContent(doc.id)).toContain('![image](image.png)')
  expect((await folder(name))?.resources.map((r) => r.name)).toContain('image.png')

  await page.getByRole('button', { name: 'Vorschau', exact: true }).click()
  const image = page.getByTestId('markdown-preview').locator('img[alt="image"]')
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
})
