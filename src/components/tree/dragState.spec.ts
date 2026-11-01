import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useTreeStore } from '@/stores/tree'
import { sampleTree } from '@/test/fixtures'

import { canDropInto } from './dragState'

describe('canDropInto', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('accepts other folders only', () => {
    const tree = useTreeStore()
    tree.root = sampleTree()
    const rezepte = tree.get('s-rezepte')!
    expect(canDropInto(tree, rezepte, 's-urlaub')).toBe(true)
    // not into itself, a folder below it, or where it is
    expect(canDropInto(tree, rezepte, 's-rezepte')).toBe(false)
    expect(canDropInto(tree, rezepte, 's-kuchen')).toBe(false)
    expect(canDropInto(tree, rezepte, 'root')).toBe(false)
    expect(canDropInto(tree, tree.get('d-apfel')!, 's-kuchen')).toBe(false)
    expect(canDropInto(tree, tree.get('d-apfel')!, 'root')).toBe(true)
    expect(canDropInto(tree, null, 'root')).toBe(false)
  })
})
