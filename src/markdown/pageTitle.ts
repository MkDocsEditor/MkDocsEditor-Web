import { parseFrontMatter } from './frontMatter'

/**
 * The name of a page as MkDocs shows it, the same rule as the backend's `title`
 * (`docs/page-meta.md` of MkDocsEditor-Backend): the front matter title, else the first level-1
 * heading, else a name made from the file name.
 */

const ATX_H1 = /^ {0,3}#(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const SETEXT_H1 = /^ {0,3}=+[ \t]*$/
const FENCE = /^ {0,3}(```|~~~)/

/** The text of the first level-1 heading outside fenced code: `# Text`, or a line over `===`. */
export function firstHeading(body: string): string | undefined {
  let fence = ''
  let previous = ''
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const opening = FENCE.exec(line)
    if (opening) {
      if (!fence) fence = opening[1]!
      else if (fence === opening[1]) fence = ''
      previous = ''
      continue
    }
    if (fence) continue
    const heading = ATX_H1.exec(line)?.[1]?.trim()
    if (heading) return heading
    const above = previous.trim()
    if (SETEXT_H1.test(line) && above && !above.startsWith('#')) return above
    previous = line
  }
  return undefined
}

/**
 * The name MkDocs makes from the file: `-` and `_` become spaces, and a name in lower case gets
 * a capital first letter. `index.md` and `README.md` take the name of their folder, and the index
 * of the docs folder is "Home".
 */
export function titleFromPath(path: string): string {
  const parts = path.split('/')
  let name = parts.pop()!.replace(/\.md$/i, '')
  if (/^(index|readme)$/i.test(name)) {
    const folder = parts.pop()
    if (!folder) return 'Home'
    name = folder
  }
  name = name.replace(/[-_]/g, ' ')
  return name && name.toLowerCase() === name ? name[0]!.toUpperCase() + name.slice(1) : name
}

/** The name of the page with `text` at `path` (relative to the docs folder). */
export function pageTitle(text: string, path: string): string {
  const { meta, lines } = parseFrontMatter(text)
  if (meta.title) return meta.title
  const body = lines ? text.split('\n').slice(lines).join('\n') : text
  return firstHeading(body) ?? titleFromPath(path)
}
