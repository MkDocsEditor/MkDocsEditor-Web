import { EditorView } from '@codemirror/view'
import { onBeforeUnmount, ref, watch } from 'vue'

import type { Ghost, Peer } from '@/sync'
import { followTarget, isPresent } from '@/sync/followTarget'

/** How long a join link waits to learn who is here, and for the last position of its sender. */
export const SENDER_WAIT_MS = 5_000

/**
 * What a join link does, once: follow a sender who is here or a ghost, or else go to where the
 * sender was last. It stops waiting when the reader has started doing something on the page. The
 * sender can be this user too, on another device: presence never lists this connection itself.
 */
export function useJoinJump(options: {
  view: () => EditorView | null
  ready: () => boolean
  peers: () => readonly Peer[]
  ghosts: () => readonly Ghost[]
  presenceKnown: () => boolean
  lastPosition: (accountId: string) => number | null
  onFollow: (accountId: string) => void
  onSenderNotFound: () => void
}) {
  const sender = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  function stop(): void {
    sender.value = null
    if (timer) clearTimeout(timer)
    timer = null
    for (const event of INTERACTIONS) window.removeEventListener(event, stop, true)
  }

  function start(accountId: string | undefined): void {
    stop()
    if (!accountId) return
    sender.value = accountId
    for (const event of INTERACTIONS) window.addEventListener(event, stop, true)
  }

  function jump(view: EditorView, position: number): void {
    stop()
    const head = Math.min(position, view.state.doc.length)
    view.dispatch({
      selection: { anchor: head },
      effects: EditorView.scrollIntoView(head, { y: 'center' }),
    })
    view.focus()
  }

  function follow(view: EditorView, accountId: string, last: number | null): void {
    stop()
    options.onFollow(accountId)
    // here without a cursor yet: until they have one, the place they were last is the best guess
    if (last !== null && !followTarget(options.peers(), options.ghosts(), accountId)) {
      view.dispatch({
        effects: EditorView.scrollIntoView(Math.min(last, view.state.doc.length), { y: 'center' }),
      })
    }
  }

  watch(
    () => {
      const accountId = sender.value
      return [
        accountId,
        options.ready(),
        options.view(),
        options.presenceKnown(),
        options.peers(),
        options.ghosts(),
        accountId ? options.lastPosition(accountId) : null,
      ] as const
    },
    ([accountId, ready, view, known, peers, ghosts, last]) => {
      if (!accountId || !ready || !view) return
      if (known && isPresent(peers, ghosts, accountId)) return follow(view, accountId, last)
      if (known && last !== null) return jump(view, last)
      timer ??= setTimeout(() => {
        const fallback = options.lastPosition(accountId)
        const current = options.view()
        if (fallback !== null && current) return jump(current, fallback)
        stop()
        options.onSenderNotFound()
      }, SENDER_WAIT_MS)
    },
    { flush: 'post' },
  )
  onBeforeUnmount(stop)

  return { start }
}

const INTERACTIONS = ['keydown', 'pointerdown', 'wheel'] as const
