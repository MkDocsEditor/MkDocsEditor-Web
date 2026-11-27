import { openResource } from '@/services/resources'

/** Opens a file in a new tab; the browser loads it and shows its own progress. */
export function openFile(id: string): Promise<void> {
  openResource(id)
  return Promise.resolve()
}
