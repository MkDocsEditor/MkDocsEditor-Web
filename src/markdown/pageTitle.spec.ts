import { describe, expect, it } from 'vitest'

import { firstHeading, pageTitle, titleFromPath } from './pageTitle'

describe('page title', () => {
  it('takes the front matter title, then the first heading, then the file name', () => {
    expect(pageTitle('---\ntitle: Vorne\n---\n# Kopf\n', 'a/b.md')).toBe('Vorne')
    expect(pageTitle('---\ntags: [x]\n---\n# Kopf\n', 'a/b.md')).toBe('Kopf')
    expect(pageTitle('Nur Text\n', 'a/erste-schritte.md')).toBe('Erste schritte')
  })

  it('finds level-1 headings like MkDocs', () => {
    expect(firstHeading('Text\n\n# Eins #\n# Zwei')).toBe('Eins')
    expect(firstHeading('Setext\n===\n')).toBe('Setext')
    expect(firstHeading('## Zwei\n#Kein\n#\n')).toBeUndefined()
    expect(firstHeading('```\n# im Code\n```\n~~~\n```\n# auch\n~~~\n# Danach')).toBe('Danach')
  })

  it('makes a name from the path', () => {
    expect(titleFromPath('guide/setup_notes.md')).toBe('Setup notes')
    expect(titleFromPath('guide/WLAN-Gast.md')).toBe('WLAN Gast')
    expect(titleFromPath('Rezepte/index.md')).toBe('Rezepte')
    expect(titleFromPath('Rezepte/README.md')).toBe('Rezepte')
    expect(titleFromPath('index.md')).toBe('Home')
  })
})
