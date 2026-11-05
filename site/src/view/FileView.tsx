import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { DataError, loadFile, loadModels } from '../data'
import { Notice } from '../app/Notice'
import { fileHref } from '../route'
import { STATUS_INFO } from '../review/names'
import { LANGS, STATUSES, type Settings } from '../settings'
import type { FileData, FileSummary, Index, Models } from '../types'
import { groupEntries, isReviewed, isScriptFile, isVisible, passagePointers, passages, visibleUnits } from './group'
import { keyAction, neighbors } from './nav'
import { StatusBadge } from './StatusBadge'
import { ScriptView } from './ScriptView'
import { TableView } from './TableView'
import { useVirtual } from './useVirtual'

export interface FileViewProps {
  /** The path of the file, as in the index. */
  path: string
  /** The pointer of the unit in the address. */
  ptr?: string
  index: Index
  settings: Settings
  onSettings: (s: Settings) => void
}

type Loaded = { path: string } & ({ status: 'ready'; file: FileData } | { status: 'error'; error: DataError })

/** The file of the path, once loaded; undefined while it loads (and for a path whose file is not wanted). */
function useFile(path: string, wanted: boolean): Loaded | undefined {
  const [state, setState] = useState<Loaded>()
  useEffect(() => {
    if (!wanted) return
    let live = true
    loadFile(path).then(
      (file) => {
        if (live) setState({ path, status: 'ready', file })
      },
      (e: unknown) => {
        if (live) setState({ path, status: 'error', error: e instanceof DataError ? e : new DataError('network', String(e)) })
      },
    )
    return () => {
      live = false
    }
  }, [path, wanted])
  return state?.path === path ? state : undefined
}

/** [ and ] go to the previous and the next file. */
function useFileKeys(prev: string | undefined, next: string | undefined): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = keyAction(e)
      const to = action === 'prevFile' ? prev : action === 'nextFile' ? next : undefined
      if (to !== undefined) location.hash = fileHref(to)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [prev, next])
}

function FileNav({ prev, next }: { prev?: string; next?: string }) {
  return (
    <nav class="file-nav" aria-label="上一檔與下一檔">
      {prev !== undefined ? (
        <a class="nav-prev" rel="prev" href={fileHref(prev)} title={prev}>
          ← 上一檔
        </a>
      ) : (
        <span class="nav-prev is-off" aria-disabled="true">
          ← 上一檔
        </span>
      )}
      {next !== undefined ? (
        <a class="nav-next" rel="next" href={fileHref(next)} title={next}>
          下一檔 →
        </a>
      ) : (
        <span class="nav-next is-off" aria-disabled="true">
          下一檔 →
        </span>
      )}
      <span class="nav-hint">鍵盤：[ ] 換檔，j k 換段</span>
    </nav>
  )
}

interface ToolsProps {
  summary: FileSummary
  settings: Settings
  onSettings: (s: Settings) => void
}

/** The layout, the status filter and the review filter. */
function FileTools({ summary, settings, onSettings }: ToolsProps) {
  return (
    <div class="file-tools">
      <label>
        <span>版面</span>
        <select
          data-setting="scriptMode"
          value={settings.scriptMode}
          onChange={(e) => onSettings({ ...settings, scriptMode: e.currentTarget.value as Settings['scriptMode'] })}
        >
          <option value="auto">依檔案類型</option>
          <option value="on">劇本</option>
          <option value="off">表格</option>
        </select>
      </label>
      <div class="status-filter" role="group" aria-label="譯文狀態">
        <span class="tools-label">譯文狀態</span>
        {STATUSES.filter((s) => (summary.status[s] ?? 0) > 0).map((s) => (
          <label key={s} title={STATUS_INFO[s].desc}>
            <input
              type="checkbox"
              data-status={s}
              checked={settings.statuses[s]}
              onChange={(e) => onSettings({ ...settings, statuses: { ...settings.statuses, [s]: e.currentTarget.checked } })}
            />
            <StatusBadge status={s} />
            <span class="n">{summary.status[s]}</span>
          </label>
        ))}
      </div>
      <label>
        <input
          type="checkbox"
          data-setting="reviewOnly"
          checked={settings.reviewOnly}
          onChange={(e) => onSettings({ ...settings, reviewOnly: e.currentTarget.checked })}
        />
        <span>只看需要審核的單位</span>
      </label>
    </div>
  )
}

