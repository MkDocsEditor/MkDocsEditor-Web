import { load } from 'js-yaml'

/**
 * Front matter, the YAML block at the very start of a page that MkDocs and Material read
 * (`---` lines around it; `...` may close it too). Shared with the Android app through the
 * renderer bundle.
 */

/** The fields MkDocs and Material give a meaning; everything else stays in `extra`. */
export interface PageMeta {
  /** Page title: the heading when the page has no `# heading`, and the name in lists. */
  title?: string
  /** A sentence about the page, for lists and search results. */
  description?: string
  /** Material icon shortcode, for example `material/emoticon-happy`. */
  icon?: string
  /** Material page status, for example `new` or `deprecated`. */
  status?: string
  tags: string[]
  /** Parts of the page Material leaves out: `toc`, `navigation`, `footer`, `tags`. */
  hide: string[]
  /** `search: exclude: true`: the page is left out of the search. */
  searchExclude: boolean
  /** All keys as written, also the known ones. Unknown keys are never shown. */
  extra: Record<string, unknown>
}

export interface FrontMatter {
  meta: PageMeta
  /** Lines the block takes, closing line included; 0 without front matter. */
  lines: number
  /** Why the YAML could not be read; the page then has no meta data. */
  error?: string
}

const BLOCK = /^---[ \t]*\r?\n([\s\S]*?)\r?\n?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/

export function emptyMeta(): PageMeta {
  return { tags: [], hide: [], searchExclude: false, extra: {} }
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function texts(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  return list.map(text).filter((t): t is string => t !== undefined)
}

function metaFrom(data: Record<string, unknown>): PageMeta {
  const search = data.search
  return {
    title: text(data.title),
    description: text(data.description),
    icon: text(data.icon),
    status: text(data.status),
    tags: texts(data.tags),
    hide: texts(data.hide),
    searchExclude:
      typeof search === 'object' &&
      search !== null &&
      (search as { exclude?: unknown }).exclude === true,
    extra: data,
  }
}

/** Reads the front matter of `source`, if it starts with one. Never throws. */
export function parseFrontMatter(source: string): FrontMatter {
  const match = BLOCK.exec(source)
  if (!match) return { meta: emptyMeta(), lines: 0 }
  const lines = match[0].replace(/\r?\n$/, '').split('\n').length
  try {
    const data = load(match[1] ?? '')
    if (data === undefined || data === null) return { meta: emptyMeta(), lines }
    if (typeof data !== 'object' || Array.isArray(data)) {
      return { meta: emptyMeta(), lines, error: 'The front matter is not a list of keys.' }
    }
    return { meta: metaFrom(data as Record<string, unknown>), lines }
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error)
    return { meta: emptyMeta(), lines, error: `The front matter is not valid YAML: ${reason}` }
  }
}

/**
 * The page without its front matter. The lines stay as empty lines, so the source lines of the
 * blocks keep matching the editor.
 */
export function blankFrontMatter(source: string, lines: number): string {
  if (lines === 0) return source
  const parts = source.split('\n')
  return '\n'.repeat(lines) + parts.slice(lines).join('\n')
}
