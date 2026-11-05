import { beforeEach, describe, expect, it, vi } from 'vitest'

async function freshInstance() {
  vi.resetModules()
  return await import('./instance')
}

describe('instance', () => {
  beforeEach(() => sessionStorage.clear())

  it('keeps the id over a reload', async () => {
    const { instanceId } = await freshInstance()
    const id = instanceId()
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(instanceId()).toBe(id)
    window.dispatchEvent(new Event('pagehide'))
    expect((await freshInstance()).instanceId()).toBe(id)
  })

  it('gets a new id in a duplicated tab, which copies the storage of a running one', async () => {
    const first = (await freshInstance()).instanceId()
    const copy = (await freshInstance()).instanceId()
    expect(copy).not.toBe(first)
  })

  it('remembers the color for this tab, until it is reset', async () => {
    const first = await freshInstance()
    expect(first.instanceColor.value).toBeNull()
    first.setInstanceColor('#00ff00')
    expect((await freshInstance()).instanceColor.value).toBe('#00ff00')
    first.setInstanceColor(null)
    expect((await freshInstance()).instanceColor.value).toBeNull()
  })
})
