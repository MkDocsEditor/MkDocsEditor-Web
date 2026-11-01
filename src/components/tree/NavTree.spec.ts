import { describe, expect, it } from 'vitest'

import { sampleTree } from '@/test/fixtures'
import { mountWithPlugins } from '@/test/mount'

import NavTree from './NavTree.vue'

async function titles(showFiles: boolean) {
  const { wrapper } = await mountWithPlugins(NavTree, {
    props: {
      section: sampleTree(),
      depth: 0,
      opened: new Set(['s-rezepte', 's-kuchen']),
      showFiles,
    },
  })
  const result = {
    resources: wrapper.findAll('[data-testid="tree-resource"]').map((i) => i.text()),
    documents: wrapper.findAll('[data-testid="tree-document"]').map((i) => i.text()),
  }
  wrapper.unmount()
  return result
}

describe('NavTree', () => {
  it('lists files after the pages of each open folder', async () => {
    const { resources, documents } = await titles(true)
    expect(documents).toEqual(['Apfelkuchen', 'Kürbissuppe', 'index'])
    expect(resources).toEqual(['apfel.png', 'Plan (alt).pdf', 'logo.png'])
  })

  it('hides files when asked', async () => {
    expect((await titles(false)).resources).toEqual([])
  })
})
