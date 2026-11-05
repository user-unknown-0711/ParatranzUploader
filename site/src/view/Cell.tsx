import { reviewHref } from '../route'
import { CHECK_INFO, checkCode } from '../review/names'
import { TmpText } from '../tmp/TmpText'
import { LANG_ATTR, type Lang, type Unit } from '../types'
import { StatusBadge } from './StatusBadge'

export const LANG_LABEL: Record<Lang, string> = { kr: 'KR', jp: 'JP', en: 'EN', zh: 'TW' }

/** Under a TW text: its status where it is not a translation, then a link to each check finding. */
function ZhMeta({ units }: { units: readonly Unit[] }) {
  const statuses = [...new Set(units.map((u) => u.s))].filter((s) => s !== 'tw')
  const findings = [...new Set(units.flatMap((u) => u.w ?? []))]
  const groups = [...new Set(units.flatMap((u) => (u.v === undefined ? [] : [u.v])))]
  if (statuses.length === 0 && findings.length === 0 && groups.length === 0) return null
  return (
    <span class="cell-meta">
      {statuses.map((s) => (
        <StatusBadge key={s} status={s} />
      ))}
      {findings.map((id) => {
        const code = checkCode(id)
        const info = code === undefined ? { name: id, desc: '' } : CHECK_INFO[code]
        return (
          <a key={id} class="chip chip-warn" href={reviewHref('checks', { id })} title={info.desc}>
            {info.name}
          </a>
        )
      })}
      {groups.map((id) => (
        <a key={id} class="chip chip-sugg" href={reviewHref('inconsistent', { id, mode: 'jpen' })} title="同一句原文在同一群組有不只一種譯法">
          不一致
        </a>
      ))}
    </span>
  )
}

export interface CellProps {
  lang: Lang
  /** One unit, or the teller with its title. */
  units: readonly Unit[]
  raw: boolean
  /** The ARIA role, where the cell is a cell of a table. */
  role?: 'cell'
}

/**
 * The text of the units in one language. A unit the language has no string for
 * is a dash. The TW cell carries the status of its text and its check findings.
 */
export function Cell({ lang, units, raw, role }: CellProps) {
  const present = units.filter((u) => u[lang] !== undefined)
  const flagged = lang === 'zh' && units.some((u) => u.s !== 'tw' && u.s !== 'same')
  const warned = lang === 'zh' && units.some((u) => (u.w?.length ?? 0) > 0)
  const cls = ['cell', `cell-${lang}`, flagged ? 'is-untranslated' : '', warned ? 'has-review' : ''].filter(Boolean).join(' ')
  return (
    <div class={cls} role={role} data-lang={lang} data-tag={LANG_LABEL[lang]} lang={LANG_ATTR[lang]}>
      {present.length === 0 ? (
        <span class="missing" title="沒有對應的字串">
          —
        </span>
      ) : (
        present.map((u) => (
          <span key={u.p} class={`u u-${u.f}`}>
            <TmpText text={u[lang] ?? ''} raw={raw} lang={lang} />
          </span>
        ))
      )}
      {lang === 'zh' && <ZhMeta units={units} />}
    </div>
  )
}