interface BodyProps {
  path: string
  file: FileData
  ptr?: string
  settings: Settings
  onSettings: (s: Settings) => void
}

/** The units of a loaded file, as a table or as a script, under the filters of the settings. */
function FileBody({ path, file, ptr, settings, onSettings }: BodyProps) {
  const script = settings.scriptMode === 'on' || (settings.scriptMode === 'auto' && isScriptFile(path))
  const langs = LANGS.filter((l) => settings.langs[l])
  const { statuses, reviewOnly } = settings

  // The filter reads settings.statuses and settings.reviewOnly and nothing else of the settings.
  const entries = useMemo(() => groupEntries(file.units), [file])
  const units = useMemo(() => (script ? [] : visibleUnits(file.units, settings)), [file, script, statuses, reviewOnly])
  const shown = useMemo(() => (script ? passages(entries, settings) : []), [entries, script, statuses, reviewOnly])
  const keys = useMemo(() => (script ? shown.map((p) => p.key) : units.map((u) => u.p)), [script, shown, units])
  const count = keys.length
  const unitsShown = script ? shown.reduce((n, p) => n + passagePointers(p).length, 0) : units.length

  const targetUnit = useMemo(() => (ptr === undefined ? undefined : file.units.find((u) => u.p === ptr)), [file, ptr])
  const targetRow = useMemo(() => {
    if (ptr === undefined) return -1
    return script ? shown.findIndex((p) => passagePointers(p).includes(ptr)) : units.findIndex((u) => u.p === ptr)
  }, [ptr, script, shown, units])

  const v = useVirtual({
    keys,
    estimate: script ? 150 : 64,
    layout: `${script}|${langs.join()}|${settings.rawTags}`,
    target: ptr !== undefined && targetRow >= 0 ? { id: `${path}\n${ptr}`, row: targetRow } : undefined,
  })

  // The speaker names of the lines that have a model and no teller: loaded once a script is shown.
  // They make the passages taller, and are state of this component, so the rows are measured again.
  const [models, setModels] = useState<Models>()
  useEffect(() => {
    if (!script || models !== undefined) return
    let live = true
    loadModels().then(
      (m) => live && setModels(m),
      () => live && setModels({}),
    )
    return () => {
      live = false
    }
  }, [script])

  // j and k: the next and the previous row (a passage in a script).
  const rows = useRef({ v, count })
  rows.current = { v, count }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = keyAction(e)
      if (action !== 'nextRow' && action !== 'prevRow') return
      const { v, count } = rows.current
      if (count === 0) return
      const at = v.current()
      v.reveal(action === 'nextRow' ? Math.min(count - 1, at + 1) : Math.max(0, at - 1))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Copying a link: the clipboard where the browser has one, else the address bar.
  const [toast, setToast] = useState('')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const say = (text: string) => {
    setToast(text)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(''), 2500)
  }
  const copy = (pointer: string) => {
    const href = fileHref(path, pointer)
    const inAddressBar = () => {
      location.hash = href
      say('無法複製，連結已放在網址列')
    }
    const clipboard = navigator.clipboard as Clipboard | undefined
    if (clipboard === undefined) inAddressBar()
    else clipboard.writeText(new URL(href, location.href).href).then(() => say('已複製連結'), inAddressBar)
  }

  let note: ComponentChildren | undefined
  if (file.units.length === 0) note = '這個檔案沒有文字。'
  else if (langs.length === 0) note = '沒有開啟任何語言。請在頁首開啟至少一種語言。'
  else if (count === 0 && reviewOnly && file.units.some((u) => isVisible(u, settings))) {
    // The status filter leaves units, so the review filter is what leaves nothing.
    note = (
      <>
        這個檔案沒有需要審核的單位。
        <button type="button" onClick={() => onSettings({ ...settings, reviewOnly: false })}>
          取消「只看需要審核的單位」
        </button>
      </>
    )
  } else if (count === 0) note = '所有單位都被狀態篩選隱藏了。'

  const view = { langs, raw: settings.rawTags, ptr, start: v.start, before: v.before, after: v.after, listRef: v.listRef, onCopy: copy }
  return (
    <div class="file-body">
      <p class="file-count">
        顯示 {unitsShown} / {file.units.length} 個單位
      </p>
      <p class="toast" role="status">
        {toast}
      </p>
      <TargetNote ptr={ptr} found={targetUnit} shown={targetRow >= 0} settings={settings} onSettings={onSettings} />
      {note !== undefined && <p class="file-note">{note}</p>}
      {note === undefined &&
        (script ? (
          <ScriptView passages={shown.slice(v.start, v.end)} models={models} {...view} />
        ) : (
          <TableView units={units.slice(v.start, v.end)} {...view} />
        ))}
    </div>
  )
}

