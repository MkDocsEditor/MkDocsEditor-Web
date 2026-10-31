import {
  mdiFileDocumentOutline,
  mdiFileOutline,
  mdiFilePdfBox,
  mdiFolderOutline,
  mdiImageOutline,
} from '@mdi/js'

import type { TreeItem } from '@/api'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function isImage(name: string): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(name))
}

export function iconFor(item: TreeItem): string {
  if (item.type === 'section') return mdiFolderOutline
  if (item.type === 'document') return mdiFileDocumentOutline
  if (isImage(item.name)) return mdiImageOutline
  if (extensionOf(item.name) === 'pdf') return mdiFilePdfBox
  return mdiFileOutline
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
