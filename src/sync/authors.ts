import { shallowRef } from 'vue'

import type { AuthorshipResponse } from '@/api'

import { applyChangesToRuns, runsFromCodePoints } from './authorRuns'
import type { Run } from './authorRuns'
import type { AmDoc, AutomergeApi } from './automerge'
import { sameHeads } from './automerge'
import type { AuthorRun, TextChange } from './session'

/** Colour of users the server told nothing about. */
export const UNKNOWN_USER_COLOR = '#9e9e9e'

/** The backend imports text under names like ":disk" and ":server", with a normal actor id. */
function hasAuthor(username: string | null): username is string {
  return username !== null && username.trim() !== '' && !username.startsWith(':')
}

export interface AuthorsOptions {
  automerge: () => AutomergeApi
  doc: () => AmDoc | null
  documentId: () => string
  getAuthorship: (id: string) => Promise<AuthorshipResponse | null>
  /** Asks again this long after the text stopped changing. */
  refetchMs: number
  /** While the text keeps changing, asks at least this often (counted from the first change). */
  refetchMaxWaitMs?: number
  now?: () => number
}

/**
 * Who wrote which part of the text. The server's answer is the truth; between answers the runs
 * follow the edits, so the marks stay in place while typing.
 */
export function createAuthors(options: AuthorsOptions) {
  const authorship = shallowRef<AuthorRun[]>([])
  const users = new Map<string, { displayName: string; color: string }>()
  /** Actor id to username. The server binds each actor to one account and refuses foreign ones. */
  const actors = new Map<string, string>()
  let runs: Run[] = []
  /** Since when a change waits for the server's answer, for the longest wait while typing. */
  let pendingSince: number | null = null
  const now = options.now ?? (() => Date.now())
  const maxWait = options.refetchMaxWaitMs ?? 10_000
  /** null until the first fetch tells whether the backend has the authorship endpoint. */
  let supported: boolean | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function publish(): void {
    authorship.value = runs.flatMap((run) => {
      if (!hasAuthor(run.username)) return []
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
    pendingSince = null
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
    pendingSince ??= now()
    const delay = Math.min(options.refetchMs, Math.max(0, pendingSince + maxWait - now()))
    timer = setTimeout(() => {
      timer = null
      void fetch()
    }, delay)
  }

  return {
    authorship,
    publish,
    scheduleRefetch,
    /** Asks the server, unless it is known not to have the endpoint. */
    refresh(): void {
      if (supported !== false) void fetch()
    },
    rememberUser(info: {
      username: string
      displayName?: string
      color?: string
      actorId?: string
    }): void {
      if (!info.username) return
      if (info.actorId) actors.set(info.actorId, info.username)
      users.set(info.username, {
        displayName: info.displayName || info.username,
        color: info.color ?? users.get(info.username)?.color ?? UNKNOWN_USER_COLOR,
      })
    },
    /**
     * The author of changes made by these actors, for colouring them before the server answers:
     * only when all of them belong to one person (not an import like ":disk"), else null.
     */
    authorOf(actorIds: readonly string[]): string | null {
      const names = new Set(actorIds.map((id) => actors.get(id) ?? null))
      if (names.size !== 1) return null
      const [name] = names
      return name !== undefined && hasAuthor(name) ? name : null
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
