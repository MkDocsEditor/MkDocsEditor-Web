/** What the server takes as a profile picture. */
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
/** Plenty for the 256 pixels the server keeps. */
const SCALED_SIZE = 1024

/**
 * The picture to upload. One the server takes as it is goes unchanged: it crops and scales it
 * itself. Others (too large, or a type the browser reads but the server does not) are scaled
 * down to a JPEG first. Returns null when the browser cannot read the picture either.
 */
export async function avatarUpload(file: Blob): Promise<Blob | null> {
  if (AVATAR_TYPES.includes(file.type) && file.size <= AVATAR_MAX_BYTES) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, SCALED_SIZE / Math.min(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  } catch {
    return null
  }
}
