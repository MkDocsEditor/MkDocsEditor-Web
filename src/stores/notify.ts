import { defineStore } from 'pinia'
import { ref } from 'vue'

import { authErrorText } from '@/services/authErrors'

export interface Notification {
  id: number
  text: string
  color: 'success' | 'error' | 'info' | 'warning'
}

/** Human readable message for an error; a string is such a message already. */
export function describeError(error: unknown): string {
  return typeof error === 'string' ? error : authErrorText(error)
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
