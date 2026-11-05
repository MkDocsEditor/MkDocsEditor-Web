import { mount } from '@vue/test-utils'
import type { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref, shallowRef } from 'vue'

import type { Ghost, Peer } from '@/sync'

import { SENDER_WAIT_MS, useJoinJump } from './useJoinJump'

function peer(accountId: string, head?: number): Peer {
  return {
    clientId: `c-${accountId}`,
    accountId,
    username: accountId,
    displayName: accountId,
    color: '#000',
    selections: head === undefined ? [] : [{ anchor: head, head }],
  }
}

function setup(own = 'me') {
  const dispatch = vi.fn()
  const focus = vi.fn()
  const view = { state: { doc: { length: 100 } }, dispatch, focus } as unknown as EditorView
  const peers = shallowRef<Peer[]>([])
  const ghosts = shallowRef<Ghost[]>([])
  const known = ref(true)
  const ready = ref(true)
  const last = ref<number | null>(null)
  const notFound = vi.fn()
  const onFollow = vi.fn()
  let start: (accountId: string | undefined) => void = () => {}
  const wrapper = mount(
    defineComponent({
      setup() {
        const jump = useJoinJump({
          view: () => view,
          ready: () => ready.value,
          peers: () => peers.value,
          ghosts: () => ghosts.value,
          presenceKnown: () => known.value,
          lastPosition: () => last.value,
          ownAccountId: () => own,
          onFollow,
          onSenderNotFound: notFound,
        })
        start = jump.start
        return () => null
      },
    }),
  )
  return { wrapper, dispatch, focus, peers, ghosts, known, ready, last, notFound, onFollow, start }
}

describe('useJoinJump', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  it('follows a sender who is here, without moving the caret', async () => {
    const { wrapper, dispatch, focus, peers, onFollow, start } = setup()
    peers.value = [peer('sender', 42)]
    start('sender')
    await nextTick()
    expect(onFollow).toHaveBeenCalledExactlyOnceWith('sender')
    expect(dispatch).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
    peers.value = [peer('sender', 50)]
    await nextTick()
    expect(onFollow).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('follows a sender who is a ghost', async () => {
    const { wrapper, ghosts, onFollow, start } = setup()
    ghosts.value = [
      {
        accountId: 'sender',
        username: 'sender',
        displayName: 'sender',
        color: '#000',
        selections: [{ anchor: 5, head: 5 }],
      },
    ]
    start('sender')
    await nextTick()
    expect(onFollow).toHaveBeenCalledWith('sender')
    wrapper.unmount()
  })

  it('follows a sender without a cursor, and shows where they were last until then', async () => {
    const { wrapper, dispatch, peers, last, onFollow, start } = setup()
    last.value = 30
    peers.value = [peer('sender')]
    start('sender')
    await nextTick()
    expect(onFollow).toHaveBeenCalledWith('sender')
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]![0]).not.toHaveProperty('selection')
    wrapper.unmount()
  })

  it('waits until the text is ready and it knows who is here', async () => {
    const { wrapper, peers, known, ready, onFollow, notFound, start } = setup()
    ready.value = false
    known.value = false
    peers.value = []
    start('sender')
    await nextTick()
    ready.value = true
    await nextTick()
    expect(onFollow).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(SENDER_WAIT_MS - 1)
    known.value = true
    peers.value = [peer('sender', 7)]
    await nextTick()
    expect(onFollow).toHaveBeenCalledWith('sender')
    await vi.advanceTimersByTimeAsync(10)
    expect(notFound).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('gives a note when the sender does not show up', async () => {
    const { wrapper, dispatch, notFound, start } = setup()
    start('sender')
    await nextTick()
    await vi.advanceTimersByTimeAsync(SENDER_WAIT_MS)
    expect(notFound).toHaveBeenCalledTimes(1)
    expect(dispatch).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('only goes to the last position of a sender who is fully away', async () => {
    const { wrapper, dispatch, focus, last, notFound, onFollow, start } = setup()
    start('sender')
    await nextTick()
    last.value = 30
    await nextTick()
    expect(dispatch.mock.calls[0]![0].selection).toEqual({ anchor: 30 })
    expect(focus).toHaveBeenCalled()
    expect(onFollow).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(SENDER_WAIT_MS)
    expect(notFound).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('leaves a reader alone who has started doing something', async () => {
    const { wrapper, dispatch, known, peers, notFound, onFollow, start } = setup()
    known.value = false
    start('sender')
    await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    known.value = true
    peers.value = [peer('sender', 7)]
    await nextTick()
    await vi.advanceTimersByTimeAsync(SENDER_WAIT_MS)
    expect(dispatch).not.toHaveBeenCalled()
    expect(onFollow).not.toHaveBeenCalled()
    expect(notFound).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does nothing for the own link', async () => {
    const { wrapper, dispatch, peers, notFound, onFollow, start } = setup('me')
    peers.value = [peer('me', 7)]
    start('me')
    await nextTick()
    await vi.advanceTimersByTimeAsync(SENDER_WAIT_MS)
    expect(dispatch).not.toHaveBeenCalled()
    expect(onFollow).not.toHaveBeenCalled()
    expect(notFound).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
