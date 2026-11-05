import { describe, expect, it } from 'vitest'
import { fixture } from '../testdata'
import type { Index } from '../types'
import { keyAction, neighbors } from './nav'

const index = fixture<Index>('index.json')
const paths = index.files.map((f) => f.path)

describe('neighbors', () => {
  it('has no prev for the first file', () => {
    expect(neighbors(index, paths[0] ?? '')).toEqual({ next: paths[1] })
  })

  it('has no next for the last file', () => {
    expect(neighbors(index, paths[paths.length - 1] ?? '')).toEqual({ prev: paths[paths.length - 2] })
  })

  it('has both for a file in the middle, in the order of index.files', () => {
    expect(neighbors(index, paths[1] ?? '')).toEqual({ prev: paths[0], next: paths[2] })
  })

  it('has none for a path that is not in the index', () => {
    expect(neighbors(index, 'nope.json')).toEqual({})
  })

  it('goes by the order of index.files, not by the name', () => {
    const odd: Index = { groups: [], files: ['b.json', 'a.json', 'c.json'].map((path) => ({ ...(index.files[0] as Index['files'][number]), path })) }
    expect(neighbors(odd, 'b.json')).toEqual({ next: 'a.json' })
    expect(neighbors(odd, 'a.json')).toEqual({ prev: 'b.json', next: 'c.json' })
  })
})

function key(k: string, extra: Partial<{ target: EventTarget | null; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) {
  return { key: k, ctrlKey: false, metaKey: false, altKey: false, target: document.body as EventTarget | null, ...extra }
}

describe('keyAction', () => {
  it('maps [ ] j k', () => {
    expect(keyAction(key('['))).toBe('prevFile')
    expect(keyAction(key(']'))).toBe('nextFile')
    expect(keyAction(key('j'))).toBe('nextRow')
    expect(keyAction(key('k'))).toBe('prevRow')
    expect(keyAction(key('x'))).toBeUndefined()
  })

  it('does nothing while a text box or a select has the focus', () => {
    for (const el of [document.createElement('input'), document.createElement('textarea'), document.createElement('select')]) {
      expect(keyAction(key('j', { target: el }))).toBeUndefined()
      expect(keyAction(key(']', { target: el }))).toBeUndefined()
    }
    const search = document.createElement('input')
    search.type = 'search'
    expect(keyAction(key('k', { target: search }))).toBeUndefined()
  })

  it('still works with a checkbox in focus, so that a click on a filter does not take the keys away', () => {
    const box = document.createElement('input')
    box.type = 'checkbox'
    expect(keyAction(key('j', { target: box }))).toBe('nextRow')
  })

  it('leaves the keys with a modifier to the browser', () => {
    expect(keyAction(key('j', { ctrlKey: true }))).toBeUndefined()
    expect(keyAction(key('[', { metaKey: true }))).toBeUndefined()
    expect(keyAction(key(']', { altKey: true }))).toBeUndefined()
  })
})
