import { defineStore } from 'pinia'
import { ref } from 'vue'

import { authErrorText } from '@/services/authErrors'
import { canRetry } from '@/services/errors'

import { ReauthCancelled } from './reauth'

export interface Notification {
  id: number
  text: string
  color: 'success' | 'error' | 'info' | 'warning'
  /** Offered as a button. */
  retry?: () => void
  /** Offered as a button with its own label. */
  action?: { label: string; run: () => void }
}

/** Human readable message for an error; a string is such a message already. */
export function describeError(error: unknown): string {
  return typeof error === 'string' ? error : authErrorText(error)
}

/** Snackbar messages. */
export const useNotifyStore = defineStore('notify', () => {
  const queue = ref<Notification[]>([])
  let nextId = 1

  function push(
    text: string,
    color: Notification['color'] = 'info',
    retry?: Notification['retry'],
  ): void {
    queue.value.push({ id: nextId++, text, color, retry })
  }

  return {
    queue,
    push,
    success: (text: string) => push(text, 'success'),
    withAction: (text: string, label: string, run: () => void) => {
      queue.value.push({ id: nextId++, text, color: 'info', action: { label, run } })
    },
    /**
     * `retry` is only offered if trying again can work. Closing the step-up dialog is no failure,
     * so it shows nothing.
     */
    error: (error: unknown, prefix?: string, retry?: () => void) => {
      if (error instanceof ReauthCancelled) return
      push(
        prefix ? `${prefix}: ${describeError(error)}` : describeError(error),
        'error',
        canRetry(error) ? retry : undefined,
      )
    },
    dismiss: (id: number) => {
      queue.value = queue.value.filter((n) => n.id !== id)
    },
  }
})
