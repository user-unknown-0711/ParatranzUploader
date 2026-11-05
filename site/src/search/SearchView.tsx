import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { loadFile } from '../data'
import { fileHref, searchHref } from '../route'
import { LANGS } from '../settings'
import { TmpText } from '../tmp/TmpText'
import { LANG_ATTR, type FileSummary, type Index, type Lang, type Unit } from '../types'
import { LANG_LABEL } from '../view/Cell'
import { searchClient, type SearchClient } from './client'
import type { Hit } from './engine'
import type { Ranges } from './match'

const number = new Intl.NumberFormat('en-US')

const LANG_NAME: Record<Lang, string> = { kr: '韓文', jp: '日文', en: '英文', zh: '繁體中文' }

type Outcome = { key: string } & ({ status: 'done'; hits: Hit[]; total: number } | { status: 'error'; message: string })

/** The outcome of searching `lang` for q; undefined while the search is on its way (and for an empty q, which is not searched). */
function useSearch(client: SearchClient, q: string, lang: Lang, re: boolean): Outcome | undefined {
  const key = `${lang}\n${re ? 1 : 0}\n${q}`
  const [outcome, setOutcome] = useState<Outcome>()
  useEffect(() => {
    if (q === '') return
    let live = true
    client.search(q, lang, re).then((result) => {
      if (!live || 'superseded' in result) return
      setOutcome('error' in result ? { key, status: 'error', message: result.error } : { key, status: 'done', ...result })
    })
    return () => {
      live = false
    }
  }, [client, q, lang, re])
  return outcome?.key === key ? outcome : undefined
}

/** True once the element has been on screen (or near it); at once where the browser cannot tell. */
function useSeen() {
  const ref = useRef<HTMLElement>(null)
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (seen || el === null) return
    const watch = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true)
      },
      { rootMargin: '200px 0px' },
    )
    watch.observe(el)
    return () => watch.disconnect()
  }, [seen])
  return [ref, seen] as const
}

/** The units of a file by pointer, once the file is loaded; undefined until then, and where it cannot be loaded. */
function useUnits(path: string, wanted: boolean): { units?: Map<string, Unit>; failed: boolean } {
  const [state, setState] = useState<{ path: string; units?: Map<string, Unit>; failed: boolean }>()
  useEffect(() => {
    if (!wanted) return
    let live = true
    loadFile(path).then(
      (file) => {
        if (live) setState({ path, units: new Map(file.units.map((u) => [u.p, u])), failed: false })
      },
      () => {
        // The hits are shown without it; the group says why the rest is missing.
        if (live) setState({ path, failed: true })
      },
    )
    return () => {
      live = false
    }
  }, [path, wanted])
  return state?.path === path ? state : { failed: false }
}

/** text with the ranges in <mark>. The text is inserted as text. */
function Marked({ text, ranges }: { text: string; ranges: Ranges }) {
  const parts: ComponentChildren[] = []
  let at = 0
  ranges.forEach(([start, end], k) => {
    if (start > at) parts.push(text.slice(at, start))
    parts.push(<mark key={k}>{text.slice(start, end)}</mark>)
    at = end
  })
  if (at < text.length) parts.push(text.slice(at))
  return <>{parts}</>
}

interface HitRowProps {
  path: string
  hit: Hit
  /** The language that was searched. */
  lang: Lang
  /** The units of the file; undefined while it loads. */
  units?: Map<string, Unit>
  failed: boolean
}

/** One hit: the string that holds the query, marked, and the KR and the TW of the same unit. */
function HitRow({ path, hit, lang, units, failed }: HitRowProps) {
  const unit = units?.get(hit.ptr)
  const shown: Lang[] = lang === 'kr' || lang === 'zh' ? ['kr', 'zh'] : ['kr', lang, 'zh']
  // The field of the unit, once the file is in; until then (and where it cannot be loaded) the last segment of the key.
  // For a string in a list that is a number, which says nothing, and the field is the name of the list.
  const field = unit?.f ?? hit.ptr.slice(hit.ptr.lastIndexOf('->') + 2)
  return (
    <li class="hit">
      <a class="hit-link" href={fileHref(path, hit.ptr)} data-ptr={hit.ptr}>
        <span class="hit-field" title={hit.ptr}>
          {field}
        </span>
        {shown.map((l) => {
          const found = l === lang
          let body: ComponentChildren
          if (found) body = <Marked text={hit.text} ranges={hit.ranges} />
          else if (unit?.[l] !== undefined) body = <TmpText text={unit[l] ?? ''} raw={false} lang={l} />
          else if (units === undefined && !failed) body = <span class="hit-wait">…</span>
          else body = <span class="missing">—</span>
          return (
            <div key={l} class={found ? `hit-line hit-${l} is-hit` : `hit-line hit-${l}`} data-lang={l}>
              <span class="hit-lang">{LANG_LABEL[l]}</span>
              <span class="hit-text" lang={LANG_ATTR[l]}>
                {body}
              </span>
            </div>
          )
        })}
      </a>
    </li>
  )
}

