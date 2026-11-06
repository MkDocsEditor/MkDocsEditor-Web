import { openResource } from '@/services/resources'
import { useTransfersStore } from '@/stores/transfers'

/**
 * Opens a file in a new tab, with the progress of a big download in the transfers indicator.
 * `track` starts the work right away, so the tab still opens within the click.
 */
export function openFile(id: string, name: string): Promise<void> {
  return useTransfersStore().track(`Opening “${name}”`, (transfer) =>
    openResource(id, transfer.progress),
  )
}
