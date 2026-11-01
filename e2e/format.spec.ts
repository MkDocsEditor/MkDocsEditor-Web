import { expect, test } from '@playwright/test'

import { createDocument, documentContent, editorText, login, openEditor, testName } from './helpers'

test('formats text with the toolbar and keyboard shortcuts', async ({ page }, testInfo) => {
  const id = await createDocument(testName('Formatierung', testInfo))
  await login(page)
  await openEditor(page, id)
  const toolbar = page.getByTestId('format-toolbar')
  await expect(toolbar).toBeVisible()

  // a shortcut on a selection
  await page.locator('.cm-content').click()
  await page.keyboard.type('wichtig')
  await page.keyboard.press('Shift+Home')
  await page.keyboard.press('ControlOrMeta+b')
  await expect.poll(() => editorText(page)).toBe('**wichtig**')

  // toolbar buttons keep the editor focused, so typing goes on
  // (insertText for line breaks: Enter continues lists, and Android handles it through the IME)
  await page.keyboard.press('End')
  await page.keyboard.insertText('\nEinkauf')
  await toolbar.getByTestId('format-taskList').click()
  await page.keyboard.type(' heute')
  await expect.poll(() => editorText(page)).toBe('**wichtig**\n- [ ] Einkauf heute')

  // menus: heading and admonition
  await page.keyboard.press('ControlOrMeta+Home')
  await toolbar.getByTestId('format-heading').click()
  await page.getByTestId('format-heading-2').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.insertText('\n\n')
  await toolbar.getByTestId('format-admonition').scrollIntoViewIfNeeded()
  await toolbar.getByTestId('format-admonition').click()
  await page.getByTestId('format-admonition-warning').click()
  await page.keyboard.type('Achtung')
  await expect
    .poll(() => editorText(page))
    .toBe('## **wichtig**\n- [ ] Einkauf heute\n\n!!! warning "Achtung"\n    ')

  await expect
    .poll(() => documentContent(id))
    .toBe('## **wichtig**\n- [ ] Einkauf heute\n\n!!! warning "Achtung"\n    ')
})

test('the toolbar fits a phone screen by scrolling', async ({ page }, testInfo) => {
  const id = await createDocument(testName('Toolbar', testInfo))
  await login(page)
  await openEditor(page, id)
  const toolbar = page.getByTestId('format-toolbar')
  const box = await toolbar.boundingBox()
  const viewport = page.viewportSize()!
  expect(box!.width).toBeLessThanOrEqual(viewport.width)
  // the page itself never scrolls sideways
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width,
  )
})
