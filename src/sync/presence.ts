import { shallowRef } from 'vue'

import { UNKNOWN_USER_COLOR } from './authors'
import type { AmDoc, AutomergeApi } from './automerge'
import type { PresenceInfo, SendMessage } from './protocol'
import type { Peer, TextSelection } from './session'

interface PeerState {
  info: PresenceInfo
  resolved: TextSelection[]
}

export interface PresenceOptions {
  automerge: () => AutomergeApi
  doc: () => AmDoc | null
  documentId: () => string
  /** Whether the current socket has received its initial content. */
  isSynced: () => boolean
  send: SendMessage
  presenceMs: number
}

/**
 * Who else has the document open and where their cursors are, and our own cursor for them
 * (protocol section 6): Automerge cursors, plus the reserved strings `start` (empty text) and
 * `end` (caret after the last character).
 */
export function createPresence(options: PresenceOptions) {
  const peers = shallowRef<Peer[]>([])
  const states = new Map<string, PeerState>()
  let pendingSelections: readonly TextSelection[] = []
  let lastSent = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const text = () => options.doc()?.content ?? ''

  function cursorAt(index: number): string {
    const length = text().length
    if (length === 0) return 'start'
    if (index >= length) return 'end'
    return options.automerge().getCursor(options.doc()!, ['content'], Math.max(0, index))
  }

  function cursorPosition(cursor: string): number {
    if (cursor === 'start') return 0
    if (cursor === 'end') return text().length
    return options.automerge().getCursorPosition(options.doc()!, ['content'], cursor)
  }

  /** Publishes the peers, with their cursors at the positions in the current text. */
  function resolve(): void {
    if (!options.doc()) return
    const list: Peer[] = []
    for (const state of states.values()) {
      const resolved: TextSelection[] = []
      let ok = true
      for (const s of state.info.selections ?? []) {
        try {
          resolved.push({
            anchor: cursorPosition(s.anchor),
            head: cursorPosition(s.head),
          })
        } catch {
          ok = false // the cursor points into a change we have not received yet
        }
      }
      if (ok) state.resolved = resolved
      list.push({
        clientId: state.info.clientId,
        username: state.info.username,
        displayName: state.info.displayName ?? state.info.username,
        color: state.info.color ?? UNKNOWN_USER_COLOR,
        selections: state.resolved,
      })
    }
    peers.value = list
  }

  function send(): void {
    timer = null
    if (!options.doc() || !options.isSynced()) return
    lastSent = Date.now()
    options.send({
      type: 'presence',
      documentId: options.documentId(),
      selections: pendingSelections.map((s) => ({
        anchor: cursorAt(s.anchor),
        head: cursorAt(s.head),
      })),
    })
  }

  return {
    peers,
    resolve,
    /** A peer's presence changed. */
    update(info: PresenceInfo): void {
      states.set(info.clientId, { info, resolved: states.get(info.clientId)?.resolved ?? [] })
      resolve()
    },
    /** The complete list of peers. */
    replaceAll(list: readonly PresenceInfo[]): void {
      states.clear()
      for (const info of list) states.set(info.clientId, { info, resolved: [] })
      resolve()
    },
    remove(clientId: string): void {
      states.delete(clientId)
      resolve()
    },
    /** The connection ended: nobody is known to be here. */
    clear(): void {
      states.clear()
      peers.value = []
    },
    /** Our own text changed, which moves the cursors of the others. */
    onLocalEdit(): void {
      if (states.size > 0) resolve()
    },
    setLocalSelections(selections: readonly TextSelection[]): void {
      pendingSelections = selections
      if (timer) return
      timer = setTimeout(send, Math.max(0, options.presenceMs - (Date.now() - lastSent)))
    },
    /** A new connection is ready: tells it where our cursor is. */
    sendCurrent(): void {
      if (pendingSelections.length > 0) send()
    },
    stop(): void {
      if (timer) clearTimeout(timer)
    },
  }
}
