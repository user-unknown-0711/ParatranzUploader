import { LANG_ATTR, type Lang, type Models, type Unit } from '../types'
import { Cell, LANG_LABEL } from './Cell'
import type { Passage } from './group'
import type { ViewProps } from './TableView'

interface LineProps {
  kind: 'place' | 'speaker' | 'text'
  /** One unit, or the teller with its title. */
  units: readonly Unit[]
  langs: readonly Lang[]
  raw: boolean
  ptr?: string
  onCopy: (pointer: string) => void
}

/** A line of a passage, a cell to each language: side by side where there is room, one above the other where there is not. */
function Line({ kind, units, langs, raw, ptr, onCopy }: LineProps) {
  const first = units[0]
  if (first === undefined) return null
  const target = ptr !== undefined && units.some((u) => u.p === ptr)
  return (
    <div class={target ? `line line-${kind} is-target` : `line line-${kind}`} data-ptr={first.p} tabIndex={-1}>
      {kind === 'text' && first.f !== 'content' && <span class="line-field">{first.f}</span>}
      {langs.map((lang) => (
        <Cell key={lang} lang={lang} units={units} raw={raw} />
      ))}
      <button type="button" class="permalink" title={units.map((u) => u.p).join('\n')} aria-label="複製這一行的連結" onClick={() => onCopy(first.p)}>
        #
      </button>
    </div>
  )
}

/** The speaker of a line that names a model and no teller: the model's name in each language, as the game shows it. */
function ModelLine({ model, langs, models }: { model: string; langs: readonly Lang[]; models?: Models }) {
  const names = models?.[model]
  return (
    <div class="line line-speaker line-model" title={`model：${model}（依 ScenarioModelCodes 顯示的名稱）`}>
      {langs.map((lang) => (
        <div key={lang} class={`cell cell-${lang}`} data-lang={lang} data-tag={LANG_LABEL[lang]} lang={LANG_ATTR[lang]}>
          {names?.[lang] ?? (lang === 'kr' ? model : <span class="missing">—</span>)}
        </div>
      ))}
    </div>
  )
}

export interface ScriptViewProps extends ViewProps {
  /** The passages that are rendered; `start` is the number of the first. */
  passages: readonly Passage[]
  /** The names of the models; undefined until loaded. */
  models?: Models
}

/** One passage a block: the place divider where the place changed, the speaker, then the lines. */
export function ScriptView({ passages, models, langs, raw, ptr, start, before, after, listRef, onCopy }: ScriptViewProps) {
  return (
    <div class="script" style={{ '--cols': langs.length }}>
      <div class="cols-head">
        {langs.map((lang) => (
          <span key={lang} class="head-lang">
            {LANG_LABEL[lang]}
          </span>
        ))}
      </div>
      <div class="rows" ref={listRef}>
        {before > 0 && <div class="vspace vspace-before" aria-hidden="true" style={{ height: `${before}px` }} />}
        {passages.map((p, k) => {
          const speaker = [p.teller, p.title].filter((u): u is Unit => u !== undefined)
          const common = { langs, raw, ptr, onCopy }
          // A place that is not drawn as a divider is the passage's own: a link to it marks the passage.
          const own = p.place !== undefined && p.place.p === ptr
          return (
            <article key={p.key} class={own ? 'passage is-target' : 'passage'} data-row={start + k} data-key={p.key} tabIndex={-1}>
              {p.divider && <Line kind="place" units={[p.divider]} {...common} />}
              {speaker.length > 0 && <Line kind="speaker" units={speaker} {...common} />}
              {speaker.length === 0 && p.model !== undefined && <ModelLine model={p.model} langs={langs} models={models} />}
              {p.units.map((u) => (
                <Line key={u.p} kind="text" units={[u]} {...common} />
              ))}
            </article>
          )
        })}
        {after > 0 && <div class="vspace vspace-after" aria-hidden="true" style={{ height: `${after}px` }} />}
      </div>
    </div>
  )
}
