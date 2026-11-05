import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixture, fixtureFetch } from '../testdata'
import type { FileData, Index, Lang } from '../types'
import { SearchEngine, searchCorpus, type Query } from './engine'
import { makeMatcher, stripTags } from './match'

// stripTags is the real one, watched: the engine must not call it on every query.
vi.mock('./match', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./match')>()
  return { ...actual, stripTags: vi.fn(actual.stripTags) }
})

const LANGS: Lang[] = ['kr', 'jp', 'en', 'zh']
const index = fixture<Index>('index.json')
const keys = fixture<[number, string][]>('search/keys.json')
const corpus = Object.fromEntries(LANGS.map((l) => [l, fixture<string[]>(`search/${l}.json`)])) as Record<Lang, string[]>

function matcher(q: string, regex = false) {
  const m = makeMatcher(q, regex)
  if (typeof m !== 'function') throw new Error(m.error)
  return m
}

/** The fixture strings of a language, stripped: what the engine matches. */
function stripped(lang: Lang): string[] {
  return corpus[lang].map(stripTags)
}

describe('searchCorpus', () => {
  it('finds every unit of the fixture files that needs translating, in each language', () => {
    let checked = 0
    index.files.forEach((summary, file) => {
      for (const u of fixture<FileData>(`files/${summary.path}`).units) {
        if (u.s === 'same') continue
        for (const lang of LANGS) {
          const text = stripTags(u[lang] ?? '')
          if (text === '') continue
          const { hits } = searchCorpus(keys, stripped(lang), matcher(text))
          const mine = hits.find((h) => h.file === file && h.ptr === u.p)
          expect(mine, `${lang} ${summary.path} ${u.p}`).toBeDefined()
          expect(mine?.text).toBe(text)
          checked++
        }
      }
    })
    expect(checked).toBeGreaterThan(50)
  })

  it('does not find a unit that needs no translation: it is not in the corpus', () => {
    const { hits } = searchCorpus(keys, stripped('kr'), matcher('LCB'))
    expect(hits).toEqual([])
    expect(searchCorpus(keys, stripped('zh'), matcher('dataList->1->model')).total).toBe(0)
  })

  it('matches the text without its tags, and gives the ranges in that text', () => {
    const { hits, total } = searchCorpus(keys, stripped('zh'), matcher('燒傷'))
    expect(total).toBe(1)
    expect(hits).toEqual([{ file: 2, ptr: 'dataList->0->desc', text: '[WhenUse] 使目標獲得{0}層燒傷\n造成的傷害+10%', ranges: [[19, 21]] }])
    // a tag does not stop a match across it
    expect(searchCorpus(keys, stripped('zh'), matcher('翼已然')).total).toBe(1)
    // and its name is not text
    expect(searchCorpus(keys, stripped('zh'), matcher('color')).total).toBe(0)
    expect(searchCorpus(keys, stripped('zh'), matcher('style')).total).toBe(0)
  })

  it('finds [ID] and {n}', () => {
    expect(searchCorpus(keys, stripped('kr'), matcher('{0}')).total).toBe(3)
    expect(searchCorpus(keys, stripped('en'), matcher('[burn]')).total).toBe(1)
  })

  it('gives the hits in the order of the corpus, with a range for each match in a string', () => {
    const { hits } = searchCorpus(keys, stripped('zh'), matcher('巴士'))
    expect(hits.map((h) => h.ptr)).toEqual(['dataList->3->place', 'dataList->3->content'])
    const two = searchCorpus([[3, '/a']], ['協會與協會'], matcher('協會'))
    expect(two.hits[0]?.ranges).toEqual([
      [0, 2],
      [3, 5],
    ])
  })

  it('does not count a string that has no text', () => {
    // seven of the 33 strings of the jp corpus are empty: the language has no string for them
    expect(keys).toHaveLength(33)
    const { hits, total } = searchCorpus(keys, stripped('jp'), matcher('.*', true))
    expect(total).toBe(26)
    expect(hits.filter((h) => h.file === 3)).toEqual([])
    expect(hits.map((h) => h.ptr)).not.toContain('dataList->2->coinlist->0->coindescs->0->desc')
  })

  it('results capped at 1000 with total', () => {
    const n = 2500
    const many: [number, string][] = Array.from({ length: n }, (_, k) => [k % 7, `/dataList/${k}/name`])
    const texts = Array.from({ length: n }, (_, k) => `名稱 ${k}`)
    const { hits, total } = searchCorpus(many, texts, matcher('名稱'))
    expect(hits).toHaveLength(1000)
    expect(total).toBe(2500)
    expect(hits[0]?.ptr).toBe('/dataList/0/name')
    expect(hits[999]?.ptr).toBe('/dataList/999/name')
  })

  it('takes another limit', () => {
    const many: [number, string][] = [[0, '/a'], [0, '/b'], [0, '/c']]
    const { hits, total } = searchCorpus(many, ['x', 'x', 'x'], matcher('x'), 2)
    expect(hits.map((h) => h.ptr)).toEqual(['/a', '/b'])
    expect(total).toBe(3)
  })

  it('only matches the strings that have a key', () => {
    const { total } = searchCorpus([[0, '/a']], ['x', 'x'], matcher('x'))
    expect(total).toBe(1)
  })
})

