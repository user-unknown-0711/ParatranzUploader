import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataError, clearDataCache, filterFiles, loadChecks, loadFile, loadIndex, loadMeta, loadModels } from './data'
import { fixture, fixtureFetch } from './testdata'
import type { CheckItem, FileData, Index, Meta } from './types'

function serve(docs: Record<string, unknown> = {}) {
  const fetchMock = vi.fn(fixtureFetch(docs))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    if (e instanceof DataError) return e.kind
    throw e
  }
  return 'resolved'
}

beforeEach(() => clearDataCache())
afterEach(() => vi.unstubAllGlobals())

describe('data loading', () => {
  it('reads meta.json, the index, a file, the checks and the models from ./data/', async () => {
    const fetchMock = serve()
    expect(await loadMeta()).toEqual(fixture<Meta>('meta.json'))
    expect(await loadIndex()).toEqual(fixture<Index>('index.json'))
    expect(await loadFile('StoryData/S9999.json')).toEqual(fixture<FileData>('files/StoryData/S9999.json'))
    expect(await loadChecks()).toEqual(fixture<{ items: CheckItem[] }>('review/checks.json').items)
    expect((await loadModels())['이상']).toEqual({ kr: '이상', jp: 'イサン', en: 'Yi Sang', zh: '李箱' })
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      './data/meta.json',
      './data/index.json',
      './data/files/StoryData/S9999.json',
      './data/review/checks.json',
      './data/models.json',
    ])
  })

  it('fetches a document once', async () => {
    const fetchMock = serve()
    await loadMeta()
    await loadMeta()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('says the data is of another format, or gone, so that a reload helps', async () => {
    serve({ 'meta.json': { ...fixture<Meta>('meta.json'), format: 2 } })
    expect(await kindOf(loadMeta())).toBe('format')
    expect(await kindOf(loadFile('nope.json'))).toBe('missing')
  })

  it('says the network failed, and tries again on the next load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation(fixtureFetch()))
    expect(await kindOf(loadIndex())).toBe('network')
    expect(await kindOf(loadIndex())).toBe('resolved')
  })
})

describe('filterFiles', () => {
  const index = fixture<Index>('index.json')
  const paths = (q: string) => filterFiles(index, q).map((n) => index.files[n]?.path)

  it('matches the path, the place and the speakers, in any case', () => {
    expect(paths('')).toHaveLength(index.files.length)
    expect(paths('skills')).toEqual(['Skills_personality-99.json'])
    expect(paths('後巷')).toEqual(['StoryData/S9999.json'])
    expect(paths('李箱')).toEqual(['StoryData/S9999.json'])
  })
})
