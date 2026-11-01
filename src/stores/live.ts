import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

import { useApi } from '@/api'
import type { MovedItem } from '@/api'
import { connectEvents } from '@/services/events'
import type { EventsConnection, OnlineUser } from '@/services/events'
import { followMoves, rescueStoredCopies } from '@/services/redirects'
import type { SocketLike } from '@/sync/automergeSession'

import { useTreeStore } from './tree'

/** Live updates from the server: tree changes and who has which page open. */
export const useLiveStore = defineStore('live', () => {
  const online = shallowRef<Map<string, OnlineUser[]>>(new Map())
  let connection: EventsConnection | null = null
  let reloadRunning = false
  let reloadAgain = false
  const moveListeners = new Set<(moves: MovedItem[]) => void>()

  /** Registers a listener for moved items (to update the route); returns the unregister. */
  function onItemsMoved(listener: (moves: MovedItem[]) => void): () => void {
    moveListeners.add(listener)
    return () => moveListeners.delete(listener)
  }

  function itemsMoved(moves: MovedItem[]): void {
    void followMoves(moves)
    for (const listener of moveListeners) listener(moves)
  }

  /** Reloads the tree; changes arriving during a reload trigger one more. */
  async function reloadTree(): Promise<void> {
    if (reloadRunning) {
      reloadAgain = true
      return
    }
    reloadRunning = true
    try {
      const tree = useTreeStore()
      do {
        reloadAgain = false
        await tree.load().catch(() => undefined)
      } while (reloadAgain)
      if (tree.root) void rescueStoredCopies((id) => tree.get(id) !== undefined)
    } finally {
      reloadRunning = false
    }
  }

  function start(
    options: { createSocket?: (url: string) => SocketLike; onUnauthorized?: () => void } = {},
  ): void {
    if (connection) return
    const api = useApi()
    connection = connectEvents({
      wsTicket: () => api.wsTicket(),
      wsUrl: (path) => api.wsUrl(path),
      createSocket: options.createSocket,
      clientName: `MkDocsEditor-Web/${import.meta.env.VITE_APP_VERSION ?? 'dev'}`,
      onTreeChanged: () => void reloadTree(),
      onItemsMoved: itemsMoved,
      onOnline: (documents) => (online.value = documents),
      onUnauthorized: options.onUnauthorized,
    })
  }

  function stop(): void {
    connection?.close()
    connection = null
    online.value = new Map()
  }

  function usersOf(documentId: string): OnlineUser[] {
    return online.value.get(documentId) ?? []
  }

  return { online, start, stop, usersOf, reloadTree, onItemsMoved }
})
