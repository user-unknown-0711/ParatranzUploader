import type { RefObject } from 'preact'
import type { Lang, Unit } from '../types'
import { Cell, LANG_LABEL } from './Cell'

/** What the table and the script have in common. */
export interface ViewProps {
  langs: readonly Lang[]
  /** Show the strings with their tags. */
  raw: boolean
  /** The key of the unit in the address. */
  ptr?: string
  /** The number of the first row that is rendered. */
  start: number
  /** The px that the rows before and after the rendered ones take. */
  before: number
  after: number
  /** The element that holds the rows. */
  listRef: RefObject<HTMLDivElement>
  /** Copy the deep link of a unit. */
  onCopy: (pointer: string) => void
}

export interface TableViewProps extends ViewProps {
  /** The units of the rows that are rendered. */
  units: readonly Unit[]
}

/** One unit a row: the field name, then a cell for each language that is on. */
export function TableView({ units, langs, raw, ptr, start, before, after, listRef, onCopy }: TableViewProps) {
  return (
    <div class="tbl" role="table" aria-label="對照表" style={{ '--cols': langs.length }}>
      <div class="trow thead" role="row">
        <div class="cell head-field" role="columnheader">
          欄位
        </div>
        {langs.map((lang) => (
          <div key={lang} class="cell head-lang" role="columnheader">
            {LANG_LABEL[lang]}
          </div>
        ))}
      </div>
      <div class="rows" role="rowgroup" ref={listRef}>
        {before > 0 && <div class="vspace vspace-before" aria-hidden="true" style={{ height: `${before}px` }} />}
        {units.map((u, k) => (
          <div
            key={u.p}
            class={u.p === ptr ? 'trow is-target' : 'trow'}
            role="row"
            data-row={start + k}
            data-key={u.p}
            data-ptr={u.p}
            tabIndex={-1}
          >
            <div class="cell cell-field" role="rowheader">
              <button type="button" class="field" title={u.p} onClick={() => onCopy(u.p)}>
                {u.f}
              </button>
            </div>
            {langs.map((lang) => (
              <Cell key={lang} lang={lang} units={[u]} raw={raw} role="cell" />
            ))}
          </div>
        ))}
        {after > 0 && <div class="vspace vspace-after" aria-hidden="true" style={{ height: `${after}px` }} />}
      </div>
    </div>
  )
}