interface GroupProps {
  summary: FileSummary
  hits: Hit[]
  lang: Lang
}

/** The hits in one file. The file is loaded once the group is on screen. */
function Group({ summary, hits, lang }: GroupProps) {
  const [ref, seen] = useSeen()
  const { units, failed } = useUnits(summary.path, seen)
  return (
    <section class="hit-group" ref={ref}>
      <h2 class="group-head">
        <a class="group-path" href={fileHref(summary.path)}>
          {summary.path}
        </a>
        {summary.label !== '' && <span class="group-label">{summary.label}</span>}
        <span class="group-count">{hits.length} 筆</span>
      </h2>
      {failed && <p class="group-error">無法載入這個檔案，只顯示命中的字串。</p>}
      <ul class="hits">
        {hits.map((hit) => (
          <HitRow key={hit.ptr} path={summary.path} hit={hit} lang={lang} units={units} failed={failed} />
        ))}
      </ul>
    </section>
  )
}

/** The hits by file, in the order of the first hit of each; a hit of a file the index does not have is left out. */
function groupByFile(hits: Hit[], index: Index): { summary: FileSummary; hits: Hit[] }[] {
  const groups = new Map<number, { summary: FileSummary; hits: Hit[] }>()
  for (const hit of hits) {
    const summary = index.files[hit.file]
    if (summary === undefined) continue
    const group = groups.get(hit.file)
    if (group) group.hits.push(hit)
    else groups.set(hit.file, { summary, hits: [hit] })
  }
  return [...groups.values()]
}

export interface SearchViewProps {
  q: string
  /** The language searched. */
  lang: Lang
  /** Take q as a regular expression. */
  re: boolean
  index: Index
  /** The search worker's client; the page's own by default. */
  client?: SearchClient
}

/** The result of a full-text search: its options, the count, and the hits grouped by file. */
export function SearchView({ q, lang, re, index, client = searchClient }: SearchViewProps) {
  const outcome = useSearch(client, q, lang, re)
  const groups = useMemo(() => (outcome?.status === 'done' ? groupByFile(outcome.hits, index) : []), [outcome, index])
  const go = (nextLang: Lang, nextRe: boolean) => {
    location.hash = searchHref(q, nextLang, nextRe)
  }

  let state: 'empty' | 'pending' | 'done' | 'error'
  let status: string
  if (q === '') {
    state = 'empty'
    status = '請在頁首的全文搜尋框輸入要找的文字。'
  } else if (outcome === undefined) {
    state = 'pending'
    status = client.has(lang) ? '搜尋中…' : '下載中…（第一次搜尋這種語言，要先下載它的資料）'
  } else if (outcome.status === 'error') {
    state = 'error'
    status = ''
  } else {
    state = 'done'
    const shown = outcome.hits.length
    if (outcome.total === 0) status = '沒有找到符合的字串。'
    else if (outcome.total > shown) status = `共 ${number.format(outcome.total)} 筆命中，只顯示前 ${number.format(shown)} 筆。`
    else status = `共 ${number.format(outcome.total)} 筆命中。`
  }

  return (
    <section class="search-view" data-state={state}>
      <h1 class="search-title">
        全文搜尋{q !== '' && '：'}
        <span class="search-q">{q}</span>
      </h1>
      <div class="search-opts">
        <label>
          <span>搜尋語言</span>
          <select name="lang" value={lang} onChange={(e) => go(e.currentTarget.value as Lang, re)}>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {LANG_LABEL[l]} {LANG_NAME[l]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" name="re" checked={re} onChange={(e) => go(lang, e.currentTarget.checked)} />
          <span>正規表示式</span>
        </label>
      </div>
      {outcome?.status === 'error' ? (
        <div class="notice" role="alert">
          <p>{outcome.message}</p>
        </div>
      ) : (
        <p class="search-status" role="status">
          {status}
        </p>
      )}
      {groups.map((g) => (
        <Group key={g.summary.path} summary={g.summary} hits={g.hits} lang={lang} />
      ))}
    </section>
  )
}
