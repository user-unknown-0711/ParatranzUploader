// The page's side of the search: one worker, one search at a time. A new search
// ends the one before it. A worker that is matching cannot be told to stop, so
// a search that is replaced while it matches, or that matches too long, takes
// its worker with it, and the next search gets a new one.
import type { Lang } from '../types'
import type { Hit, Query, WorkerMessage } from './engine'

/** What a search comes to: its hits, an error to show, or "a newer search took its place". */
export type SearchResult = { hits: Hit[]; total: number } | { error: string } | { superseded: true }

/** The part of a Worker the client uses, so that a test can stand one in. */
export interface SearchWorker {
  postMessage(message: Query): void
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  terminate?(): void
}

export interface SearchClient {
  /** Search language `lang` for q, as text or (re) as a regular expression. Never rejects. */
  search(q: string, lang: Lang, re: boolean): Promise<SearchResult>
  /** Whether the worker holds the corpus of `lang`: a search of it has been answered, so it downloads nothing. */
  has(lang: Lang): boolean
}

/**
 * How long a search may match, in milliseconds, from the worker's message that
 * the matching began. A regular expression can take for ever (`(a+)+$`); after
 * this the worker is ended and the search comes to an error.
 */
export const MATCH_LIMIT_MS = 10_000

const TOO_LONG = '搜尋執行太久，已停止。正規表示式可能太複雜，請改寫後再試。'

/** The worker script. After a build it is a file under assets/, found from this module. */
function defaultWorker(): SearchWorker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
}

/**
 * Where the data is, as an absolute URL: next to the page. The worker lives
 * under assets/ after a build, so a relative ./data/ would be found from there.
 */
function dataBase(): string {
  return new URL('data/', document.baseURI).href
}

/** A client of the worker that `make` makes; it is made at the first search. */
export function createSearchClient(make: () => SearchWorker = defaultWorker): SearchClient {
  let worker: SearchWorker | undefined
  let nextId = 0
  /** The search that has no answer yet and was not replaced. */
  let current: { id: number; q: string; lang: Lang; re: boolean; resolve: (result: SearchResult) => void } | undefined
  /** The language of each query that has no answer yet, by id. */
  const asked = new Map<number, Lang>()
  const loaded = new Set<Lang>()
  /** The query the worker said it is matching, with the timer that ends the worker if it takes too long. */
  let busy: { id: number; timer: ReturnType<typeof setTimeout> } | undefined

  /** Ends the search in progress, if there is one. */
  function settle(result: SearchResult): void {
    const search = current
    current = undefined
    search?.resolve(result)
  }

  /** Ends the worker, if there is one, and forgets what it held: the next search makes a new one. */
  function discard(): void {
    const w = worker
    worker = undefined
    if (busy) clearTimeout(busy.timer)
    busy = undefined
    asked.clear()
    loaded.clear()
    if (w) {
      w.onmessage = null
      w.onerror = null
      w.terminate?.()
    }
  }

  /** The worker has begun to match query `id`: it has `MATCH_LIMIT_MS` to answer. */
  function watch(id: number): void {
    if (busy) clearTimeout(busy.timer)
    busy = { id, timer: setTimeout(() => expire(id), MATCH_LIMIT_MS) }
  }

  function expire(id: number): void {
    if (busy?.id !== id) return
    const waiting = current
    discard()
    if (waiting === undefined) return
    if (waiting.id === id) {
      settle({ error: TOO_LONG })
      return
    }
    // The worker was held up by an older search, which was replaced while it downloaded. This one only waited behind it.
    send(waiting)
  }

  function start(): SearchWorker {
    if (worker) return worker
    const w = make()
    w.onmessage = (event) => {
      if (w !== worker) return
      const message = event.data
      if ('matching' in message) {
        if (asked.has(message.id)) watch(message.id)
        return
      }
      const lang = asked.get(message.id)
      asked.delete(message.id)
      if (busy?.id === message.id) {
        clearTimeout(busy.timer)
        busy = undefined
      }
      // A late answer to a search that was replaced still means the corpus came in.
      if (lang !== undefined && 'hits' in message) loaded.add(lang)
      if (current?.id !== message.id) return
      settle('error' in message ? { error: message.error } : { hits: message.hits, total: message.total })
    }
    w.onerror = () => {
      if (w !== worker) return
      discard()
      settle({ error: '搜尋程式發生錯誤，請重新整理後再試' })
    }
    worker = w
    return w
  }

  /** Sends a search to the worker, which is made if there is none. */
  function send(search: NonNullable<typeof current>): void {
    let w: SearchWorker
    try {
      w = start()
    } catch {
      settle({ error: '這個瀏覽器無法執行全文搜尋' })
      return
    }
    asked.set(search.id, search.lang)
    w.postMessage({ id: search.id, q: search.q, lang: search.lang, re: search.re, base: dataBase() })
  }

  return {
    search(q, lang, re) {
      // A worker that is matching the search being replaced cannot be told to stop: end it.
      if (current !== undefined && busy?.id === current.id) discard()
      settle({ superseded: true })
      return new Promise((resolve) => {
        current = { id: ++nextId, q, lang, re, resolve }
        send(current)
      })
    },
    has: (lang) => loaded.has(lang),
  }
}

/** The client of the page. */
export const searchClient = createSearchClient()
