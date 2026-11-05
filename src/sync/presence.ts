import { ref, shallowRef } from 'vue'

import { UNKNOWN_USER_COLOR } from './authors'
import type { AmDoc, AutomergeApi } from './automerge'
import type {
  GhostInfo,
  LastPosition,
  PresenceInfo,
  PresenceLeave,
  SendMessage,
  ViewportInfo,
} from './protocol'
import type { Ghost, Peer, TextRange, TextSelection } from './session'

/** At most about twice per second while scrolling (protocol section 6, "Viewport"). */
const VIEWPORT_MS = 500

type WireSelections = PresenceInfo['selections']

/** Older servers have no instances: there, one account counts as one instance. */
function instanceOf(info: PresenceInfo): string {
  return info.instanceId ?? info.accountId ?? info.clientId
}

interface Resolved {
  selections: TextSelection[]
  viewport?: TextRange
}

interface PeerState {
  info: PresenceInfo
  resolved: Resolved
}

interface GhostState {
  instanceId: string
  accountId: string
  username: string
  displayName?: string
  color?: string
  deviceName?: string
  selections: WireSelections
  viewport?: ViewportInfo
  timer: ReturnType<typeof setTimeout>
}

export interface PresenceOptions {
  automerge: () => AutomergeApi
  doc: () => AmDoc | null
  documentId: () => string
  /** The instance of this connection: an old socket of it can still be listed. */
  ownInstance: () => string | undefined
  /** Whether the current socket has received its initial content. */
  isSynced: () => boolean
  send: SendMessage
  presenceMs: number
}

/**
 * Who else has the document open and where their cursors and viewports are, and our own for them
 * (protocol section 6): Automerge cursors, plus the reserved strings `start` (empty text) and
 * `end` (caret after the last character). An instance that leaves stays as a ghost for as long as
 * the server says.
 */
