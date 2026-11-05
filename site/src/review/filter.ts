import type { CheckItem, FileSummary, Index } from '../types'

/** What the address says of the filters of a page of the review. */
export interface ReviewFilter {
  group: string
  /** The status of the untranslated ('absent': the files the release has none of), the code of a check. */
  sub: string
  q: string
}

/** The units of a file that a reviewer has to translate: EN, KR and missing. */
export function untranslatedCount(f: FileSummary): number {
  return (f.status.en ?? 0) + (f.status.kr ?? 0) + (f.status.missing ?? 0)
}

/**
 * The files that have something untranslated (of the status `sub`, or 'absent'),
 * in the group and with the text in their path or label; the most first, then in the order of the index.
 */
export function filterUntranslated(index: Index, f: ReviewFilter): FileSummary[] {
  const needle = f.q.trim().toLowerCase()
  const count = (s: FileSummary): number => {
    if (f.sub === 'absent') return s.absent ? s.units : 0
    if (f.sub === 'en' || f.sub === 'kr' || f.sub === 'missing') return s.status[f.sub] ?? 0
    return untranslatedCount(s)
  }
  return index.files
    .map((s, n) => ({ s, n, c: count(s) }))
    .filter(({ s, c }) => c > 0 && (f.group === '' || s.group === f.group) && (needle === '' || s.path.toLowerCase().includes(needle) || s.label.toLowerCase().includes(needle)))
    .sort((a, b) => b.c - a.c || a.n - b.n)
    .map(({ s }) => s)
}

/** The path of a unit key, "<file path>|<key>". */
export function pathOf(key: string): string {
  const bar = key.indexOf('|')
  return bar < 0 ? key : key.slice(0, bar)
}

/** The findings of the code `sub`, with a unit in a file of the group, and the text in their ID, texts or keys. The one the address names always stays. */
export function filterChecks(items: CheckItem[], f: ReviewFilter, groupOf: (path: string) => string | undefined, target?: string): CheckItem[] {
  const needle = f.q.trim().toLowerCase()
  return items.filter(
    (c) =>
      c.id === target ||
      ((f.sub === '' || c.code === f.sub) &&
        (f.group === '' || c.keys.some((k) => groupOf(pathOf(k)) === f.group)) &&
        (needle === '' || [c.id, c.kr, c.zh, ...c.keys].some((t) => t.toLowerCase().includes(needle)))),
  )
}

const SYNTAX = /[\\^$.*+?()[\]{}|/]/g

/** A pattern that marks what a finding is about in a raw string: its tokens, and for a tag every tag of that name. */
export function findingMark(c: Pick<CheckItem, 'code' | 'miss' | 'extra'>): RegExp | undefined {
  const parts = [...c.miss, ...c.extra].map((t) => {
    if (c.code === 'tag') {
      const m = /^<\/?([a-z-]+)>$/.exec(t)
      if (m?.[1]) return `</?${m[1]}(?:[= ][^<>]*)?>`
    }
    return t.replace(SYNTAX, '\\$&')
  })
  if (parts.length === 0) return undefined
  return new RegExp([...new Set(parts)].join('|'), c.code === 'tag' ? 'gi' : 'g')
}
