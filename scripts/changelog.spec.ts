import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { parseChangelog, readChangelog } from './changelog.ts'

describe('parseChangelog', () => {
  it('takes the squash commits of pull requests, newest first, without the number', () => {
    const log = [
      '2026-11-23\tFollow agents, and type out their live changes (#134)',
      '2026-11-23\tMerge pull request #12 from someone/branch',
      '2026-11-22\tFix the build',
      '2026-11-22\tSay what (#2) means (#131)',
      '',
    ].join('\n')
    expect(parseChangelog(log)).toEqual([
      { number: 134, title: 'Follow agents, and type out their live changes', date: '2026-11-23' },
      { number: 131, title: 'Say what (#2) means', date: '2026-11-22' },
    ])
  })

  it('keeps at most the limit', () => {
    const log = Array.from({ length: 60 }, (_, i) => `2026-01-01\tChange ${i} (#${i})`).join('\n')
    const changes = parseChangelog(log)
    expect(changes).toHaveLength(50)
    expect(changes.at(-1)!.number).toBe(49)
  })
})

describe('readChangelog', () => {
  let dir: string | undefined
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('reads the file written for a build without git', () => {
    dir = mkdtempSync(join(tmpdir(), 'changelog-'))
    const written = { commit: 'abc1234', changes: [{ number: 1, title: 'A', date: '2026-01-01' }] }
    writeFileSync(join(dir, 'changelog.json'), JSON.stringify(written))
    expect(readChangelog(dir)).toEqual(written)
  })

  it('is empty without git and without the file', () => {
    dir = mkdtempSync(join(tmpdir(), 'changelog-'))
    expect(readChangelog(dir)).toEqual({ commit: null, changes: [] })
  })

  it('reads git in a checkout', () => {
    const changelog = readChangelog(process.cwd())
    expect(changelog.commit).toMatch(/^[0-9a-f]{7}$/)
  })
})
