// The search itself, without the Worker around it: the messages, the cache of
// what was downloaded, and the matching of a corpus. The worker script and the
// tests both drive this.
import type { Lang } from '../types'
import { makeMatcher, stripTags, type Matcher, type Ranges } from './match'

/** A search, as the page sends it. `base` is where data/ is, as an absolute URL ending in a slash. */
export type Query = { id: number; q: string; lang: Lang; re: boolean; base: string }

/** A string that holds the query: `ranges` are offsets in `text`, the string with its tags stripped. */
export type Hit = { file: number; ptr: string; text: string; ranges: Ranges }

/** The answer to the query of the same id. */
export type Reply = { id: number; hits: Hit[]; total: number } | { id: number; error: string }

/**
 * Said before the answer: the corpus of the query is in and the matching has
 * begun. From then on the worker is busy and cannot be told to stop; the page
 * can only end it.
 */
export type Matching = { id: number; matching: true }

/** What the worker posts to the page: a `Matching`, then the `Reply`. */
export type WorkerMessage = Matching | Reply

/** How many hits an answer carries; the total counts them all. */
export const LIMIT = 1000

/**
 * The strings of `texts` (already stripped of tags) that hold the query, in the
 * order of the corpus: `keys[k]` is the file number and the pointer of
 * `texts[k]`. Only the first `limit` come back, and `total` counts all.
 */
export function searchCorpus(
  keys: readonly (readonly [number, string])[],
  texts: readonly string[],
  match: Matcher,
  limit = LIMIT,
): { hits: Hit[]; total: number } {
  const hits: Hit[] = []
  let total = 0
  for (let k = 0; k < keys.length; k++) {
    const text = texts[k]
    const key = keys[k]
    if (text === undefined || text === '' || key === undefined) continue
    const ranges = match(text)
    if (ranges.length === 0) continue
    total++
    if (hits.length < limit) hits.push({ file: key[0], ptr: key[1], text, ranges })
  }
  return { hits, total }
}

/** Gets the JSON at a URL; throws if it cannot. */
export type FetchJson = (url: string) => Promise<unknown>

const fetchJson: FetchJson = async (url) => {
  // no-cache: ask the server whether the file is still the same, as data.ts does
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function unusable(url: string): Error {
  return new Error(`${url}：資料格式不符，請重新整理後再試`)
}

/**
 * Answers queries. The first search of a language downloads search/keys.json
 * and the corpus of that language; both stay in memory, the corpus already
 * stripped of tags, so a query only matches.
 */
export class SearchEngine {
  private readonly get: FetchJson
  private readonly keys = new Map<string, Promise<[number, string][]>>()
  private readonly corpora = new Map<string, Promise<string[]>>()

  constructor(get: FetchJson = fetchJson) {
    this.get = get
  }

  /**
   * The answer to a query. It does not throw: a failure is an `error` reply.
   * `matching` is called once the corpus is in and before it is matched, which
   * is the part that can take long (and, for a bad pattern, forever).
   */
  async run(msg: Query, matching: (message: Matching) => void = () => {}): Promise<Reply> {
    // A query that cannot be matched downloads nothing.
    const match = makeMatcher(msg.q, msg.re)
    if (typeof match !== 'function') return { id: msg.id, error: match.error }
    try {
      const keysUrl = `${msg.base}search/keys.json`
      const textsUrl = `${msg.base}search/${msg.lang}.json`
      const [keys, texts] = await Promise.all([this.keysOf(keysUrl), this.textsOf(textsUrl)])
      if (texts.length !== keys.length) throw unusable(textsUrl)
      matching({ id: msg.id, matching: true })
      return { id: msg.id, ...searchCorpus(keys, texts, match) }
    } catch (e) {
      return { id: msg.id, error: e instanceof Error ? e.message : String(e) }
    }
  }

  private keysOf(url: string): Promise<[number, string][]> {
    return this.once(this.keys, url, (doc) => {
      if (!Array.isArray(doc)) throw unusable(url)
      return doc as [number, string][]
    })
  }

  private textsOf(url: string): Promise<string[]> {
    return this.once(this.corpora, url, (doc) => {
      if (!Array.isArray(doc)) throw unusable(url)
      // Strip once, here, and keep only the stripped strings.
      return doc.map((s: unknown) => {
        if (typeof s !== 'string') throw unusable(url)
        return stripTags(s)
      })
    })
  }

  /** What `make` gives for the JSON at url, downloaded once: a failure is not kept, so the next query tries again. */
  private once<T>(cache: Map<string, Promise<T>>, url: string, make: (doc: unknown) => T): Promise<T> {
    const known = cache.get(url)
    if (known) return known
    const p = (async () => {
      let doc: unknown
      try {
        doc = await this.get(url)
      } catch (e) {
        throw new Error(`下載 ${url} 失敗：${e instanceof Error ? e.message : String(e)}，請重新整理後再試`)
      }
      return make(doc)
    })()
    cache.set(url, p)
    p.catch(() => {
      if (cache.get(url) === p) cache.delete(url)
    })
    return p
  }
}
