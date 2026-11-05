import type { CheckItem, FileData, Index, Meta, Models } from './types'

/** The version of the layout and keys of the data that this page reads. */
const FORMAT = 1

/** Where the data is: next to the page, under ./data/. */
const ROOT = './data/'

/**
 * Why data could not be read. `format`: it is a version this page does not
 * know, or not what the layout says. `missing`: the server has no such file,
 * as after a new deployment replaced the data. `network`: no answer, or a
 * server error. For the first two a reload fetches a page that fits the data.
 */
export class DataError extends Error {
  readonly kind: 'format' | 'missing' | 'network'

  constructor(kind: 'format' | 'missing' | 'network', message?: string) {
    super(message ?? `data error: ${kind}`)
    this.name = 'DataError'
    this.kind = kind
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const cache = new Map<string, Promise<unknown>>()

/** Forget what was loaded, so that the next load asks the server again. For tests. */
export function clearDataCache(): void {
  cache.clear()
}

/** One JSON file under ./data/, fetched once: later calls get the same promise. A failure is not kept. */
function load<T>(rel: string, check: (doc: unknown) => T): Promise<T> {
  const cached = cache.get(rel)
  if (cached) return cached as Promise<T>
  const p = (async () => {
    let res: Response
    try {
      // no-cache: ask the server whether the file is still the same (a 304 costs little)
      // so that a page never mixes files of two deployments for the length of a max-age.
      res = await fetch(ROOT + rel, { cache: 'no-cache' })
    } catch (e) {
      throw new DataError('network', `${rel}: ${String(e)}`)
    }
    if (res.status === 404) throw new DataError('missing', `${rel}: HTTP 404`)
    if (!res.ok) throw new DataError('network', `${rel}: HTTP ${res.status}`)
    let doc: unknown
    try {
      doc = await res.json()
    } catch {
      throw new DataError('format', `${rel}: not JSON`)
    }
    return check(doc)
  })()
  cache.set(rel, p)
  p.catch(() => {
    if (cache.get(rel) === p) cache.delete(rel)
  })
  return p
}

export function loadMeta(): Promise<Meta> {
  return load('meta.json', (doc) => {
    if (!isRecord(doc)) throw new DataError('format', 'meta.json: not an object')
    if (doc.format !== FORMAT) throw new DataError('format', `meta.json: format ${String(doc.format)}, this page reads ${FORMAT}`)
    return doc as unknown as Meta
  })
}

export function loadIndex(): Promise<Index> {
  return load('index.json', (doc) => {
    if (!isRecord(doc) || !Array.isArray(doc.groups) || !Array.isArray(doc.files)) {
      throw new DataError('format', 'index.json: no groups and files')
    }
    return doc as unknown as Index
  })
}

/** A file of data/files/, by its path in the index (such as "StoryData/S001A.json"). */
export function loadFile(path: string): Promise<FileData> {
  const rel = `files/${path.split('/').map(encodeURIComponent).join('/')}`
  return load(rel, (doc) => {
    if (!isRecord(doc) || !Array.isArray(doc.units)) throw new DataError('format', `${rel}: no units`)
    return doc as unknown as FileData
  })
}

/** data/models.json: the speaker names of the story lines that have a model and no teller. */
export function loadModels(): Promise<Models> {
  return load('models.json', (doc) => {
    if (!isRecord(doc)) throw new DataError('format', 'models.json: not an object')
    return doc as Models
  })
}

/** data/review/checks.json: the findings of the checks. */
export function loadChecks(): Promise<CheckItem[]> {
  return load('review/checks.json', (doc) => {
    if (!isRecord(doc) || !Array.isArray(doc.items)) throw new DataError('format', 'review/checks.json: no items')
    return doc.items as CheckItem[]
  })
}

/** Where the substring q is in the path, the label or a speaker of each file (any case): positions in index.files. An empty q is every file. */
export function filterFiles(index: Index, q: string): number[] {
  const needle = q.trim().toLowerCase()
  const all = index.files.map((_, n) => n)
  if (needle === '') return all
  return all.filter((n) => {
    const f = index.files[n]
    if (!f) return false
    return [f.path, f.label, ...f.speakers].some((s) => s.toLowerCase().includes(needle))
  })
}
