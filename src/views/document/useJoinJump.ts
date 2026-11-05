import { EditorView } from '@codemirror/view'
import { onBeforeUnmount, ref, watch } from 'vue'

import type { Peer } from '@/sync'
import { senderPosition } from '@/sync/senderPosition'

/** How long a join link waits for the first cursor of its sender. */
export const SENDER_WAIT_MS = 5_000

/**
 * The jump of a join link, once: to where the sender is now, or else where the sender was last. It
 * waits a moment for a sender who has no cursor yet, unless the reader has started doing something
 * on the page.
 */
export function useJoinJump(options: {
  view: () => EditorView | null
  ready: () => boolean
  peers: () => readonly Peer[]
  lastPosition: (accountId: string) => number | null
  ownAccountId: () => string | undefined
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
    if (!accountId || accountId === options.ownAccountId()) return
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

  watch(
    () => {
      const accountId = sender.value
      return [
        accountId,
        options.ready(),
        options.view(),
        options.peers(),
        accountId ? options.lastPosition(accountId) : null,
      ] as const
    },
    ([accountId, ready, view, peers, last]) => {
      if (!accountId || !ready || !view) return
      const live = senderPosition(peers, accountId)
      if (live !== null) return jump(view, live)
      // a sender who is online without a cursor may just be about to get one
      const online = peers.some((peer) => peer.accountId === accountId)
      if (!online && last !== null) return jump(view, last)
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
