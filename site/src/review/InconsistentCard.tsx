import { TmpText } from '../tmp/TmpText'
import { fileHref, reviewHref } from '../route'
import { stripTags } from '../search/match'
import { LANG_ATTR, type InconsistentItem, type JPENGroup, type Lang } from '../types'
import { variantDiff } from './diff'
import { DiffText } from './DiffText'
import { JPEN_INFO } from './names'

/** What the header asks to show of the game text: the languages, and the tags as they are. */
export interface Shown {
  langs: Record<Lang, boolean>
  raw: boolean
}

function clip(s: string, n: number): string {
  const chars = Array.from(stripTags(s).replace(/\s+/g, ' ').trim())
  return chars.length > n ? `${chars.slice(0, n).join('')}…` : chars.join('')
}

function UnitLink({ unitKey }: { unitKey: string }) {
  const bar = unitKey.indexOf('|')
  const path = unitKey.slice(0, bar)
  const ptr = unitKey.slice(bar + 1)
  return (
    <a href={fileHref(path, ptr)} title={unitKey}>
      {path} <span class="muted">{ptr}</span>
    </a>
  )
}

function Row({ label, lang, text, shown }: { label: string; lang: Lang; text: string | undefined; shown: Shown }) {
  if (!shown.langs[lang] || text === undefined) return null
  return (
    <>
      <dt>{label}</dt>
      <dd lang={LANG_ATTR[lang]}>
        <TmpText text={text} raw={shown.raw} lang={lang} />
      </dd>
    </>
  )
}

const pairOf = (j: JPENGroup) => `${j.jp === undefined ? '-' : `+${j.jp}`}\u0000${j.en === undefined ? '-' : `+${j.en}`}`

/** The JP/EN groups of a translation; a pair that other translations have too is marked. */
function JPENRows({ groups, shared, shown }: { groups: JPENGroup[]; shared: Set<string>; shown: Shown }) {
  if (!shown.langs.jp && !shown.langs.en) return null
  return (
    <ul class="rv-jpens">
      {groups.map((j) => {
        const isShared = shared.has(pairOf(j))
        return (
          <li key={pairOf(j)} class={isShared ? 'rv-jpen is-shared' : 'rv-jpen'}>
            {shown.langs.jp && (
              <>
                <span class="rv-jpen-label">JP</span>
                <span class="rv-jpen-jp" lang={LANG_ATTR.jp}>
                  {j.jp === undefined ? '—' : <TmpText text={j.jp} raw={shown.raw} lang="jp" />}
                </span>
              </>
            )}
            {shown.langs.en && (
              <>
                <span class="rv-jpen-label">EN</span>
                <span class="rv-jpen-en" lang={LANG_ATTR.en}>
                  {j.en === undefined ? '—' : <TmpText text={j.en} raw={shown.raw} lang="en" />}
                </span>
              </>
            )}
            <span class="rv-jpen-n">{j.count} 個</span>
            {isShared && <span class="rv-jpen-shared">同樣的 JP/EN 有其他譯法</span>}
          </li>
        )
      })}
    </ul>
  )
}

export interface InconsistentCardProps {
  item: InconsistentItem
  target: boolean
  /** Show the JP and EN of each translation. */
  jpen: boolean
  shown: Shown
}

/** A KR text translated in more than one way: each way with its count, what differs from the most used one, and an example. */
export function InconsistentCard({ item, target, jpen, shown }: InconsistentCardProps) {
  const variants = item.variants
  const top = variants[0]
  if (top === undefined) return null
  // The JP/EN pairs that more than one translation has: where the group really differs.
  const seen = new Map<string, number>()
  for (const v of variants) for (const p of new Set(v.jpen.map(pairOf))) seen.set(p, (seen.get(p) ?? 0) + 1)
  const shared = new Set([...seen].filter(([, n]) => n > 1).map(([p]) => p))
  const badge = JPEN_INFO[item.jpen_class]
  return (
    <article class={target ? 'rv-card is-target' : 'rv-card'} data-id={item.id}>
      <div class="rv-head">
        <span class="rv-kind rv-kind-sugg">不一致</span>
        <span class="rv-where">
          {item.group}／{item.field}・{item.units} 個單位・{variants.length} 種譯法
        </span>
        <span class={`rv-badge rv-badge-${item.jpen_class}`} title={badge.desc}>
          {badge.name}
        </span>
        <a class="rv-id" href={reviewHref('inconsistent', { id: item.id, mode: jpen ? 'jpen' : 'kr' })} title="這一項的連結">
          {item.id}
        </a>
      </div>
      <dl class="rv-src">
        <Row label="KR" lang="kr" text={item.kr} shown={shown} />
        <Row label="JP" lang="jp" text={item.jp} shown={shown} />
        <Row label="EN" lang="en" text={item.en} shown={shown} />
      </dl>
      <div class="rv-vars-title">TW 的譯法（和最多的那種不同的地方以底色標出）</div>
      <div class="rv-vars">
        {variants.map((v, k) => (
          <div key={v.zh} class={k === 0 ? 'rv-var is-top' : 'rv-var'}>
            <div class="rv-bar">
              <i style={{ width: `${Math.max(6, Math.round((64 * v.count) / top.count))}px` }} />
              {v.count} 個
            </div>
            <div class="rv-zh">
              {/* Drawn anew when raw tags switch: the pieces differ, and moving keyed pieces around confuses a redraw. */}
              <DiffText key={shown.raw ? 'raw' : 'drawn'} pieces={variantDiff(top.zh, v.zh, { raw: shown.raw })} raw={shown.raw} />
            </div>
            <div class="rv-example">{v.keys[0] !== undefined && <>例：<UnitLink unitKey={v.keys[0]} /></>}</div>
            {jpen && v.jpen.length > 0 && <JPENRows groups={v.jpen} shared={shared} shown={shown} />}
          </div>
        ))}
      </div>
      <details class="rv-more">
        <summary>全部 {item.units} 個單位</summary>
        <ul>
          {variants.map((v) => (
            <li key={v.zh}>
              {clip(v.zh, 24)}（{v.count}）：
              <div class="rv-units">
                {v.keys.map((key) => (
                  <UnitLink key={key} unitKey={key} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </details>
    </article>
  )
}
