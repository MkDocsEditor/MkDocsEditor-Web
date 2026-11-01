import { describe, expect, it } from 'vitest'

import { diffStats, parseUnifiedDiff } from './diff'

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
