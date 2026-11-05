import type { Lang, ReviewTab } from './types'

/**
 * Where the page is, as the hash of its URL says: #/, #/f/<path>?u=<key>, #/s?q=…&lang=…&re=1,
 * #/r/<untranslated|checks>?group=…&kind=…&q=…&id=… (kind: the status of the untranslated, the code of a check).
 */
export type Route =
  | { kind: 'home' }
  | { kind: 'file'; path: string; ptr?: string }
  | { kind: 'search'; q: string; lang: Lang; re: boolean }
  | { kind: 'review'; tab: ReviewTab; group: string; sub: string; q: string; id?: string }

const LANGS: readonly string[] = ['kr', 'jp', 'en', 'zh']
const REVIEW_TABS: readonly string[] = ['untranslated', 'checks']

/** decodeURIComponent that keeps the text as it is where the escape is not valid. */
function decode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function params(query: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const pair of query.split('&')) {
    if (pair === '') continue
    const eq = pair.indexOf('=')
    const key = decode(eq < 0 ? pair : pair.slice(0, eq))
    if (!out.has(key)) out.set(key, eq < 0 ? '' : decode(pair.slice(eq + 1)))
  }
  return out
}

/** A file path names a file under data/files/: no empty segment, and no . or .. */
function isFilePath(path: string): boolean {
  return path.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..')
}

/** The route of a location.hash. What is not a route of ours is home. */
export function parseHash(hash: string): Route {
  const h = hash.startsWith('#') ? hash.slice(1) : hash
  const cut = h.indexOf('?')
  const pathname = cut < 0 ? h : h.slice(0, cut)
  const query = params(cut < 0 ? '' : h.slice(cut + 1))

  if (pathname.startsWith('/f/')) {
    const path = pathname.slice(3).split('/').map(decode).join('/')
    if (!isFilePath(path)) return { kind: 'home' }
    const ptr = query.get('u')
    return ptr ? { kind: 'file', path, ptr } : { kind: 'file', path }
  }
  if (pathname === '/s') {
    const lang = query.get('lang') ?? ''
    return {
      kind: 'search',
      q: query.get('q') ?? '',
      lang: LANGS.includes(lang) ? (lang as Lang) : 'zh',
      re: query.get('re') === '1',
    }
  }
  if (pathname === '/r' || pathname.startsWith('/r/')) {
    const tab = pathname === '/r' ? 'untranslated' : pathname.slice(3)
    if (!REVIEW_TABS.includes(tab)) return { kind: 'home' }
    const id = query.get('id')
    return {
      kind: 'review',
      tab: tab as ReviewTab,
      group: query.get('group') ?? '',
      sub: query.get('kind') ?? '',
      q: query.get('q') ?? '',
      ...(id ? { id } : {}),
    }
  }
  return { kind: 'home' }
}

/** The hash of a file, and of a unit of it when ptr is given. Each segment of the path is encoded; the slashes stay. */
export function fileHref(path: string, ptr?: string): string {
  const base = `#/f/${path.split('/').map(encodeURIComponent).join('/')}`
  return ptr ? `${base}?u=${encodeURIComponent(ptr)}` : base
}

/** The hash of a full-text search. */
export function searchHref(q: string, lang: Lang, re: boolean): string {
  return `#/s?q=${encodeURIComponent(q)}&lang=${lang}${re ? '&re=1' : ''}`
}

/** The hash of a page of the review, with the filters and the item to scroll to that are given. */
export function reviewHref(tab: ReviewTab, opts: { group?: string; sub?: string; q?: string; id?: string } = {}): string {
  const pairs: [string, string][] = []
  if (opts.group) pairs.push(['group', opts.group])
  if (opts.sub) pairs.push(['kind', opts.sub])
  if (opts.q) pairs.push(['q', opts.q])
  if (opts.id) pairs.push(['id', opts.id])
  const query = pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  return `#/r/${tab}${query ? `?${query}` : ''}`
}
