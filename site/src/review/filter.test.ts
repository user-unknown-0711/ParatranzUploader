import { describe, expect, it } from 'vitest'
import { fixture } from '../testdata'
import type { CheckItem, Index } from '../types'
import { filterChecks, filterUntranslated, findingMark, untranslatedCount } from './filter'

const index = fixture<Index>('index.json')
const items = fixture<{ items: CheckItem[] }>('review/checks.json').items
const groupOf = (path: string) => index.files.find((f) => f.path === path)?.group
const none = { group: '', sub: '', q: '' }

describe('filterUntranslated', () => {
  const paths = (f: Partial<typeof none>) => filterUntranslated(index, { ...none, ...f }).map((s) => s.path)

  it('lists the files that have untranslated units, the most first', () => {
    expect(paths({})).toEqual(['Skills_personality-99.json', 'StoryData/S9998.json'])
    expect(index.files.map(untranslatedCount)).toContain(3)
  })

  it('narrows by status, by the files the release lacks, by group and by text', () => {
    expect(paths({ sub: 'en' })).toEqual(['Skills_personality-99.json'])
    expect(paths({ sub: 'absent' })).toEqual(['StoryData/S9998.json'])
    expect(paths({ group: 'StoryData' })).toEqual(['StoryData/S9998.json'])
    expect(paths({ q: 'SKILLS' })).toEqual(['Skills_personality-99.json'])
    expect(paths({ q: '어딘가' })).toEqual(['StoryData/S9998.json'])
  })
})

describe('filterChecks', () => {
  const codes = (f: Partial<typeof none>, target?: string) => filterChecks(items, { ...none, ...f }, groupOf, target).map((c) => c.code)

  it('keeps the order of the data', () => {
    expect(codes({})).toEqual(['placeholder', 'keyword', 'tag', 'hangul'])
  })

  it('narrows by code, by the group of a unit and by text', () => {
    expect(codes({ sub: 'tag' })).toEqual(['tag'])
    expect(codes({ group: 'StoryData' })).toEqual(['hangul'])
    expect(codes({ q: '燒傷' })).toEqual(['keyword'])
    expect(codes({ q: 'skills_personality-99.json|datalist->4' })).toEqual(['placeholder', 'tag'])
  })

  it('always keeps the item the address names', () => {
    const hangul = items.find((c) => c.code === 'hangul')
    expect(codes({ sub: 'tag' }, hangul?.id)).toEqual(['tag', 'hangul'])
  })
})

describe('findingMark', () => {
  it('marks the tokens of a finding as text', () => {
    const re = findingMark({ code: 'keyword', miss: ['[Burn]'], extra: [] })
    expect('[Burn] 3'.match(re ?? /$^/)).toEqual(['[Burn]'])
    expect(findingMark({ code: 'placeholder', miss: ['{0}'], extra: ['{1}'] })?.source).toBe('\\{0\\}|\\{1\\}')
  })

  it('marks every tag of the names of a tag finding', () => {
    const re = findingMark({ code: 'tag', miss: ['</color>'], extra: [] })
    expect('<color=#fff>a</color> <COLOR>'.match(re ?? /$^/)).toEqual(['<color=#fff>', '</color>', '<COLOR>'])
  })

  it('marks nothing for a finding without tokens', () => {
    expect(findingMark({ code: 'llc', miss: [], extra: [] })).toBeUndefined()
  })
})
