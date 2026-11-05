import { mount } from '@vue/test-utils'
import type { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref, shallowRef } from 'vue'

import type { Peer } from '@/sync'

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
  const ready = ref(true)
  const last = ref<number | null>(null)
  const notFound = vi.fn()
  let start: (accountId: string | undefined) => void = () => {}
  const wrapper = mount(
    defineComponent({
      setup() {
        const jump = useJoinJump({
          view: () => view,
          ready: () => ready.value,
          peers: () => peers.value,
          lastPosition: () => last.value,
          ownAccountId: () => own,
          onSenderNotFound: notFound,
        })
        start = jump.start
        return () => null
      },
    }),
  )
  return { wrapper, dispatch, focus, peers, ready, last, notFound, start }
}

describe('useJoinJump', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  it('jumps once to the sender, who is already there', async () => {
    const { wrapper, dispatch, focus, peers, start } = setup()
    peers.value = [peer('sender', 42)]
    start('sender')
    await nextTick()
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]![0].selection).toEqual({ anchor: 42 })
    expect(focus).toHaveBeenCalled()
    peers.value = [peer('sender', 50)]
    await nextTick()
    expect(dispatch).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('waits until the text is ready, and for the first cursor of the sender', async () => {
    const { wrapper, dispatch, peers, ready, notFound, start } = setup()
    ready.value = false
    peers.value = [peer('sender')]
    start('sender')
    await nextTick()
    ready.value = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(SENDER_WAIT_MS - 1)
    peers.value = [peer('sender', 7)]
    await nextTick()
    expect(dispatch.mock.calls[0]![0].selection).toEqual({ anchor: 7 })
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

  it('goes to the last position of a sender who is offline, right away', async () => {
    const { wrapper, dispatch, last, notFound, start } = setup()
    start('sender')
    await nextTick()
    last.value = 30
    await nextTick()
    expect(dispatch.mock.calls[0]![0].selection).toEqual({ anchor: 30 })
    await vi.advanceTimersByTimeAsync(SENDER_WAIT_MS)
    expect(notFound).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('prefers the live cursor, and waits for it while the sender is online', async () => {
    const { wrapper, dispatch, peers, last, start } = setup()
    last.value = 30
    peers.value = [peer('sender')]
    start('sender')
    await nextTick()
    expect(dispatch).not.toHaveBeenCalled()
    peers.value = [peer('sender', 7)]
    await nextTick()
    expect(dispatch.mock.calls[0]![0].selection).toEqual({ anchor: 7 })
    wrapper.unmount()
  })

  it('falls back to the last position when an online sender gets no cursor', async () => {
    const { wrapper, dispatch, peers, last, notFound, start } = setup()
    last.value = 30
    peers.value = [peer('sender')]
    start('sender')
    await nextTick()
    await vi.advanceTimersByTimeAsync(SENDER_WAIT_MS)
    expect(dispatch.mock.calls[0]![0].selection).toEqual({ anchor: 30 })
    expect(notFound).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('leaves a reader alone who has started doing something', async () => {
    const { wrapper, dispatch, peers, notFound, start } = setup()
    start('sender')
    await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    peers.value = [peer('sender', 7)]
    await nextTick()
    await vi.advanceTimersByTimeAsync(SENDER_WAIT_MS)
    expect(dispatch).not.toHaveBeenCalled()
    expect(notFound).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('skips the jump for the own link', async () => {
    const { wrapper, dispatch, peers, notFound, start } = setup('me')
    peers.value = [peer('me', 7)]
    start('me')
    await nextTick()
    await vi.advanceTimersByTimeAsync(SENDER_WAIT_MS)
    expect(dispatch).not.toHaveBeenCalled()
    expect(notFound).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
