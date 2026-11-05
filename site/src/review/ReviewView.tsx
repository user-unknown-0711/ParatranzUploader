import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Notice } from '../app/Notice'
import { DataError, loadChecks } from '../data'
import { fileHref, reviewHref, type Route } from '../route'
import type { Settings } from '../settings'
import { TmpText } from '../tmp/TmpText'
import { LANG_ATTR, type CheckItem, type Index, type Lang, type Meta } from '../types'
import { filterChecks, filterUntranslated, findingMark, untranslatedCount } from './filter'
import { CHECK_CODES, CHECK_INFO, STATUS_INFO } from './names'

type ReviewRoute = Extract<Route, { kind: 'review' }>

const PAGE = 100
const number = new Intl.NumberFormat('en-US')

/** Goes to the page with other filters; a change of the text replaces the entry so that typing leaves one step in the history. */
function go(route: ReviewRoute, change: Partial<Pick<ReviewRoute, 'group' | 'sub' | 'q'>>, replace = false): void {
  const href = reviewHref(route.tab, { group: route.group, sub: route.sub, q: route.q, ...change })
  if (replace) location.replace(href)
  else location.hash = href
}

interface Option {
  value: string
  label: string
}

function Select({ name, label, value, options, onChange }: { name: string; label: string; value: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    <label>
      {label}
      <select name={name} value={value} onChange={(e) => onChange(e.currentTarget.value)}>
        <option value="">全部</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

interface ToolsProps {
  route: ReviewRoute
  groups: string[]
  kinds: Option[]
  kindLabel: string
  placeholder: string
  count: number
}

function Tools({ route, groups, kinds, kindLabel, placeholder, count }: ToolsProps) {
  return (
    <div class="rv-tools">
      <Select name="group" label="群組" value={route.group} options={groups.map((g) => ({ value: g, label: g }))} onChange={(group) => go(route, { group })} />
      <Select name="kind" label={kindLabel} value={route.sub} options={kinds} onChange={(sub) => go(route, { sub })} />
      <input type="search" name="q" placeholder={placeholder} aria-label="篩選文字" value={route.q} onInput={(e) => go(route, { q: e.currentTarget.value }, true)} />
      <span class="rv-count">符合 {number.format(count)} 項</span>
    </div>
  )
}

/** Items a page at a time; the one the address names is always shown, and scrolled to. */
function ItemList<T>({ items, target, idOf, render }: { items: T[]; target?: string; idOf: (item: T) => string; render: (item: T, previous: T | undefined) => ComponentChildren }) {
  const [limit, setLimit] = useState(PAGE)
  const box = useRef<HTMLDivElement>(null)
  const at = target === undefined ? -1 : items.findIndex((it) => idOf(it) === target)
  const shown = Math.min(items.length, Math.max(limit, at + 1))
  useEffect(() => {
    box.current?.querySelector('.is-target')?.scrollIntoView?.({ block: 'center' })
  }, [target, at >= 0])
  if (items.length === 0) return <p class="rv-empty">沒有符合的項目</p>
  return (
    <>
      <div class="rv-list" ref={box}>
        {items.slice(0, shown).map((it, k) => render(it, items[k - 1]))}
      </div>
      {shown < items.length && (
        <button type="button" class="rv-more" onClick={() => setLimit(shown + PAGE)}>
          再顯示 {PAGE} 項（共 {number.format(items.length)}）
        </button>
      )}
    </>
  )
}

const UNTRANSLATED_KINDS: Option[] = [
  { value: 'en', label: STATUS_INFO.en.name },
  { value: 'kr', label: STATUS_INFO.kr.name },
  { value: 'missing', label: STATUS_INFO.missing.name },
  { value: 'absent', label: 'release 沒有的檔案' },
]

function Untranslated({ route, index, meta, onReviewFile }: { route: ReviewRoute; index: Index; meta: Meta; onReviewFile: () => void }) {
  const files = useMemo(() => filterUntranslated(index, route), [index, route.group, route.sub, route.q])
  const groups = useMemo(() => [...new Set(index.files.filter((f) => untranslatedCount(f) > 0).map((f) => f.group))], [index])
  return (
    <>
      <Tools route={route} groups={groups} kinds={UNTRANSLATED_KINDS} kindLabel="狀態" placeholder="篩選檔名、地點" count={files.length} />
      <p class="rv-lede">點檔名會打開檔案並只顯示需要審核的單位（可在檔案頁取消）。</p>
      <div class="rv-body">
        <ItemList
          key={`${route.group}|${route.sub}|${route.q}`}
          items={files}
          idOf={(f) => f.path}
          render={(f) => (
            <article key={f.path} class="rv-card rv-file" data-path={f.path}>
              <div class="rv-head">
                <a class="rv-path" href={fileHref(f.path)} onClick={onReviewFile}>
                  {f.path}
                </a>
                {f.label !== '' && <span class="rv-where">{f.label}</span>}
                {f.absent && <span class="status status-missing">release 沒有這個檔案</span>}
              </div>
              <ul class="rv-counts">
                {(['en', 'kr', 'missing'] as const).map((s) =>
                  (f.status[s] ?? 0) > 0 ? (
                    <li key={s}>
                      <span class={`status status-${s}`}>{STATUS_INFO[s].name}</span> {number.format(f.status[s] ?? 0)}
                    </li>
                  ) : null,
                )}
                <li class="muted">
                  共 {number.format(f.units)} 個單位，已翻譯 {number.format(f.status.tw ?? 0)}
                </li>
              </ul>
            </article>
          )}
        />
      </div>
      {meta.orphans.length > 0 && (
        <section class="rv-orphans">
          <h2>只在 release 裡的檔案（{meta.orphans.length}）</h2>
          <p>Assets 裡沒有這些檔案的原文（可能已從遊戲移除或改名），網站不顯示它們的內容。</p>
          <ul>
            {meta.orphans.map((p) => (
              <li key={p}>
                <code>{p}</code>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function TextRow({ label, lang, text, raw, mark }: { label: string; lang: Lang; text: string; raw: boolean; mark?: RegExp }) {
  return (
    <>
      <dt>{label}</dt>
      <dd lang={LANG_ATTR[lang]}>
        <TmpText text={text} raw={raw} lang={lang} {...(mark ? { mark } : {})} />
      </dd>
    </>
  )
}

const SHOWN_KEYS = 12

function CheckCard({ item, target, raw }: { item: CheckItem; target: boolean; raw: boolean }) {
  const info = CHECK_INFO[item.code] ?? { name: item.code, desc: '' }
  // Tokens and tags are only seen, and marked, in the string as it is.
  const showRaw = raw || item.code === 'placeholder' || item.code === 'keyword' || item.code === 'tag'
  const mark = findingMark(item)
  const [all, setAll] = useState(false)
  const keys = all ? item.keys : item.keys.slice(0, SHOWN_KEYS)
  return (
    <article class={target ? 'rv-card is-target' : 'rv-card'} data-id={item.id} id={`check-${item.id}`}>
      <div class="rv-head">
        <span class="rv-kind rv-kind-warn">{info.name}</span>
        <span class="rv-where">{item.keys.length} 個單位用了同一句</span>
        <a class="rv-id" href={reviewHref('checks', { id: item.id })} title="這一項的連結">
          {item.id}
        </a>
      </div>
      <p class="rv-msg">
        {item.miss.length > 0 && (
          <>
            原文有、譯文沒有：
            {item.miss.map((t) => (
              <code key={t} class="tok-miss">
                {t}
              </code>
            ))}
          </>
        )}
        {item.miss.length > 0 && item.extra.length > 0 && '；'}
        {item.extra.length > 0 && (
          <>
            {item.code === 'hangul' || item.code === 'llc' ? '譯文裡有：' : '譯文多出：'}
            {item.extra.map((t) => (
              <code key={t} class="tok-extra">
                {t}
              </code>
            ))}
          </>
        )}
      </p>
      <dl class="rv-src">
        <TextRow label="KR" lang="kr" text={item.kr} raw={showRaw} {...(mark ? { mark } : {})} />
        <TextRow label="TW" lang="zh" text={item.zh} raw={showRaw} {...(mark ? { mark } : {})} />
      </dl>
      <div class="rv-units">
        {keys.map((k) => {
          const bar = k.indexOf('|')
          const path = k.slice(0, bar)
          const ptr = k.slice(bar + 1)
          return (
            <a key={k} href={fileHref(path, ptr)} title={k}>
              {path} <span class="muted">{ptr}</span>
            </a>
          )
        })}
        {!all && item.keys.length > SHOWN_KEYS && (
          <button type="button" class="link" onClick={() => setAll(true)}>
            還有 {item.keys.length - SHOWN_KEYS} 個單位
          </button>
        )}
      </div>
    </article>
  )
}

type Loaded = { status: 'ready'; items: CheckItem[] } | { status: 'error'; error: DataError }

function useChecks(): Loaded | undefined {
  const [state, setState] = useState<Loaded>()
  useEffect(() => {
    let live = true
    loadChecks().then(
      (items) => live && setState({ status: 'ready', items }),
      (e: unknown) => live && setState({ status: 'error', error: e instanceof DataError ? e : new DataError('network', String(e)) }),
    )
    return () => {
      live = false
    }
  }, [])
  return state
}

function Checks({ route, index, raw }: { route: ReviewRoute; index: Index; raw: boolean }) {
  const loaded = useChecks()
  const groupOf = useMemo(() => {
    const m = new Map(index.files.map((f) => [f.path, f.group]))
    return (path: string) => m.get(path)
  }, [index])
  const items = loaded?.status === 'ready' ? loaded.items : []
  const shown = useMemo(() => filterChecks(items, route, groupOf, route.id), [items, route.group, route.sub, route.q, route.id, groupOf])
  const groups = useMemo(() => [...new Set(items.flatMap((c) => c.keys.map((k) => groupOf(k.slice(0, k.indexOf('|'))) ?? '')))].filter(Boolean).sort(), [items, groupOf])
  const counts = new Map<string, number>()
  for (const c of items) counts.set(c.code, (counts.get(c.code) ?? 0) + 1)
  const inSection = new Map<string, number>()
  for (const c of shown) inSection.set(c.code, (inSection.get(c.code) ?? 0) + 1)
  const kinds = CHECK_CODES.filter((c) => counts.has(c)).map((c) => ({ value: c, label: `${CHECK_INFO[c].name}（${counts.get(c)}）` }))

  if (loaded === undefined) return <p role="status">載入中…</p>
  if (loaded.status === 'error') return <Notice error={loaded.error} />
  return (
    <>
      <Tools route={route} groups={groups} kinds={kinds} kindLabel="檢查" placeholder="篩選 ID、檔名、KR、TW" count={shown.length} />
      <div class="rv-body">
        {route.id !== undefined && !shown.some((c) => c.id === route.id) && (
          <p class="rv-missing" role="status">
            找不到項目 <code>{route.id}</code>：它可能在新的 release 已經修正了。
          </p>
        )}
        <ItemList
          key={`${route.group}|${route.sub}|${route.q}`}
          items={shown}
          target={route.id}
          idOf={(c) => c.id}
          render={(c, previous) => (
            <>
              {previous?.code !== c.code && (
                <div key={`h-${c.code}`} class="rv-section">
                  <h2>
                    {CHECK_INFO[c.code]?.name ?? c.code} <span class="rv-n">{inSection.get(c.code)} 項</span>
                  </h2>
                  <p>{CHECK_INFO[c.code]?.desc}</p>
                </div>
              )}
              <CheckCard key={c.id} item={c} target={c.id === route.id} raw={raw} />
            </>
          )}
        />
      </div>
    </>
  )
}

export interface ReviewViewProps {
  route: ReviewRoute
  index: Index
  meta: Meta
  settings: Settings
  onSettings: (s: Settings) => void
}

/** The review page: what the release has not translated yet, and the translations whose format does not match KR. */
export function ReviewView({ route, index, meta, settings, onSettings }: ReviewViewProps) {
  const untranslated = (meta.status.en ?? 0) + (meta.status.kr ?? 0) + (meta.status.missing ?? 0)
  const checks = CHECK_CODES.reduce((n, c) => n + (meta.checks[c] ?? 0), 0)
  const tabs = [
    { tab: 'untranslated' as const, name: '未翻譯', n: untranslated, unit: '個單位' },
    { tab: 'checks' as const, name: '格式檢查', n: checks, unit: '項' },
  ]
  return (
    <div class="review">
      <h1>審核</h1>
      <p class="rv-lede">這個 release 需要人看的地方。修改請到 Paratranz：檔案頁的欄位名稱滑過會顯示 Paratranz 的 key。下次 release 之後這頁會跟著更新。</p>
      <nav class="rv-tabs" role="tablist" aria-label="審核項目類別">
        {tabs.map(({ tab, name, n, unit }) => (
          <a key={tab} role="tab" class="rv-tab" href={reviewHref(tab)} aria-selected={tab === route.tab ? 'true' : 'false'} title={`${number.format(n)} ${unit}`}>
            {name}
            <span class="rv-n">{number.format(n)}</span>
          </a>
        ))}
      </nav>
      {route.tab === 'untranslated' && <Untranslated route={route} index={index} meta={meta} onReviewFile={() => onSettings({ ...settings, reviewOnly: true })} />}
      {route.tab === 'checks' && <Checks route={route} index={index} raw={settings.rawTags} />}
    </div>
  )
}
