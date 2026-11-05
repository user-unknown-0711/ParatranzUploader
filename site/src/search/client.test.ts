import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSearchClient, MATCH_LIMIT_MS, type SearchWorker } from './client'
import type { Query, WorkerMessage } from './engine'

/** A worker that does nothing by itself: the test sends its replies, in the order it likes. */
class FakeWorker implements SearchWorker {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  sent: Query[] = []
  terminated = false

  postMessage(message: Query): void {
    this.sent.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  reply(reply: WorkerMessage): void {
    this.onmessage?.({ data: reply } as MessageEvent<WorkerMessage>)
  }

  fail(): void {
    this.onerror?.(new Event('error'))
  }
}

const hit = { file: 0, ptr: '/a', text: 'x', ranges: [[0, 1]] as [number, number][] }

describe('createSearchClient', () => {
  let worker: FakeWorker
  let make: ReturnType<typeof vi.fn<() => SearchWorker>>

  beforeEach(() => {
    worker = new FakeWorker()
    make = vi.fn(() => worker)
  })

  it('does not start the worker until the first search', () => {
    createSearchClient(make)
    expect(make).not.toHaveBeenCalled()
  })

  it('sends the query with an id and the base of the data, and resolves with the reply', async () => {
    const client = createSearchClient(make)
    const result = client.search('警告', 'zh', false)
    expect(worker.sent).toHaveLength(1)
    const sent = worker.sent[0] as Query
    expect(sent).toMatchObject({ q: '警告', lang: 'zh', re: false })
    expect(typeof sent.id).toBe('number')
    expect(new URL(sent.base).pathname).toMatch(/\/data\/$/)
    expect(sent.base).toBe(new URL('data/', document.baseURI).href)
    worker.reply({ id: sent.id, hits: [hit], total: 1 })
    expect(await result).toEqual({ hits: [hit], total: 1 })
  })

  it('resolves with the error of the worker', async () => {
    const client = createSearchClient(make)
    const result = client.search('(', 'zh', true)
    worker.reply({ id: (worker.sent[0] as Query).id, error: '正規表示式語法錯誤' })
    expect(await result).toEqual({ error: '正規表示式語法錯誤' })
  })

  it('starts one worker for all the searches', async () => {
    const client = createSearchClient(make)
    const first = client.search('a', 'zh', false)
    worker.reply({ id: (worker.sent[0] as Query).id, hits: [], total: 0 })
    await first
    void client.search('b', 'zh', false)
    expect(make).toHaveBeenCalledTimes(1)
    expect(worker.sent).toHaveLength(2)
  })

  it('newer query supersedes older', async () => {
    const client = createSearchClient(make)
    const first = client.search('a', 'zh', false)
    const second = client.search('ab', 'zh', false)
    const [one, two] = worker.sent as [Query, Query]
    expect(two.id).not.toBe(one.id)
    // the first is over as soon as the second is asked
    expect(await first).toEqual({ superseded: true })
    // the old reply comes late, after the new one, and does not take the place of it
    worker.reply({ id: two.id, hits: [hit], total: 1 })
    worker.reply({ id: one.id, hits: [], total: 0 })
    expect(await second).toEqual({ hits: [hit], total: 1 })
  })

  it('ignores the reply of the older query that comes before the reply of the newer', async () => {
    const client = createSearchClient(make)
    const first = client.search('a', 'zh', false)
    const second = client.search('ab', 'zh', false)
    const [one, two] = worker.sent as [Query, Query]
    worker.reply({ id: one.id, hits: [], total: 0 })
    let settled = false
    void second.then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)
    worker.reply({ id: two.id, hits: [hit], total: 1 })
    expect(await first).toEqual({ superseded: true })
    expect(await second).toEqual({ hits: [hit], total: 1 })
  })

  it('ignores a reply to no query, and a second reply to one', async () => {
    const client = createSearchClient(make)
    const result = client.search('a', 'zh', false)
    const { id } = worker.sent[0] as Query
    worker.reply({ id: id + 99, hits: [], total: 5 })
    worker.reply({ id, hits: [hit], total: 1 })
    worker.reply({ id, hits: [], total: 7 })
    expect(await result).toEqual({ hits: [hit], total: 1 })
  })

  it('knows which languages the worker holds: those it has answered a search for, even a late answer', async () => {
    const client = createSearchClient(make)
    expect(client.has('kr')).toBe(false)
    const first = client.search('a', 'kr', false)
    const second = client.search('b', 'jp', false)
    const [one, two] = worker.sent as [Query, Query]
    worker.reply({ id: two.id, hits: [], total: 0 })
    await second
    expect(client.has('jp')).toBe(true)
    expect(client.has('kr')).toBe(false)
    worker.reply({ id: one.id, hits: [], total: 0 })
    await first
    expect(client.has('kr')).toBe(true)
    expect(client.has('en')).toBe(false)
  })

  it('does not count an answer with an error as a language that came in', async () => {
    const client = createSearchClient(make)
    const result = client.search('(', 'kr', true)
    worker.reply({ id: (worker.sent[0] as Query).id, error: 'x' })
    await result
    expect(client.has('kr')).toBe(false)
  })

  it('resolves with an error when the worker fails, and starts a new worker for the next search', async () => {
    const client = createSearchClient(make)
    const result = client.search('a', 'zh', false)
    worker.fail()
    expect(await result).toEqual({ error: expect.any(String) })
    expect(worker.terminated).toBe(true)
    const next = new FakeWorker()
    make.mockReturnValue(next)
    void client.search('a', 'zh', false)
    expect(make).toHaveBeenCalledTimes(2)
    expect(next.sent).toHaveLength(1)
  })

  it('resolves with an error when no worker can be made', async () => {
    const client = createSearchClient(() => {
      throw new Error('no Worker here')
    })
    expect(await client.search('a', 'zh', false)).toEqual({ error: expect.any(String) })
  })
  describe('a search that is matching', () => {
    it('is ended with its worker when a newer search comes, which goes to a new worker', async () => {
      const client = createSearchClient(make)
      const first = client.search('(.*)*x', 'en', true)
      const one = worker.sent[0] as Query
      worker.reply({ id: one.id, matching: true })
      const fresh = new FakeWorker()
      make.mockReturnValue(fresh)
      const second = client.search('Sinclair', 'en', false)
      expect(worker.terminated).toBe(true)
      expect(await first).toEqual({ superseded: true })
      expect(make).toHaveBeenCalledTimes(2)
      expect(worker.sent).toHaveLength(1)
      expect(fresh.sent).toHaveLength(1)
      const two = fresh.sent[0] as Query
      expect(two).toMatchObject({ q: 'Sinclair', lang: 'en', re: false })
      // the old worker is gone: nothing it says counts any more
      worker.reply({ id: two.id, hits: [], total: 0 })
      fresh.reply({ id: two.id, matching: true })
      fresh.reply({ id: two.id, hits: [hit], total: 1 })
      expect(await second).toEqual({ hits: [hit], total: 1 })
    })

    it('forgets the corpora that the ended worker held', async () => {
      const client = createSearchClient(make)
      const done = client.search('a', 'en', false)
      worker.reply({ id: (worker.sent[0] as Query).id, matching: true })
      worker.reply({ id: (worker.sent[0] as Query).id, hits: [], total: 0 })
      await done
      expect(client.has('en')).toBe(true)
      void client.search('(.*)*x', 'kr', true)
      worker.reply({ id: (worker.sent[1] as Query).id, matching: true })
      make.mockReturnValue(new FakeWorker())
      void client.search('b', 'kr', false)
      expect(worker.terminated).toBe(true)
      expect(client.has('en')).toBe(false)
    })

    it('is not ended by a newer search when it has not begun to match: the worker is still downloading', async () => {
      const client = createSearchClient(make)
      const first = client.search('a', 'en', false)
      const second = client.search('ab', 'en', false)
      expect(worker.terminated).toBe(false)
      expect(make).toHaveBeenCalledTimes(1)
      expect(worker.sent).toHaveLength(2)
      expect(await first).toEqual({ superseded: true })
      const [, two] = worker.sent as [Query, Query]
      worker.reply({ id: two.id, hits: [hit], total: 1 })
      expect(await second).toEqual({ hits: [hit], total: 1 })
    })

    it('is not ended by a newer search once it has answered', async () => {
      const client = createSearchClient(make)
      const first = client.search('a', 'en', false)
      const one = worker.sent[0] as Query
      worker.reply({ id: one.id, matching: true })
      worker.reply({ id: one.id, hits: [], total: 0 })
      await first
      void client.search('b', 'en', false)
      expect(worker.terminated).toBe(false)
      expect(make).toHaveBeenCalledTimes(1)
      expect(worker.sent).toHaveLength(2)
    })
  })

  describe('the time a search may take to match', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('is 10 seconds; after that the search ends with an error and its worker is ended', async () => {
      expect(MATCH_LIMIT_MS).toBe(10_000)
      const client = createSearchClient(make)
      const result = client.search('(.*)*x', 'en', true)
      worker.reply({ id: (worker.sent[0] as Query).id, matching: true })
      vi.advanceTimersByTime(MATCH_LIMIT_MS - 1)
      expect(worker.terminated).toBe(false)
      vi.advanceTimersByTime(1)
      expect(worker.terminated).toBe(true)
      const done = await result
      expect(done).toEqual({ error: expect.stringContaining('太久') })
      expect('error' in done && done.error).toContain('改寫')
    })

    it('leaves a worker for the searches after it, and the corpus has to come in again', async () => {
      const client = createSearchClient(make)
      const first = client.search('a', 'en', false)
      worker.reply({ id: (worker.sent[0] as Query).id, matching: true })
      worker.reply({ id: (worker.sent[0] as Query).id, hits: [], total: 0 })
      await first
      const stuck = client.search('(.*)*x', 'en', true)
      worker.reply({ id: (worker.sent[1] as Query).id, matching: true })
      vi.advanceTimersByTime(MATCH_LIMIT_MS)
      await stuck
      expect(client.has('en')).toBe(false)
      const fresh = new FakeWorker()
      make.mockReturnValue(fresh)
      const next = client.search('Sinclair', 'en', false)
      expect(make).toHaveBeenCalledTimes(2)
      const two = fresh.sent[0] as Query
      fresh.reply({ id: two.id, hits: [hit], total: 1 })
      expect(await next).toEqual({ hits: [hit], total: 1 })
      expect(client.has('en')).toBe(true)
    })

    it('does not run out for a search that answers in time', async () => {
      const client = createSearchClient(make)
      const result = client.search('a', 'en', false)
      const one = worker.sent[0] as Query
      worker.reply({ id: one.id, matching: true })
      vi.advanceTimersByTime(MATCH_LIMIT_MS - 1)
      worker.reply({ id: one.id, hits: [hit], total: 1 })
      vi.advanceTimersByTime(MATCH_LIMIT_MS * 3)
      expect(worker.terminated).toBe(false)
      expect(await result).toEqual({ hits: [hit], total: 1 })
    })

    it('does not run before the search begins to match: a long download is not a search that ran too long', () => {
      const client = createSearchClient(make)
      void client.search('a', 'en', false)
      vi.advanceTimersByTime(MATCH_LIMIT_MS * 3)
      expect(worker.terminated).toBe(false)
    })

    it('starts over a newer search that waited behind an older one that ran too long', async () => {
      // the older was still downloading when the newer came; then the worker spent its time on the older
      const client = createSearchClient(make)
      const first = client.search('(.*)*x', 'en', true)
      const second = client.search('Sinclair', 'en', false)
      const [one, two] = worker.sent as [Query, Query]
      expect(worker.terminated).toBe(false)
      expect(await first).toEqual({ superseded: true })
      worker.reply({ id: one.id, matching: true })
      const fresh = new FakeWorker()
      make.mockReturnValue(fresh)
      vi.advanceTimersByTime(MATCH_LIMIT_MS)
      expect(worker.terminated).toBe(true)
      expect(fresh.sent).toHaveLength(1)
      expect(fresh.sent[0]).toMatchObject({ q: 'Sinclair', lang: 'en', re: false })
      const again = fresh.sent[0] as Query
      // it is the same search, asked again
      expect(again.id).toBe(two.id)
      fresh.reply({ id: again.id, hits: [hit], total: 1 })
      expect(await second).toEqual({ hits: [hit], total: 1 })
    })

    it('keeps the time of the newer search when the answer of the older comes after the newer began to match', async () => {
      const client = createSearchClient(make)
      void client.search('a', 'en', false)
      const second = client.search('ab', 'en', false)
      const [one, two] = worker.sent as [Query, Query]
      worker.reply({ id: one.id, matching: true })
      worker.reply({ id: two.id, matching: true })
      worker.reply({ id: one.id, hits: [], total: 0 })
      vi.advanceTimersByTime(MATCH_LIMIT_MS)
      expect(worker.terminated).toBe(true)
      expect(await second).toEqual({ error: expect.stringContaining('太久') })
    })
  })
})
