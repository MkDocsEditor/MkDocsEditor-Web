import {
  mdiCloudCheckOutline,
  mdiCloudOffOutline,
  mdiCloudSyncOutline,
  mdiLockOutline,
} from '@mdi/js'

import type { SessionStatus } from '@/sync'

export interface ConnectionBadge {
  icon: string
  color: string
  text: string
}

/** How the state of the session looks in the title bar. */
export function connectionBadge(status: SessionStatus | undefined): ConnectionBadge | null {
  if (!status) return null
  switch (status.connection) {
    case 'online':
      return status.unsynced
        ? { icon: mdiCloudSyncOutline, color: 'info', text: 'Saving …' }
        : { icon: mdiCloudCheckOutline, color: 'success', text: 'Saved' }
    case 'connecting':
      return { icon: mdiCloudSyncOutline, color: 'info', text: 'Connecting …' }
    case 'offline':
      return {
        icon: mdiCloudOffOutline,
        color: 'warning',
        text: status.unsynced ? 'Offline – changes stay here' : 'Offline',
      }
    case 'snapshot':
      return { icon: mdiLockOutline, color: 'default', text: 'Read only' }
    case 'closed':
      return { icon: mdiCloudOffOutline, color: 'error', text: 'Disconnected' }
  }
  return null
}
