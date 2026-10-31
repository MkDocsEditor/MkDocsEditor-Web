import { useApi } from '@/api'

/**
 * Opens a resource in a new tab. The content needs auth, so it is downloaded first and shown
 * through an object URL. The tab is opened before the download so popup blockers allow it.
 */
export async function openResource(id: string): Promise<void> {
  const tab = window.open('', '_blank')
  try {
    const blob = await useApi().getResourceContent(id)
    const url = URL.createObjectURL(blob)
    if (tab) tab.location.href = url
    else window.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    tab?.close()
    throw error
  }
}
