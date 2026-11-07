import { mdiEmoticonHappy } from '@mdi/js'
import { describe, expect, it, vi } from 'vitest'

import { materialIcon, mdiName, statusIcon, statusLabel } from './materialIcons'

describe('material icons of the front matter', () => {
  it('names Material icons like @mdi/js', () => {
    expect(mdiName('material/emoticon-happy')).toBe('mdiEmoticonHappy')
    expect(mdiName('material/numeric-1-box')).toBe('mdiNumeric1Box')
    expect(mdiName('fontawesome/brands/github')).toBeNull()
    expect(mdiName('emoticon-happy')).toBeNull()
  })

  it('loads the icons on first use', async () => {
    expect(materialIcon('material/emoticon-happy')).toBeUndefined()
    await vi.waitFor(() => expect(materialIcon('material/emoticon-happy')).toBe(mdiEmoticonHappy))
    expect(materialIcon('material/no-such-icon')).toBeUndefined()
    expect(materialIcon('octicons/mark-github-16')).toBeUndefined()
    expect(materialIcon(undefined)).toBeUndefined()
  })

  it('has the icons of the page status', () => {
    expect(statusIcon('new')).toBeTruthy()
    expect(statusIcon('deprecated')).toBeTruthy()
    expect(statusIcon('draft')).toBeUndefined()
    expect(statusLabel('deprecated')).toBe('Deprecated')
  })
})
