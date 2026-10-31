import { describe, expect, it } from 'vitest'

import { diffStats, formatWhen, parseUnifiedDiff } from './diff'

const DIFF = `diff --git a/docs/a.md b/docs/a.md
index 1111111..2222222 100644
--- a/docs/a.md
+++ b/docs/a.md
@@ -1,3 +1,3 @@ Rezept
 # Rezept
-Version eins
+Version zwei
 Ende
\\ No newline at end of file
`

describe('parseUnifiedDiff', () => {
  it('turns a unified diff into numbered lines without headers', () => {
    const lines = parseUnifiedDiff(DIFF)
    expect(lines).toEqual([
      { kind: 'hunk', text: 'Rezept' },
      { kind: 'context', text: '# Rezept', oldLine: 1, newLine: 1 },
      { kind: 'del', text: 'Version eins', oldLine: 2 },
      { kind: 'add', text: 'Version zwei', newLine: 2 },
      { kind: 'context', text: 'Ende', oldLine: 3, newLine: 3 },
    ])
    expect(diffStats(lines)).toEqual({ added: 1, removed: 1 })
  })

  it('returns nothing for an empty diff', () => {
    expect(parseUnifiedDiff('')).toEqual([])
  })
})

describe('formatWhen', () => {
  const now = Date.parse('2026-10-31T12:00:00Z')

  it('says how long ago, then the date', () => {
    expect(formatWhen('2026-10-31T11:59:30Z', now)).toBe('just now')
    expect(formatWhen('2026-10-31T11:55:00Z', now)).toBe('5 minutes ago')
    expect(formatWhen('2026-10-30T12:00:00Z', now)).toBe('yesterday')
    expect(formatWhen('2026-09-01T12:00:00Z', now)).toMatch(/2026/)
    expect(formatWhen('kaputt', now)).toBe('kaputt')
  })
})
