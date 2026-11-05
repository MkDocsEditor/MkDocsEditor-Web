import type { EditorView } from '@codemirror/view'
import { EditorView as CodeMirror } from '@codemirror/view'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import type { Ghost, Peer } from '@/sync'
import { followTarget, isPresent } from '@/sync/followTarget'
import { instanceName } from '@/sync/session'

/** How long following waits after the last manual movement of this user. */
export const FOLLOW_RESUME_MS = 5_000
/** Moving again this soon after following resumed doubles the wait, because it came too early. */
export const FOLLOW_BACKOFF_WINDOW_MS = 10_000
export const FOLLOW_RESUME_MAX_MS = 40_000

const MANUAL_INPUT = ['wheel', 'pointerdown', 'touchmove', 'keydown'] as const

/**
 * Keeps the editor on what another instance is looking at, without touching the local cursor.
 * Moving the view by hand only pauses it, like the navigation of a map. It ends when the instance
 * is neither here nor a ghost; while disconnected nobody knows, so that does not end it.
 */
export function useFollow(options: {
  view: () => EditorView | null
  peers: () => readonly Peer[]
  ghosts: () => readonly Ghost[]
  presenceKnown: () => boolean
  onEnded: (name: string) => void
}) {
  const following = ref<{ instanceId: string; name: string } | null>(null)
  const paused = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  let resumeMs = FOLLOW_RESUME_MS
  /** When following last resumed by itself; null if it has not. */
  let resumedAt: number | null = null

  function clearTimer(): void {
    if (timer) clearTimeout(timer)
    timer = null
  }

  function nameOf(instanceId: string): string {
    const who =
      options.peers().find((p) => p.instanceId === instanceId) ??
      options.ghosts().find((g) => g.instanceId === instanceId)
    return who ? instanceName(who) : ''
  }

  function reset(): void {
    clearTimer()
    paused.value = false
    resumeMs = FOLLOW_RESUME_MS
    resumedAt = null
  }

  function start(instanceId: string): void {
    reset()
    following.value = { instanceId, name: nameOf(instanceId) }
  }

  function stop(): void {
    reset()
    following.value = null
  }

  /** The user moves the view: following waits until they have stopped. */
  function pause(): void {
    if (!following.value) return
    if (!paused.value) {
      const tooEarly = resumedAt !== null && Date.now() - resumedAt <= FOLLOW_BACKOFF_WINDOW_MS
      resumeMs = tooEarly ? Math.min(resumeMs * 2, FOLLOW_RESUME_MAX_MS) : FOLLOW_RESUME_MS
    }
    paused.value = true
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      resumedAt = Date.now()
      paused.value = false
    }, resumeMs)
  }

  /** A scroll that goes on after the input, such as inertia or the scrollbar, counts as well. */
  function onScroll(): void {
    if (paused.value) pause()
  }

  /** The position to center: on any screen size, the middle of what the other user sees. */
  const middle = computed(() => {
    if (!following.value) return null
    const target = followTarget(options.peers(), options.ghosts(), following.value.instanceId)
    return target && Math.round((target.top + target.bottom) / 2)
  })

  watch(
    [middle, paused, options.view] as const,
    ([position, isPaused, view]) => {
      if (position === null || isPaused || !view) return
      view.dispatch({
        effects: CodeMirror.scrollIntoView(Math.min(position, view.state.doc.length), {
          y: 'center',
        }),
      })
    },
    { flush: 'post' },
  )

  watch(
    () =>
      !!following.value &&
      options.presenceKnown() &&
      !isPresent(options.peers(), options.ghosts(), following.value.instanceId),
    (ended) => {
      if (!ended) return
      const name = following.value?.name ?? ''
      stop()
      options.onEnded(name)
    },
    { flush: 'post' },
  )

  function listen(view: EditorView, add: boolean): void {
    const method = add ? 'addEventListener' : 'removeEventListener'
    for (const event of MANUAL_INPUT) view.scrollDOM[method](event, pause, { passive: true })
    view.scrollDOM[method]('scroll', onScroll, { passive: true })
  }

  watch(options.view, (view, old) => {
    if (old) listen(old, false)
    if (view) listen(view, true)
  })

  onBeforeUnmount(() => {
    clearTimer()
    const view = options.view()
    if (view) listen(view, false)
  })

  return { following, paused, start, stop }
}
