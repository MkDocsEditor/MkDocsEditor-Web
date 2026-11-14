import { onBeforeUnmount, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'

import { useApi } from '@/api'
import type { DocumentChanges } from '@/api'
import type { DocumentSession } from '@/sync'

/**
 * What changed in the page since the user last saw it (`GET …/changes/`), and remembering what
 * they saw (`PUT …/seen/`): when they dismiss the changes, and when they leave the page, at the
 * text they had then. A first visit shows nothing; it only starts remembering.
 */
export function useChangesSinceVisit(
  id: () => string,
  session: Readonly<Ref<DocumentSession | null>>,
  ready: Readonly<Ref<boolean>>,
) {
  /** Set while there are changes to show. */
  const changes = shallowRef<DocumentChanges | null>(null)
  /** The page being looked at; `token` is what the server last said it is at. */
  let visit: { id: string; session: DocumentSession; token: string | null } | null = null

  function markSeen(docId: string, token: string, keepalive = false): void {
    // a 409 (heads the server does not know) or a backend without it: nothing to remember
    void useApi()
      .markSeen(docId, token, keepalive)
      .catch(() => undefined)
  }

  function leave(keepalive = false): void {
    const left = visit
    visit = null
    changes.value = null
    if (!left) return
    const token = left.session.sharedRevision() ?? left.token
    if (token) markSeen(left.id, token, keepalive)
  }

  async function load(current: DocumentSession): Promise<void> {
    const docId = id()
    visit = { id: docId, session: current, token: null }
    let answer: DocumentChanges | null = null
    try {
      answer = await useApi().getChanges(docId)
    } catch {
      return // the page works without
    }
    if (visit?.session !== current || !answer) return
    visit.token = answer.seenToken
    if (answer.since && answer.hunks.length > 0) changes.value = answer
  }

  watch(
    () => [ready.value, session.value] as const,
    ([isReady, current]) => {
      if (visit && visit.session !== current) leave()
      if (isReady && current && !visit) void load(current)
    },
    { immediate: true },
  )
  // a rename on the server keeps the session; the page is the same
  watch(id, (current) => {
    if (visit && visit.session === session.value) visit.id = current
  })

  const onPageHide = () => leave(true)
  window.addEventListener('pagehide', onPageHide)
  onBeforeUnmount(() => {
    window.removeEventListener('pagehide', onPageHide)
    leave(true)
  })

  /** The user has seen the changes: they are not shown again. */
  function dismiss(): void {
    const shown = changes.value
    changes.value = null
    if (visit && shown) markSeen(visit.id, shown.seenToken)
  }

  return { changes, dismiss }
}
