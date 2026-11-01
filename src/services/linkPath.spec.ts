import { describe, expect, it } from 'vitest'

import vectors from '@/test/data/link-paths.json'

import { encodeSegment, linkDestination } from './linkPath'
import type { LinkTarget } from './linkPath'

interface Vector {
  name: string
  from: string
  target: LinkTarget
  anchor?: string
  expected: string
}

describe('linkDestination', () => {
  it.each((vectors.vectors as Vector[]).map((v) => [v.name, v] as const))('%s', (_, vector) => {
    expect(linkDestination(vector.from, vector.target, vector.anchor)).toBe(vector.expected)
  })
})

describe('encodeSegment', () => {
  it('keeps letters with diacritics and encodes reserved characters', () => {
    expect(encodeSegment('Käse (alt) #1.png')).toBe('Käse%20%28alt%29%20%231.png')
    expect(encodeSegment('tab\there')).toBe('tab%09here')
  })
})
