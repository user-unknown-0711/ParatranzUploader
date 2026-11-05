import { useEffect, useMemo, useState } from 'preact/hooks'
import { filterFiles } from '../data'
import { fileHref } from '../route'
import type { FileSummary, Index } from '../types'

export interface DirectoryProps {
  index: Index
  /** The file filter; the directory shows what matches it, every family open. */
  query: string
  /** The path of the file in view. */
  current?: string
}

/** The speakers of a file that the filter matched, to show why the file is there. */
function matchedSpeakers(f: FileSummary, needle: string): string[] {
  if (needle === '') return []
  return f.speakers.filter((s) => s.toLowerCase().includes(needle))
}

/** The untranslated units of a file, for the count next to its name. */
function untranslated(f: FileSummary): number {
  return (f.status.en ?? 0) + (f.status.kr ?? 0) + (f.status.missing ?? 0)
}

/** The files of the index by group: each group opens and closes; a filter opens all it has hits in. */
export function Directory({ index, query, current }: DirectoryProps) {
  const needle = query.trim().toLowerCase()
  const matched = useMemo(() => new Set(filterFiles(index, query)), [index, query])
  const currentFamily = useMemo(() => index.files.find((f) => f.path === current)?.group, [index, current])
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(currentFamily === undefined ? [] : [currentFamily]))

  // Moving to a file of another group (the next-file button) opens that group.
  useEffect(() => {
    if (currentFamily !== undefined) setOpen((prev) => (prev.has(currentFamily) ? prev : new Set(prev).add(currentFamily)))
  }, [currentFamily])

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const families = index.groups
    .map((fam) => ({ fam, files: fam.files.filter((n) => matched.has(n)) }))
    .filter(({ files }) => needle === '' || files.length > 0)

  if (families.length === 0) return <p class="dir-empty">沒有符合的檔案</p>

  return (
    <nav class="directory" aria-label="檔案目錄">
      {families.map(({ fam, files }) => {
        const expanded = needle !== '' || open.has(fam.id)
        return (
          <section key={fam.id} class="dir-family">
            <h2>
              <button type="button" aria-expanded={expanded} onClick={() => toggle(fam.id)}>
                <span class="dir-caret" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                <span class="dir-family-id">{fam.id}</span>
                <span class="dir-count">{files.length}</span>
              </button>
            </h2>
            {expanded && (
              <ul>
                {files.map((n) => {
                  const f = index.files[n]
                  if (!f) return null
                  const who = matchedSpeakers(f, needle)
                  const todo = untranslated(f)
                  return (
                    <li key={f.path}>
                      <a href={fileHref(f.path)} aria-current={f.path === current ? 'page' : undefined} class={f.absent ? 'is-absent' : undefined}>
                        <span class="dir-path">{f.path}</span>
                        {(todo > 0 || f.checks > 0) && (
                          <span class="dir-todo" title={`未翻譯 ${todo}、格式檢查 ${f.checks}`}>
                            {f.absent ? '未收錄' : todo + f.checks}
                          </span>
                        )}
                        {f.label !== '' && <span class="dir-label">{f.label}</span>}
                        {who.length > 0 && <span class="dir-who">{who.join('、')}</span>}
                      </a>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </nav>
  )
}
