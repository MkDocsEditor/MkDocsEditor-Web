import { shallowRef } from 'vue'

import type { AuthorshipResponse } from '@/api'

import { applyChangesToRuns, runsFromCodePoints } from './authorRuns'
import type { Run } from './authorRuns'
import type { AmDoc, AutomergeApi } from './automerge'
import { sameHeads } from './automerge'
import type { AuthorRun, TextChange } from './session'

/** Colour of users the server told nothing about. */
export const UNKNOWN_USER_COLOR = '#9e9e9e'

export interface AuthorsOptions {
  automerge: () => AutomergeApi
  doc: () => AmDoc | null
  documentId: () => string
  getAuthorship: (id: string) => Promise<AuthorshipResponse | null>
  refetchMs: number
}

/**
 * Who wrote which part of the text. The server's answer is the truth; between answers the runs
 * follow the edits, so the marks stay in place while typing.
 */
export function createAuthors(options: AuthorsOptions) {
  const authorship = shallowRef<AuthorRun[]>([])
  const users = new Map<string, { displayName: string; color: string }>()
  let runs: Run[] = []
  /** null until the first fetch tells whether the backend has the authorship endpoint. */
  let supported: boolean | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function publish(): void {
    authorship.value = runs.flatMap((run) => {
      if (run.username === null) return []
      const user = users.get(run.username)
      return [
        {
          from: run.from,
          to: run.to,
          username: user?.displayName ?? run.username,
          color: user?.color ?? UNKNOWN_USER_COLOR,
        },
      ]
    })
  }

  async function fetch(): Promise<void> {
    if (!options.doc()) return
    let response: AuthorshipResponse | null
    try {
      response = await options.getAuthorship(options.documentId())
    } catch {
      return
    }
    supported = response !== null
    const doc = options.doc()
    if (!response || !doc) return
    if (!sameHeads(response.heads, options.automerge().getHeads(doc))) {
      scheduleRefetch() // our copy moved on meanwhile
      return
    }
    runs = runsFromCodePoints(doc.content, response.runs)
    publish()
  }

  function scheduleRefetch(): void {
    if (supported === false) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void fetch()
    }, options.refetchMs)
  }

  return {
    authorship,
    publish,
    scheduleRefetch,
    /** Asks the server, unless it is known not to have the endpoint. */
    refresh(): void {
      if (supported !== false) void fetch()
    },
    rememberUser(info: { username: string; displayName?: string; color?: string }): void {
      if (!info.username) return
      users.set(info.username, {
        displayName: info.displayName || info.username,
        color: info.color ?? users.get(info.username)?.color ?? UNKNOWN_USER_COLOR,
      })
    },
    /** Moves the runs along with `changes`; the inserted text belongs to `username`. */
    follow(changes: readonly TextChange[], username: string | null): void {
      runs = applyChangesToRuns(runs, changes, username)
    },
    /** The text was replaced: the old runs mean nothing any more. */
    reset(): void {
      runs = []
    },
    stop(): void {
      if (timer) clearTimeout(timer)
    },
  }
}
