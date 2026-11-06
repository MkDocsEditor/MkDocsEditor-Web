import { defineStore } from 'pinia'
import { ref } from 'vue'

/** A long action that is under way: an upload, a download or a delete. */
export interface Transfer {
  id: number
  label: string
  /** Bytes so far; null for actions without bytes (a delete). */
  loaded: number | null
  total: number | null
  /** The last sign of life: the start, or the last progress. */
  lastProgressAt: number
  startedAt: number
}

export interface TransferHandle {
  progress(loaded: number, total: number | null): void
  /** Another step of the same action, such as the next file. */
  relabel(label: string): void
}

/**
 * Long actions, shown together by `TransferIndicator`. An action has no time limit: as long as
 * no error comes back, the server is still working on it, and the indicator says so.
 */
export const useTransfersStore = defineStore('transfers', () => {
  const active = ref<Transfer[]>([])
  let nextId = 1

  function update(id: number, change: Partial<Transfer>): void {
    active.value = active.value.map((t) => (t.id === id ? { ...t, ...change } : t))
  }

  /** Runs `work` as a transfer: shown while it runs, gone when it ends either way. */
  async function track<T>(label: string, work: (handle: TransferHandle) => Promise<T>): Promise<T> {
    const id = nextId++
    const now = Date.now()
    active.value = [
      ...active.value,
      { id, label, loaded: null, total: null, lastProgressAt: now, startedAt: now },
    ]
    try {
      return await work({
        progress: (loaded, total) => update(id, { loaded, total, lastProgressAt: Date.now() }),
        relabel: (next) =>
          update(id, { label: next, loaded: null, total: null, lastProgressAt: Date.now() }),
      })
    } finally {
      active.value = active.value.filter((t) => t.id !== id)
    }
  }

  return { active, track }
})
