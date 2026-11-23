/**
 * The changelog of a build: the pull requests merged before it, read from git. The same shape
 * as the Android app's, so both show the same list.
 *
 * `node scripts/changelog.ts > changelog.json` writes it for a build without `.git` (the Docker
 * image); the build bundles that file when it exists, and reads git otherwise.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface ChangelogEntry {
  number: number
  title: string
  /** The day it was merged: YYYY-MM-DD. */
  date: string
}

export interface Changelog {
  /** The short hash of the built commit; null when unknown (a build without git). */
  commit: string | null
  /** Newest first. */
  changes: ChangelogEntry[]
}

export const CHANGELOG_FILE = 'changelog.json'
export const CHANGELOG_LIMIT = 50

/** How many commits to look at: some first-parent commits are not pull requests. */
const SCANNED = 500

const SUBJECT = /^(.*\S) \(#(\d+)\)$/

/** Parses `git log --format=%cs%x09%s`: the squash commits of pull requests ("Title (#123)"). */
export function parseChangelog(log: string, limit = CHANGELOG_LIMIT): ChangelogEntry[] {
  const changes: ChangelogEntry[] = []
  for (const line of log.split('\n')) {
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    const match = SUBJECT.exec(line.slice(tab + 1))
    if (!match) continue
    changes.push({ number: Number(match[2]), title: match[1]!, date: line.slice(0, tab) })
    if (changes.length >= limit) break
  }
  return changes
}

/** The changelog of the commit checked out in `dir`; null without git. */
export function changelogFromGit(dir: string): Changelog | null {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  try {
    const commit = git('rev-parse', '--short=7', 'HEAD').trim()
    const log = git('log', `-n${SCANNED}`, '--first-parent', '--format=%cs%x09%s', 'HEAD')
    return { commit, changes: parseChangelog(log) }
  } catch {
    return null
  }
}

/** The changelog to bundle: the written file, else git, else an empty one. */
export function readChangelog(dir: string): Changelog {
  const file = join(dir, CHANGELOG_FILE)
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as Changelog
  return changelogFromGit(dir) ?? { commit: null, changes: [] }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const changelog = changelogFromGit(process.cwd())
  if (!changelog) {
    console.error('changelog: not a git checkout')
    process.exit(1)
  }
  process.stdout.write(JSON.stringify(changelog) + '\n')
}
