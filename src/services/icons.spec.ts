import { describe, expect, it } from 'vitest'

import { colorFor, iconFor, isImage, resourceKind } from './icons'

const resource = (name: string, kind?: 'image' | 'other') =>
  ({ type: 'resource', id: name, name, filesize: 0, modtime: '', kind }) as const

describe('resource kinds', () => {
  it.each([
    ['Foto.JPG', 'image'],
    ['Plan.pdf', 'pdf'],
    ['clip.mp4', 'video'],
    ['song.mp3', 'audio'],
    ['notes.yml', 'text'],
    ['backup.tar', 'archive'],
    ['README', 'other'],
    ['data.bin', 'other'],
  ])('%s is %s', (name, kind) => {
    expect(resourceKind(resource(name))).toBe(kind)
  })

  it('prefers the kind the backend sends', () => {
    expect(resourceKind(resource('x.bin', 'image'))).toBe('image')
  })

  it('gives each kind its own icon and colour', () => {
    const kinds = ['a.png', 'a.pdf', 'a.mp4', 'a.mp3', 'a.txt', 'a.zip', 'a.bin'].map((n) =>
      resource(n),
    )
    expect(new Set(kinds.map(iconFor)).size).toBe(7)
    expect(new Set(kinds.map(colorFor)).size).toBe(7)
    expect(isImage('x.webp')).toBe(true)
  })
})
