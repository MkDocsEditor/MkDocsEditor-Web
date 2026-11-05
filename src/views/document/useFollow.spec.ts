import { mount } from '@vue/test-utils'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref, shallowRef } from 'vue'

import { scrollToCenter } from '@/editor/scrollToCenter'
import type { Ghost, Peer } from '@/sync'

import {
  FOLLOW_BACKOFF_WINDOW_MS,
  FOLLOW_RESUME_MAX_MS,
  FOLLOW_RESUME_MS,
  useFollow,
} from './useFollow'

vi.mock('@/editor/scrollToCenter', () => ({ scrollToCenter: vi.fn() }))

const anna = (head?: number): Peer => ({
  clientId: 'c-1',
  instanceId: 'anna',
  accountId: 'anna',
  username: 'anna',
  displayName: 'Anna',
  color: '#000',
  selections: head === undefined ? [] : [{ anchor: head, head }],
})

const annaGhost = (head: number): Ghost => ({
  instanceId: 'anna',
  accountId: 'anna',
  username: 'anna',
  displayName: 'Anna',
  color: '#000',
  selections: [{ anchor: head, head }],
})

function setup() {
  const view = new EditorView({
    state: EditorState.create({ doc: 'x'.repeat(100), selection: { anchor: 3 } }),
  })
  const dispatch = vi.spyOn(view, 'dispatch')
  const scroll = vi.mocked(scrollToCenter)
  scroll.mockClear()
  const currentView = shallowRef<EditorView | null>(null)
  const peers = shallowRef<Peer[]>([anna(10)])
  const ghosts = shallowRef<Ghost[]>([])
  const known = ref(true)
  const ended = vi.fn()
  let follow!: ReturnType<typeof useFollow>
  const wrapper = mount(
    defineComponent({
      setup() {
        follow = useFollow({
          view: () => currentView.value,
          peers: () => peers.value,
          ghosts: () => ghosts.value,
          presenceKnown: () => known.value,
          onEnded: ended,
        })
        return () => null
      },
    }),
  )
  currentView.value = view
  return { wrapper, view, dispatch, scroll, peers, ghosts, known, ended, follow }
}

