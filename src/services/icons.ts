import {
  mdiFileDocumentOutline,
  mdiFileMusicOutline,
  mdiFilePdfBox,
  mdiFileVideoOutline,
  mdiFolderOutline,
  mdiFolderZipOutline,
  mdiImageOutline,
  mdiPaperclip,
  mdiTextBoxOutline,
} from '@mdi/js'

import type { ResourceKind, ResourceModel, TreeItem } from '@/api'

const KIND_BY_EXTENSION: Record<string, ResourceKind> = {}
const EXTENSIONS: Record<Exclude<ResourceKind, 'other'>, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico', 'tif', 'tiff'],
  video: ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'ogv'],
  audio: ['mp3', 'ogg', 'oga', 'wav', 'flac', 'm4a', 'opus', 'aac'],
  pdf: ['pdf'],
  text: ['txt', 'csv', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'log', 'css', 'js', 'html'],
  archive: ['zip', 'gz', 'tgz', 'tar', '7z', 'rar', 'bz2', 'xz'],
}
for (const [kind, extensions] of Object.entries(EXTENSIONS)) {
  for (const ext of extensions) KIND_BY_EXTENSION[ext] = kind as ResourceKind
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function isImage(name: string): boolean {
  return KIND_BY_EXTENSION[extensionOf(name)] === 'image'
}

/** The kind of a resource: from the backend when it sends one, else from the file extension. */
export function resourceKind(resource: Pick<ResourceModel, 'name' | 'kind'>): ResourceKind {
  return resource.kind ?? KIND_BY_EXTENSION[extensionOf(resource.name)] ?? 'other'
}

const KIND_ICONS: Record<ResourceKind, string> = {
  image: mdiImageOutline,
  video: mdiFileVideoOutline,
  audio: mdiFileMusicOutline,
  pdf: mdiFilePdfBox,
  text: mdiTextBoxOutline,
  archive: mdiFolderZipOutline,
  other: mdiPaperclip,
}

export const KIND_LABELS: Record<ResourceKind, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  pdf: 'PDF',
  text: 'Text file',
  archive: 'Archive',
  other: 'File',
}

export function iconFor(item: TreeItem): string {
  if (item.type === 'section') return mdiFolderOutline
  if (item.type === 'document') return mdiFileDocumentOutline
  return KIND_ICONS[resourceKind(item)]
}

/**
 * Theme colour of an item's icon (see `plugins/vuetify.ts`): folders blue and pages green like
 * in the Android app, files by kind.
 */
export function colorFor(item: TreeItem): string {
  if (item.type === 'section') return 'item-section'
  if (item.type === 'document') return 'item-document'
  return `kind-${resourceKind(item)}`
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