export function createPresence(options: PresenceOptions) {
  const peers = shallowRef<Peer[]>([])
  const ghosts = shallowRef<Ghost[]>([])
  const known = ref(false)
  const lastPositions = shallowRef<readonly LastPosition[]>([])
  const states = new Map<string, PeerState>()
  const ghostStates = new Map<string, GhostState>()
  let pendingSelections: readonly TextSelection[] = []
  /** Undefined until the editor has told us: then a message leaves the server's value alone. */
  let pendingViewport: TextRange | null | undefined
  let nextViewport: TextRange | null = null
  /** Undefined when the server has the current value. */
  let pendingColor: string | null | undefined
  let lastSent = 0
  let lastViewportAt = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let viewportTimer: ReturnType<typeof setTimeout> | null = null

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

  /** What the cursors mean in the current text; `previous` where they point into unknown changes. */
  function resolved(
    selections: WireSelections,
    viewport: ViewportInfo | undefined,
    previous: Resolved,
  ): Resolved {
    let nextSelections = previous.selections
    try {
      nextSelections = (selections ?? []).map((s) => ({
        anchor: cursorPosition(s.anchor),
        head: cursorPosition(s.head),
      }))
    } catch {
      // the cursor points into a change we have not received yet
    }
    let nextView: TextRange | undefined
    if (viewport) {
      try {
        nextView = {
          top: cursorPosition(viewport.top),
          bottom: cursorPosition(viewport.bottom),
        }
      } catch {
        nextView = previous.viewport
      }
    }
    return { selections: nextSelections, viewport: nextView }
  }

  /** Publishes the peers and ghosts, at their positions in the current text. */
  function resolve(): void {
    if (!options.doc()) return
    const list: Peer[] = []
    for (const state of states.values()) {
      if (instanceOf(state.info) === options.ownInstance()) continue
      state.resolved = resolved(state.info.selections, state.info.viewport, state.resolved)
      list.push({
        clientId: state.info.clientId,
        instanceId: instanceOf(state.info),
        accountId: state.info.accountId,
        deviceName: state.info.deviceName,
        lastActiveAt: state.info.lastActiveAt,
        username: state.info.username,
        displayName: state.info.displayName ?? state.info.username,
        color: state.info.instanceColor ?? state.info.color ?? UNKNOWN_USER_COLOR,
        ...state.resolved,
      })
    }
    peers.value = list
    ghosts.value = [...ghostStates.values()].map((ghost) => ({
      instanceId: ghost.instanceId,
      accountId: ghost.accountId,
      deviceName: ghost.deviceName,
      username: ghost.username,
      displayName: ghost.displayName ?? ghost.username,
      color: ghost.color ?? UNKNOWN_USER_COLOR,
      ...resolved(ghost.selections, ghost.viewport, { selections: [] }),
    }))
  }

  function endGhost(instanceId: string): void {
    const ghost = ghostStates.get(instanceId)
    if (!ghost) return
    clearTimeout(ghost.timer)
    ghostStates.delete(instanceId)
  }

  function endAllGhosts(): void {
    for (const ghost of ghostStates.values()) clearTimeout(ghost.timer)
    ghostStates.clear()
  }

  function addGhost(ghost: Omit<GhostState, 'timer'>, ghostMs: number): void {
    endGhost(ghost.instanceId)
    ghostStates.set(ghost.instanceId, {
      ...ghost,
      timer: setTimeout(() => {
        ghostStates.delete(ghost.instanceId)
        resolve()
      }, ghostMs),
    })
  }

  function send(): void {
    timer = null
    if (!options.doc() || !options.isSynced()) return
    lastSent = Date.now()
    // a cursor that moved took the view along: it must not arrive without it, because this user
    // can be gone before the viewport timer runs, and their ghost would show the old place
    if (viewportTimer) {
      clearTimeout(viewportTimer)
      viewportTimer = null
      lastViewportAt = lastSent
      pendingViewport = nextViewport
    }
    options.send({
      type: 'presence',
      documentId: options.documentId(),
      selections: pendingSelections.map((s) => ({
        anchor: cursorAt(s.anchor),
        head: cursorAt(s.head),
      })),
      ...(pendingViewport === undefined
        ? {}
        : {
            viewport: pendingViewport && {
              top: cursorAt(pendingViewport.top),
              bottom: cursorAt(pendingViewport.bottom),
            },
          }),
      ...(pendingColor === undefined ? {} : { instanceColor: pendingColor }),
    })
    pendingColor = undefined
  }

  function schedule(): void {
    if (timer) return
    timer = setTimeout(send, Math.max(0, options.presenceMs - (Date.now() - lastSent)))
  }

  function applyViewport(): void {
    viewportTimer = null
    lastViewportAt = Date.now()
    pendingViewport = nextViewport
    schedule()
  }

  return {
    peers,
    ghosts,
    known,
    resolve,
    /** A peer's presence changed. */
    update(info: PresenceInfo): void {
      endGhost(instanceOf(info))
      states.set(info.clientId, {
        info,
        resolved: states.get(info.clientId)?.resolved ?? { selections: [] },
      })
      resolve()
    },
    /** The complete list of peers. */
    replaceAll(
      list: readonly PresenceInfo[],
      last: readonly LastPosition[] = [],
      left: readonly GhostInfo[] = [],
    ): void {
      lastPositions.value = last
      states.clear()
      for (const info of list) states.set(info.clientId, { info, resolved: { selections: [] } })
      endAllGhosts()
      const online = new Set(list.map(instanceOf))
      for (const ghost of left) {
        if (online.has(ghost.instanceId)) continue
        addGhost(
          {
            instanceId: ghost.instanceId,
            accountId: ghost.accountId,
            deviceName: ghost.deviceName,
            username: ghost.username ?? '',
            displayName: ghost.displayName,
            color: ghost.instanceColor ?? ghost.color,
            selections: ghost.selections,
            viewport: ghost.viewport,
          },
          ghost.ghostMs,
        )
      }
      known.value = true
      resolve()
    },
    remove(leave: PresenceLeave): void {
      const info = states.get(leave.clientId)?.info
      states.delete(leave.clientId)
      if (leave.accountId && leave.ghostMs !== undefined) {
        addGhost(
          {
            instanceId: leave.instanceId ?? leave.accountId,
            accountId: leave.accountId,
            deviceName: leave.deviceName ?? info?.deviceName,
            username: info?.username ?? '',
            displayName: info?.displayName,
            color: leave.instanceColor ?? info?.instanceColor ?? info?.color,
            selections: leave.selections,
            viewport: leave.viewport,
          },
          leave.ghostMs,
        )
      }
      resolve()
    },
    /** Where this account was last; null if unknown or not resolvable here. */
    lastPositionOf(accountId: string): number | null {
      const entry = lastPositions.value.find((p) => p.accountId === accountId)
      const position = entry?.selections?.[0]?.head ?? entry?.viewport?.top
      if (position === undefined || !options.doc()) return null
      try {
        return cursorPosition(position)
      } catch {
        return null // points into a change we do not have
      }
    },
    /** The connection ended: nobody is known to be here. */
    clear(): void {
      states.clear()
      endAllGhosts()
      peers.value = []
      ghosts.value = []
      known.value = false
    },
    /** Our own text changed, which moves the cursors of the others. */
    onLocalEdit(): void {
      if (states.size > 0 || ghostStates.size > 0) resolve()
    },
    setLocalSelections(selections: readonly TextSelection[]): void {
      pendingSelections = selections
      schedule()
    },
    setLocalViewport(viewport: TextRange | null): void {
      nextViewport = viewport
      if (viewport === null) {
        // at once: followers must not stay on a place this user no longer looks at
        if (viewportTimer) clearTimeout(viewportTimer)
        applyViewport()
      } else if (!viewportTimer) {
        // the last value of a scroll is sent by this timer too, as the message when it stops
        viewportTimer = setTimeout(
          applyViewport,
          Math.max(0, VIEWPORT_MS - (Date.now() - lastViewportAt)),
        )
      }
    },
    setLocalColor(color: string | null): void {
      pendingColor = color
      schedule()
    },
    /** A new connection is ready: tells it where our cursor and viewport are. */
    sendCurrent(): void {
      if (pendingSelections.length > 0 || pendingViewport) send()
    },
    stop(): void {
      if (timer) clearTimeout(timer)
      if (viewportTimer) clearTimeout(viewportTimer)
      endAllGhosts()
    },
  }
}
