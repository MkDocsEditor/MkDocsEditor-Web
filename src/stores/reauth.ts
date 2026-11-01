import { defineStore } from 'pinia'
import { ref } from 'vue'

import { ApiError } from '@/api'

/** The user closed the confirmation dialog: the action did not run. */
export class ReauthCancelled extends Error {
  constructor() {
    super('Abgebrochen')
    this.name = 'ReauthCancelled'
  }
}

function isReauthRequired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403 && error.code === 'reauth-required'
}

/**
 * Step-up for sensitive actions. `run` performs the action; when the backend asks for a recent
 * authentication (403 `reauth-required`), it opens the confirmation dialog (`ReauthDialog`) and
 * retries the action once after a successful confirmation.
 */
export const useReauthStore = defineStore('reauth', () => {
  const open = ref(false)
  let pending: ((confirmed: boolean) => void) | null = null

  /** Opens the dialog; resolves to true after a successful confirmation. */
  function prompt(): Promise<boolean> {
    pending?.(false)
    open.value = true
    return new Promise((resolve) => {
      pending = resolve
    })
  }

  /** Called by the dialog. */
  function finish(confirmed: boolean): void {
    open.value = false
    const resolve = pending
    pending = null
    resolve?.(confirmed)
  }

  async function run<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action()
    } catch (error) {
      if (!isReauthRequired(error)) throw error
      if (!(await prompt())) throw new ReauthCancelled()
      return action()
    }
  }

  return { open, prompt, finish, run }
})
