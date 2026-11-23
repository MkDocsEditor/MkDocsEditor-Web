import { expect, test } from '@playwright/test'

import { createDocument, login, openEditor, testName } from './helpers'

test('a page opens where it was left, also after a reload', async ({ page }, testInfo) => {
  const id = await createDocument(testName('Lang', testInfo))
  const other = await createDocument(testName('Anders', testInfo))
  await login(page)
  await openEditor(page, id)
  const lines = Array.from({ length: 300 }, (_, i) => `Zeile ${i + 1}`)
  await page.locator('.cm-content').click()
  await page.keyboard.insertText(lines.join('\n'))
  await expect(page.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')

  // the cursor on line 200, scrolled there
  await page.keyboard.press('ControlOrMeta+Home')
  for (let i = 0; i < 199; i++) await page.keyboard.press('ArrowDown')
  await expect(page.locator('.cm-activeLine')).toHaveText('Zeile 200')
  const scrolled = await page.locator('.cm-scroller').evaluate((el) => el.scrollTop)
  expect(scrolled).toBeGreaterThan(1000)

  // another page, then back: a new load of the app
  await openEditor(page, other)
  await openEditor(page, id)
  await expect(page.locator('.cm-activeLine')).toHaveText('Zeile 200')
  await expect(page.locator('.cm-line', { hasText: /^Zeile 200$/ })).toBeInViewport()
  const restored = await page.locator('.cm-scroller').evaluate((el) => el.scrollTop)
  expect(Math.abs(restored - scrolled)).toBeLessThan(50)

  // the preview keeps its own place
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  const preview = page.getByTestId('markdown-preview')
  await expect(preview).toContainText('Zeile 300')
  // the text is one paragraph: halfway down it
  await preview.hover()
  const half = await preview.evaluate((el) => Math.round((el.scrollHeight - el.clientHeight) / 2))
  expect(half).toBeGreaterThan(50)
  await page.mouse.wheel(0, half)
  await expect.poll(() => preview.evaluate((el) => el.scrollTop)).toBeGreaterThan(50)
  const previewScrolled = await preview.evaluate((el) => el.scrollTop)
  await page.goto(`/document/${other}`)
  await expect(page.getByTestId('markdown-preview')).toBeVisible({ timeout: 30_000 })
  await page.goto(`/document/${id}`)
  await expect(preview).toContainText('Zeile 300', { timeout: 30_000 })
  await expect
    .poll(async () => Math.abs((await preview.evaluate((el) => el.scrollTop)) - previewScrolled))
    .toBeLessThan(50)

  // a link to a line wins
  await page.goto(`/document/${id}?line=5`)
  await expect(page.locator('.cm-activeLine')).toHaveText('Zeile 5', { timeout: 30_000 })
})
