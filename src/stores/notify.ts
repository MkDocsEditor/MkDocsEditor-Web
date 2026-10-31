import { defineStore } from 'pinia'
import { ref } from 'vue'

import { ApiError } from '@/api'
import { describeAuthError } from '@/services/authErrors'

export interface Notification {
  id: number
  text: string
  color: 'success' | 'error' | 'info' | 'warning'
}

/** Human readable message for an error. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const known = describeAuthError(error)
    if (known) return known
    if (error.isNetworkError) return 'The server is not reachable right now.'
    if (error.isUnauthorized) return 'Please sign in again.'
    if (error.status === 409) return `Not possible right now: ${error.message}`
    if (error.status === 404) return 'This does not exist (any more).'
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}

/** Snackbar messages. */
export const useNotifyStore = defineStore('notify', () => {
  const queue = ref<Notification[]>([])
  let nextId = 1

  function push(text: string, color: Notification['color'] = 'info'): void {
    queue.value.push({ id: nextId++, text, color })
  }

  return {
    queue,
    push,
    success: (text: string) => push(text, 'success'),
    error: (error: unknown, prefix?: string) =>
      push(prefix ? `${prefix}: ${describeError(error)}` : describeError(error), 'error'),
    dismiss: (id: number) => {
      queue.value = queue.value.filter((n) => n.id !== id)
    },
  }
})
