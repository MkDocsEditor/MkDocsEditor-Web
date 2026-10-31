import { defineStore } from 'pinia'
import { ref } from 'vue'

import { ApiError } from '@/api'

export interface Notification {
  id: number
  text: string
  color: 'success' | 'error' | 'info' | 'warning'
}

/** Human readable German message for an error. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkError) return 'Der Server ist gerade nicht erreichbar.'
    if (error.isUnauthorized) return 'Bitte melde dich neu an.'
    if (error.status === 409) return `Das geht gerade nicht: ${error.message}`
    if (error.status === 404) return 'Das gibt es nicht (mehr).'
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
