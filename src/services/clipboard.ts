/** Copies text to the clipboard. Returns false when the browser refuses (no permission, http). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Copies an SVG as an SVG: as `image/svg+xml` where the browser can (paste into a vector
 * editor), and always as its source text. The browser's own "Copy image" makes a PNG of it.
 * The text may still be loading: the clipboard takes promises, so the click still counts as the
 * user's gesture. Returns false when the browser refuses.
 */
export async function copySvg(svg: Promise<string>): Promise<boolean> {
  const blob = (type: string) => svg.then((text) => new Blob([text], { type }))
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const items: Record<string, Promise<Blob>> = { 'text/plain': blob('text/plain') }
    if (ClipboardItem.supports?.('image/svg+xml')) items['image/svg+xml'] = blob('image/svg+xml')
    try {
      await navigator.clipboard.write([new ClipboardItem(items)])
      return true
    } catch {
      // older browsers want blobs, not promises: try the text alone
    }
  }
  try {
    return await copyText(await svg)
  } catch {
    return false
  }
}

/** Offers a URL as a file download. */
export function downloadUrl(filename: string, url: string): void {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
}

/** Offers text as a file download. */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  downloadUrl(filename, url)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
