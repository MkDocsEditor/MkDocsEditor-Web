import { appendFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { backendBinary, createWiki, startBackend, TMP, writeConfig } from './backend'
import type { RunningBackend } from './backend'
import { editorText, login, typeAt } from './helpers'
import { USERS } from './ports'

/**
 * The server loses its saved Automerge state (new epoch) while a client has unsynced offline
 * edits. Those edits must survive: the client re-applies them onto the new document
 * (docs/sync-protocol.md, "Epochs and offline edits").
 */
test('offline edits survive a server that lost its state (new epoch)', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000)
  const port = 17420 + testInfo.parallelIndex + (testInfo.project.name === 'phone' ? 5 : 0)
  const workDir = path.join(TMP, `epoch-${testInfo.project.name}`)
  rmSync(workDir, { recursive: true, force: true })
  mkdirSync(workDir, { recursive: true })
  const wiki = path.join(workDir, 'wiki')
  createWiki(wiki)
  const file = path.join(wiki, 'docs', 'index.md')
  const bin = backendBinary()
  const config = writeConfig(bin, workDir, wiki, port)
  let backend: RunningBackend = await startBackend(bin, config, workDir, port)
  const auth = `Basic ${Buffer.from(`${USERS.alice.username}:${USERS.alice.password}`).toString('base64')}`
  const content = async () =>
    (
      await fetch(`http://127.0.0.1:${port}/document/${docId}/content/`, {
        headers: { Authorization: auth },
      })
    ).text()

  let docId = ''
  try {
    const tree = (await (
      await fetch(`http://127.0.0.1:${port}/section/`, { headers: { Authorization: auth } })
    ).json()) as { documents: { id: string; name: string }[] }
    docId = tree.documents.find((d) => d.name === 'index')!.id

    // a client of this backend: the runtime config points the app at it
    const context = await browser.newContext(testInfo.project.use)
    await context.route('**/config.json', (route) =>
      route.fulfill({ json: { backendUrl: `http://127.0.0.1:${port}`, wikiUrl: '' } }),
    )
    const page = await context.newPage()
    await login(page, USERS.alice)
    await page.goto(`/document/${docId}`)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')
    await typeAt(page, 'end', 'Vor dem Absturz.')
    await expect.poll(content).toContain('Vor dem Absturz.')

    // offline edit
    await context.setOffline(true)
    await expect(page.getByTestId('connection-state')).toHaveAttribute('title', /Offline/, {
      timeout: 20_000,
    })
    await typeAt(page, 'end', ' Offline geschrieben.')

    // the server loses its state, and the file changes on disk meanwhile
    await backend.stop()
    rmSync(path.join(wiki, '.mkdocseditor'), { recursive: true, force: true })
    appendFileSync(file, '\nVon Git.\n')
    backend = await startBackend(bin, config, workDir, port)

    await context.setOffline(false)
    // the editor shows the offline text before the reconnect, so wait for the merge
    await expect.poll(() => editorText(page), { timeout: 40_000 }).toContain('Von Git.')
    await expect(page.getByTestId('connection-state')).toHaveAttribute('title', 'Saved')
    const text = await editorText(page)
    expect(text).toContain('Vor dem Absturz. Offline geschrieben.')
    await expect.poll(content).toBe(text)
    // and it reaches the file
    await expect.poll(() => readFileSync(file, 'utf8'), { timeout: 10_000 }).toBe(text)
  } finally {
    await backend.stop()
  }
})
