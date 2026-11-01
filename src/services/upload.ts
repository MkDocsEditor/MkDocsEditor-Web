import type { SectionModel } from '@/api'

import { extensionOf } from './icons'
import { encodeSegment } from './linkPath'

/** Makes a file name safe for the wiki: no path separators or reserved characters. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize('NFC')
    .replace(/[/\\:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
  return cleaned === '' ? 'file' : cleaned
}

/** A name that does not exist in the section yet: `Foto.jpg`, `Foto (2).jpg`, … */
export function uniqueName(section: SectionModel, name: string): string {
  const taken = new Set(section.resources.map((r) => r.name.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  // keep the extension as written (extensionOf lowercases it)
  const ext = name.slice(name.length - extensionOf(name).length)
  const base = ext ? name.slice(0, -(ext.length + 1)) : name
  for (let i = 2; ; i++) {
    const candidate = ext ? `${base} (${i}).${ext}` : `${base} (${i})`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

/**
 * Markdown that embeds (images) or links (other files) a resource, like the backend's
 * `GET /link/`: `![name without extension](dest)` or `[file name](dest)`. The destination
 * defaults to a file in the same folder.
 */
export function markdownFor(
  name: string,
  isImage: boolean,
  destination = encodeSegment(name),
): string {
  const label = (isImage ? name.replace(/\.[^.]+$/, '') : name).replace(/[[\]]/g, '')
  return isImage ? `![${label}](${destination})` : `[${label}](${destination})`
}

/** Photos from phones are huge; larger JPEGs are scaled down to this width or height. */
const MAX_IMAGE_SIZE = 2560

/**
 * Scales a large JPEG down (keeps everything else as is). Falls back to the original file when
 * the browser cannot decode it.
 */
export async function shrinkImage(file: File, maxSize = MAX_IMAGE_SIZE): Promise<Blob> {
  if (!/^image\/jpe?g$/.test(file.type) || typeof createImageBitmap !== 'function') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = maxSize / Math.max(bitmap.width, bitmap.height)
    if (scale >= 1) {
      bitmap.close()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    )
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}