describe('useFollow', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  it('scrolls to the account without moving the local cursor', async () => {
    const { wrapper, view, dispatch, scroll, peers, follow } = setup()
    await nextTick()
    follow.start('anna')
    await nextTick()
    expect(follow.following.value).toEqual({ instanceId: 'anna', name: 'Anna' })
    expect(scroll).toHaveBeenCalledExactlyOnceWith(view, 10)
    expect(dispatch).not.toHaveBeenCalled()
    peers.value = [anna(20)]
    await nextTick()
    expect(scroll).toHaveBeenLastCalledWith(view, 20)
    expect(view.state.selection.main.head).toBe(3)
    wrapper.unmount()
  })

  it('centers the middle of a viewport', async () => {
    const { wrapper, view, scroll, peers, follow } = setup()
    peers.value = [{ ...anna(), viewport: { top: 10, bottom: 30 } }]
    await nextTick()
    follow.start('anna')
    await nextTick()
    expect(scroll).toHaveBeenCalledWith(view, 20)
    wrapper.unmount()
  })

  it('pauses on manual input, and catches up after the last of it', async () => {
    const { wrapper, view, scroll, peers, follow } = setup()
    await nextTick()
    follow.start('anna')
    await nextTick()
    scroll.mockClear()
    view.scrollDOM.dispatchEvent(new Event('wheel'))
    expect(follow.paused.value).toBe(true)
    peers.value = [anna(20)]
    await nextTick()
    expect(scroll).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(FOLLOW_RESUME_MS - 1)
    // inertia after the input keeps it paused
    view.scrollDOM.dispatchEvent(new Event('scroll'))
    await vi.advanceTimersByTimeAsync(FOLLOW_RESUME_MS - 1)
    expect(follow.paused.value).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(follow.paused.value).toBe(false)
    expect(scroll).toHaveBeenCalledExactlyOnceWith(view, 20)
    wrapper.unmount()
  })

  it('waits longer when the user moves again right after it resumed, up to the limit', async () => {
    const { wrapper, view, follow } = setup()
    await nextTick()
    follow.start('anna')
    const moveAndExpectPause = async (ms: number) => {
      view.scrollDOM.dispatchEvent(new Event('wheel'))
      await vi.advanceTimersByTimeAsync(ms - 1)
      expect(follow.paused.value).toBe(true)
      await vi.advanceTimersByTimeAsync(1)
      expect(follow.paused.value).toBe(false)
    }
    for (const ms of [
      FOLLOW_RESUME_MS,
      10_000,
      20_000,
      FOLLOW_RESUME_MAX_MS,
      FOLLOW_RESUME_MAX_MS,
    ]) {
      await moveAndExpectPause(ms)
    }
    wrapper.unmount()
  })

  it('counts several inputs of one pause only once for the longer wait', async () => {
    const { wrapper, view, follow } = setup()
    await nextTick()
    follow.start('anna')
    view.scrollDOM.dispatchEvent(new Event('wheel'))
    await vi.advanceTimersByTimeAsync(FOLLOW_RESUME_MS)
    view.scrollDOM.dispatchEvent(new Event('wheel'))
    view.scrollDOM.dispatchEvent(new Event('wheel'))
    view.scrollDOM.dispatchEvent(new Event('wheel'))
    await vi.advanceTimersByTimeAsync(2 * FOLLOW_RESUME_MS)
    expect(follow.paused.value).toBe(false)
    wrapper.unmount()
  })

  it('starts at the short wait again when the last resume is long ago', async () => {
    const { wrapper, view, follow } = setup()
    await nextTick()
    follow.start('anna')
    view.scrollDOM.dispatchEvent(new Event('wheel'))
    await vi.advanceTimersByTimeAsync(FOLLOW_RESUME_MS)
    view.scrollDOM.dispatchEvent(new Event('wheel'))
    await vi.advanceTimersByTimeAsync(2 * FOLLOW_RESUME_MS)
    await vi.advanceTimersByTimeAsync(FOLLOW_BACKOFF_WINDOW_MS + 1)
    view.scrollDOM.dispatchEvent(new Event('wheel'))
    await vi.advanceTimersByTimeAsync(FOLLOW_RESUME_MS)
    expect(follow.paused.value).toBe(false)
    wrapper.unmount()
  })

  it('does not treat its own scrolling as manual input', async () => {
    const { wrapper, view, follow } = setup()
    await nextTick()
    follow.start('anna')
    await nextTick()
    view.scrollDOM.dispatchEvent(new Event('scroll'))
    expect(follow.paused.value).toBe(false)
    wrapper.unmount()
  })

  it('goes on with the ghost, and ends with it', async () => {
    const { wrapper, view, scroll, peers, ghosts, ended, follow } = setup()
    await nextTick()
    follow.start('anna')
    await nextTick()
    scroll.mockClear()
    peers.value = []
    ghosts.value = [annaGhost(40)]
    await nextTick()
    expect(follow.following.value).not.toBeNull()
    expect(scroll).toHaveBeenCalledExactlyOnceWith(view, 40)
    ghosts.value = []
    await nextTick()
    expect(follow.following.value).toBeNull()
    expect(ended).toHaveBeenCalledWith('Anna')
    wrapper.unmount()
  })

  it('does not end while disconnected, and resumes when the account is back', async () => {
    const { wrapper, peers, known, ended, follow } = setup()
    await nextTick()
    follow.start('anna')
    await nextTick()
    known.value = false
    peers.value = []
    await nextTick()
    expect(follow.following.value).not.toBeNull()
    peers.value = [anna(30)]
    known.value = true
    await nextTick()
    expect(follow.following.value).not.toBeNull()
    expect(ended).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ends without a note when stopped by the user, and replaces the followed account', async () => {
    const { wrapper, peers, ended, follow } = setup()
    peers.value = [
      anna(10),
      { ...anna(20), clientId: 'c-2', instanceId: 'bob', displayName: 'Bob' },
    ]
    await nextTick()
    follow.start('anna')
    follow.start('bob')
    expect(follow.following.value?.name).toBe('Bob')
    follow.stop()
    await nextTick()
    expect(follow.following.value).toBeNull()
    expect(ended).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