interface TargetNoteProps {
  ptr?: string
  found?: FileData['units'][number]
  shown: boolean
  settings: Settings
  onSettings: (s: Settings) => void
}

/** Why the unit of the link is not on the page: it is not in the file, or the filter hides it. */
function TargetNote({ ptr, found, shown, settings, onSettings }: TargetNoteProps) {
  if (ptr === undefined || shown) return null
  if (found === undefined) return <p class="target-note">找不到連結指向的單位：{ptr}</p>
  const status = found.s
  if (isVisible(found, settings) && settings.reviewOnly && !isReviewed(found)) {
    return (
      <p class="target-note">
        連結指向的單位不需要審核，被「只看需要審核的單位」隱藏了。
        <button type="button" onClick={() => onSettings({ ...settings, reviewOnly: false })}>
          取消這個篩選
        </button>
      </p>
    )
  }
  if (!isVisible(found, settings)) {
    return (
      <p class="target-note">
        連結指向的單位被狀態篩選隱藏了（狀態：{STATUS_INFO[status].name}）。
        <button type="button" onClick={() => onSettings({ ...settings, statuses: { ...settings.statuses, [status]: true } })}>
          顯示「{STATUS_INFO[status].name}」
        </button>
      </p>
    )
  }
  return <p class="target-note">連結指向的單位所在的段落被狀態篩選隱藏了。</p>
}

/** A file: its head, the previous and next file, the filters, and its units as a table or a script. */
export function FileView({ path, ptr, index, settings, onSettings }: FileViewProps) {
  const summary = useMemo(() => index.files.find((f) => f.path === path), [index, path])
  const loaded = useFile(path, summary !== undefined)
  const { prev, next } = useMemo(() => neighbors(index, path), [index, path])
  useFileKeys(prev, next)

  // A file starts at its top, also the first one shown (the page may be scrolled from the page before, such
  // as the results of a search); a link into a file goes to its unit instead.
  const shownPath = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (shownPath.current === path) return
    shownPath.current = path
    if (ptr === undefined) document.documentElement.scrollTop = 0
  }, [path, ptr])

  if (summary === undefined) {
    return (
      <section class="file-view">
        <p class="file-note file-gone">
          找不到這個檔案：{path}。<a href="#/">回首頁</a>
        </p>
      </section>
    )
  }
  return (
    <section class="file-view">
      <header class="file-head">
        <h1 class="file-title">{path}</h1>
        {summary.label !== '' && <p class="file-label">{summary.label}</p>}
        {summary.absent === true && <p class="file-absent">release 沒有這個檔案：下面只有原文，TW 欄全部是「缺少」。</p>}
        <FileNav prev={prev} next={next} />
      </header>
      <FileTools summary={summary} settings={settings} onSettings={onSettings} />
      {loaded === undefined && (
        <p class="file-loading" role="status">
          檔案載入中…
        </p>
      )}
      {loaded?.status === 'error' && <Notice error={loaded.error} />}
      {loaded?.status === 'ready' && <FileBody key={path} path={path} file={loaded.file} ptr={ptr} settings={settings} onSettings={onSettings} />}
    </section>
  )
}
