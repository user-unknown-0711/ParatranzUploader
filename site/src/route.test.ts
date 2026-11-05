import { describe, expect, it } from 'vitest'
import { fileHref, parseHash, reviewHref, searchHref } from './route'

describe('parseHash', () => {
  it('is home for an empty hash and for what is not a route', () => {
    expect(parseHash('')).toEqual({ kind: 'home' })
    expect(parseHash('#/')).toEqual({ kind: 'home' })
    expect(parseHash('#/nope')).toEqual({ kind: 'home' })
  })

  it('reads a file and the key of a unit in it', () => {
    expect(parseHash('#/f/StoryData/S1.json')).toEqual({ kind: 'file', path: 'StoryData/S1.json' })
    expect(parseHash(fileHref('StoryData/S1.json', 'dataList->3->content'))).toEqual({ kind: 'file', path: 'StoryData/S1.json', ptr: 'dataList->3->content' })
  })

  it('refuses a path that leaves data/files/', () => {
    expect(parseHash('#/f/../meta.json')).toEqual({ kind: 'home' })
    expect(parseHash('#/f/a//b.json')).toEqual({ kind: 'home' })
  })

  it('reads a search, TW by default', () => {
    expect(parseHash('#/s?q=%E5%B7%B4%E5%A3%AB')).toEqual({ kind: 'search', q: '巴士', lang: 'zh', re: false })
    expect(parseHash(searchHref('a+', 'kr', true))).toEqual({ kind: 'search', q: 'a+', lang: 'kr', re: true })
    expect(parseHash('#/s?q=x&lang=xx')).toMatchObject({ lang: 'zh' })
  })

  it('reads the tabs of the review, the untranslated by default', () => {
    expect(parseHash('#/r')).toEqual({ kind: 'review', tab: 'untranslated', group: '', sub: '', q: '' })
    expect(parseHash(reviewHref('checks', { group: 'StoryData', sub: 'tag', q: '<b>', id: 'tag/0a' }))).toEqual({
      kind: 'review',
      tab: 'checks',
      group: 'StoryData',
      sub: 'tag',
      q: '<b>',
      id: 'tag/0a',
    })
    expect(parseHash('#/r/suggestions')).toEqual({ kind: 'home' })
  })
})

describe('hrefs', () => {
  it('encode each segment of a path and keep the slashes', () => {
    expect(fileHref('a b/c#d.json')).toBe('#/f/a%20b/c%23d.json')
  })

  it('leave out the filters that are not set', () => {
    expect(reviewHref('untranslated')).toBe('#/r/untranslated')
    expect(reviewHref('checks', { sub: 'keyword' })).toBe('#/r/checks?kind=keyword')
  })
})
