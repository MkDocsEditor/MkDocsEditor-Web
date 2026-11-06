import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getAvatar = vi.fn()
vi.mock('@/api', () => ({ useApi: () => ({ getAvatar }) }))

import { clearAvatarUrls } from '@/services/avatars'

import { remoteCursors, setPeers } from './remoteCursors'
import type { ShownPeer } from './remoteCursors'

const anna: ShownPeer = {
  username: 'anna',
  displayName: 'Anna',
  color: '#123456',
  selections: [{ anchor: 2, head: 2 }],
}

function show(peer: ShownPeer): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc: 'Hallo Welt', extensions: remoteCursors() }),
    parent: document.body,
  })
  view.dispatch({ effects: setPeers.of([peer]) })
  return view
}

describe('remote cursors', () => {
  beforeEach(() => {
    getAvatar.mockReset().mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
    URL.createObjectURL = vi.fn(() => 'blob:anna')
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => {
    clearAvatarUrls()
    document.body.innerHTML = ''
  })

  it('shows only the name without a picture', async () => {
    const view = show(anna)
    await vi.waitFor(() => expect(view.dom.querySelector('.cm-remote-caret-label')).not.toBeNull())
    expect(view.dom.querySelector('.cm-remote-caret-label')!.textContent).toBe('Anna')
    expect(view.dom.querySelector('.cm-remote-caret-avatar')).toBeNull()
    expect(getAvatar).not.toHaveBeenCalled()
  })

  it('puts the picture in front of the name', async () => {
    const view = show({ ...anna, accountId: 'a-1', avatar: 'ab12' })
    await vi.waitFor(() =>
      expect(view.dom.querySelector('.cm-remote-caret-avatar')?.getAttribute('src')).toBe(
        'blob:anna',
      ),
    )
    const label = view.dom.querySelector('.cm-remote-caret-label')!
    expect(label.firstElementChild?.className).toBe('cm-remote-caret-avatar')
    expect(label.textContent).toBe('Anna')
    expect(getAvatar).toHaveBeenCalledWith('a-1', 'ab12')
  })
})
