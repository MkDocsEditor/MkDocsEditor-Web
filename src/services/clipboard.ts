/** Copies text to the clipboard. Returns false when the browser refuses (no permission, http). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
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