function query(q: string, lang: Lang, re = false, id = 1): Query {
  return { id, q, lang, re, base: './data/' }
}

describe('SearchEngine', () => {
  let fetchJson: ReturnType<typeof vi.fn<(url: string) => Promise<unknown>>>
  let engine: SearchEngine

  beforeEach(() => {
    const fetchData = fixtureFetch()
    fetchJson = vi.fn(async (url: string) => {
      const res = await fetchData(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    engine = new SearchEngine(fetchJson)
  })

  it('answers with the hits and the total, under the id of the query', async () => {
    const reply = await engine.run(query('燒傷', 'zh', false, 7))
    expect(reply).toEqual({
      id: 7,
      total: 1,
      hits: [{ file: 2, ptr: 'dataList->0->desc', text: '[WhenUse] 使目標獲得{0}層燒傷\n造成的傷害+10%', ranges: [[19, 21]] }],
    })
  })

  it('downloads keys.json and the corpus of the language once, at the base the query gives', async () => {
    await engine.run({ ...query('a', 'kr'), base: 'https://example.test/limbus/data/' })
    expect(fetchJson.mock.calls.map((c) => c[0]).sort()).toEqual([
      'https://example.test/limbus/data/search/keys.json',
      'https://example.test/limbus/data/search/kr.json',
    ])
  })

  it('keeps what it has downloaded: another query in the language downloads nothing, another language only its corpus', async () => {
    await engine.run(query('燒傷', 'zh'))
    await engine.run(query('巴士', 'zh'))
    expect(fetchJson).toHaveBeenCalledTimes(2)
    await engine.run(query('공격', 'kr'))
    expect(fetchJson).toHaveBeenCalledTimes(3)
    expect(fetchJson.mock.calls[2]?.[0]).toBe('./data/search/kr.json')
  })

  it('downloads once for queries that come while the download goes on', async () => {
    const [a, b] = await Promise.all([engine.run(query('燒傷', 'zh', false, 1)), engine.run(query('巴士', 'zh', false, 2))])
    expect(fetchJson).toHaveBeenCalledTimes(2)
    expect('hits' in a && a.id).toBe(1)
    expect('hits' in b && b.id).toBe(2)
  })

  it('strips a corpus once, when it comes in, and not on every query', async () => {
    vi.mocked(stripTags).mockClear()
    await engine.run(query('燒傷', 'zh'))
    expect(stripTags).toHaveBeenCalledTimes(keys.length)
    await engine.run(query('巴士', 'zh'))
    const again = await engine.run(query('size', 'zh'))
    expect(stripTags).toHaveBeenCalledTimes(keys.length)
    // what it keeps is the text without tags
    expect(again).toEqual({ id: 1, hits: [], total: 0 })
  })

  it('searches by regular expression', async () => {
    const reply = await engine.run(query('\\[\\w+\\] .*\\{0\\}', 'zh', true))
    expect('hits' in reply && reply.total).toBe(1)
  })

  it('answers a pattern that is not valid with an error, and downloads nothing for it', async () => {
    const reply = await engine.run(query('(', 'zh', true, 3))
    expect(reply).toMatchObject({ id: 3, error: expect.stringContaining('正規表示式') })
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('answers an empty query with an error', async () => {
    expect(await engine.run(query('', 'zh'))).toMatchObject({ id: 1, error: expect.any(String) })
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('answers with an error where the data cannot be downloaded, and tries again with the next query', async () => {
    let up = false
    const fetchData = fixtureFetch()
    const flaky = vi.fn(async (url: string) => {
      if (!up) throw new Error('offline')
      return (await fetchData(url)).json()
    })
    const e = new SearchEngine(flaky)
    const down = await e.run(query('燒傷', 'zh', false, 1))
    expect(down).toMatchObject({ id: 1, error: expect.stringContaining('下載') })
    // and says what the reader can do about it
    expect('error' in down && down.error).toContain('請重新整理後再試')
    up = true
    const back = await e.run(query('燒傷', 'zh', false, 2))
    expect(back).toMatchObject({ id: 2, total: 1 })
  })

  it('answers with an error where the server has no such file', async () => {
    const e = new SearchEngine(async () => {
      throw new Error('HTTP 404')
    })
    expect(await e.run(query('x', 'jp'))).toMatchObject({ error: expect.stringContaining('HTTP 404') })
  })

  it('answers with an error where the corpus is not as long as the keys', async () => {
    const e = new SearchEngine(async (url) => (url.endsWith('keys.json') ? keys : ['短']))
    expect(await e.run(query('x', 'zh'))).toMatchObject({ error: expect.stringMatching(/格式.*請重新整理後再試/) })
  })

  it('answers with an error where the data is not arrays', async () => {
    const e = new SearchEngine(async () => ({ not: 'an array' }))
    expect(await e.run(query('x', 'zh'))).toMatchObject({ error: expect.stringMatching(/格式.*請重新整理後再試/) })
  })
  describe('the message that it begins to match', () => {
    it('is sent once the corpus is in, and before the answer', async () => {
      const events: string[] = []
      const reply = await engine.run(query('燒傷', 'zh', false, 4), (m) => {
        events.push(`matching ${m.id} ${m.matching} after ${fetchJson.mock.calls.length} downloads`)
      })
      events.push(`reply ${reply.id}`)
      expect(events).toEqual(['matching 4 true after 2 downloads', 'reply 4'])
    })

    it('is sent for each query, also when the corpus is in memory', async () => {
      await engine.run(query('燒傷', 'zh'))
      const said: number[] = []
      await engine.run(query('巴士', 'zh', false, 5), (m) => said.push(m.id))
      expect(said).toEqual([5])
      expect(fetchJson).toHaveBeenCalledTimes(2)
    })

    it('is not sent for a query that is not matched: a pattern that is not valid, a download that fails, data that does not fit', async () => {
      const said: number[] = []
      const matching = (m: { id: number }) => said.push(m.id)
      await engine.run(query('(', 'zh', true, 1), matching)
      await engine.run(query('', 'zh', false, 2), matching)
      const down = new SearchEngine(async () => {
        throw new Error('offline')
      })
      await down.run(query('x', 'zh', false, 3), matching)
      const short = new SearchEngine(async (url) => (url.endsWith('keys.json') ? keys : ['短']))
      await short.run(query('x', 'zh', false, 4), matching)
      expect(said).toEqual([])
    })
  })
})
