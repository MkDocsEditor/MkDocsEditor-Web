import { parseFrontMatter } from './frontMatter'

/** A key with its optional label (the `QrKey` of the API). */
export interface QrKey {
  key: string
  label: string | null
}

/**
 * QR code keys in the front matter of a page (`docs/qr.md` of MkDocsEditor-Backend):
 * `qr: waschmaschine`, a list of keys, or entries `{key, label}`, also mixed.
 */

/** A key, after trimming and lower case. */
export const QR_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/

/** The key as the backend compares it; undefined for values that are no key. */
export function normalizeQrKey(value: unknown): string | undefined {
  const text =
    typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined
  const key = text?.trim().toLowerCase()
  return key && QR_KEY.test(key) ? key : undefined
}

/** The valid keys of a page, each once, in their order. */
export function qrKeysOf(text: string): QrKey[] {
  const value = parseFrontMatter(text).meta.extra.qr
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  const keys: QrKey[] = []
  for (const entry of list) {
    const object = typeof entry === 'object' && entry !== null && !Array.isArray(entry)
    const key = normalizeQrKey(object ? (entry as { key?: unknown }).key : entry)
    if (!key || keys.some((k) => k.key === key)) continue
    const label = object ? (entry as { label?: unknown }).label : undefined
    keys.push({ key, label: typeof label === 'string' && label.trim() ? label.trim() : null })
  }
  return keys
}

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

/** A key made from a page name: "Waschmaschine (Keller)" becomes `waschmaschine-keller`. */
export function suggestQrKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c]!)
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '')
}

/** A key as YAML: quoted when YAML would read it as something else than text. */
function yamlKey(key: string): string {
  return /^[a-z][a-z0-9-]*$/.test(key) && !/^(true|false|yes|no|on|off|null|y|n)$/.test(key)
    ? key
    : JSON.stringify(key)
}

/** The `qr` entry of the front matter for `keys`, as lines. */
function qrLines(keys: readonly QrKey[]): string[] {
  if (keys.every((k) => !k.label)) {
    return keys.length === 1
      ? [`qr: ${yamlKey(keys[0]!.key)}`]
      : [`qr: [${keys.map((k) => yamlKey(k.key)).join(', ')}]`]
  }
  const lines = ['qr:']
  for (const { key, label } of keys) {
    if (!label) lines.push(`  - ${yamlKey(key)}`)
    else lines.push(`  - key: ${yamlKey(key)}`, `    label: ${JSON.stringify(label)}`)
  }
  return lines
}

/**
 * The text with `keys` as its `qr` entry: the entry is replaced, added before the end of the
 * front matter, or a front matter is added at the top. No keys removes the entry. The rest of the
 * text stays as it is.
 */
export function withQrKeys(text: string, keys: readonly QrKey[]): string {
  const lines = text.split('\n')
  const { lines: count } = parseFrontMatter(text)
  if (count === 0) {
    if (keys.length === 0) return text
    return ['---', ...qrLines(keys), '---', ...(text ? ['', text] : [''])].join('\n')
  }
  // the entry: its line and the indented or listed lines after it
  const start = lines.findIndex((l, i) => i > 0 && i < count - 1 && /^qr[ \t]*:/.test(l))
  let end = start
  if (start >= 0) {
    while (end + 1 < count - 1 && /^([ \t]+\S|-[ \t]|-$|[ \t]*$)/.test(lines[end + 1]!)) end++
    // blank lines at its end belong to what follows
    while (end > start && !lines[end]!.trim()) end--
  }
  const replacement = keys.length > 0 ? qrLines(keys) : []
  if (start >= 0) lines.splice(start, end - start + 1, ...replacement)
  else lines.splice(count - 1, 0, ...replacement)
  return lines.join('\n')
}
