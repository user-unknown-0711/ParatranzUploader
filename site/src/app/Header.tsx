import { useEffect, useState } from 'preact/hooks'
import { reviewHref, searchHref, type Route } from '../route'
import { LANGS, type Settings } from '../settings'
import type { Lang, Meta } from '../types'

const LANG_LABEL: Record<Lang, string> = { kr: 'KR', jp: 'JP', en: 'EN', zh: 'TW' }

export interface FileFilterProps {
  value: string
  onInput: (value: string) => void
}

/** The box that narrows the directory to the files whose path, place or speakers hold the text. */
export function FileFilter({ value, onInput }: FileFilterProps) {
  return (
    <input
      type="search"
      class="file-filter"
      aria-label="篩選檔案"
      placeholder="篩選檔案：路徑、地點、說話者"
      value={value}
      onInput={(e) => onInput(e.currentTarget.value)}
    />
  )
}

export interface HeaderProps {
  route: Route
  /** The counts of the review; unknown until meta.json is loaded. */
  meta?: Meta
  settings: Settings
  onSettings: (s: Settings) => void
  fileQuery: string
  onFileQuery: (q: string) => void
  drawerOpen: boolean
  onToggleDrawer: () => void
}

export function Header({ route, meta, settings, onSettings, fileQuery, onFileQuery, drawerOpen, onToggleDrawer }: HeaderProps) {
  const [q, setQ] = useState(route.kind === 'search' ? route.q : '')
  useEffect(() => {
    if (route.kind === 'search') setQ(route.q)
  }, [route])

  const open = meta ? Object.values(meta.checks).reduce((n, c) => n + (c ?? 0), 0) : 0

  function search(e: Event) {
    e.preventDefault()
    if (q.trim() === '') return
    // On a search page a new search keeps its language and its way of matching.
    location.hash = route.kind === 'search' ? searchHref(q, route.lang, route.re) : searchHref(q, 'zh', false)
  }

  return (
    <header class="top">
      <button
        type="button"
        class="dir-toggle"
        aria-expanded={drawerOpen}
        aria-controls="directory"
        onClick={onToggleDrawer}
      >
        目錄
      </button>
      <a class="brand" href="#/">
        Limbus 繁中譯文檢視
      </a>
      <a class="review-link" href={reviewHref('untranslated')}>
        審核
        {open > 0 && (
          <span class="review-count" title="格式檢查的項目數">
            {open}
          </span>
        )}
      </a>
      <div class="top-filter">
        <FileFilter value={fileQuery} onInput={onFileQuery} />
      </div>
      <form class="fulltext" role="search" onSubmit={search}>
        <input
          type="search"
          name="q"
          aria-label="全文搜尋"
          placeholder="全文搜尋"
          value={q}
          onInput={(e) => setQ(e.currentTarget.value)}
        />
        <button type="submit">搜尋</button>
      </form>
      <div class="langs" role="group" aria-label="顯示語言">
        {LANGS.map((lang) => (
          <label key={lang} {...(lang === 'zh' ? { title: 'TW 一律顯示' } : {})}>
            <input
              type="checkbox"
              checked={lang === 'zh' || settings.langs[lang]}
              disabled={lang === 'zh'}
              onChange={(e) => onSettings({ ...settings, langs: { ...settings.langs, [lang]: e.currentTarget.checked } })}
            />
            {LANG_LABEL[lang]}
          </label>
        ))}
      </div>
      <label class="raw-tags">
        <input
          type="checkbox"
          data-setting="rawTags"
          checked={settings.rawTags}
          onChange={(e) => onSettings({ ...settings, rawTags: e.currentTarget.checked })}
        />
        顯示原始標籤
      </label>
    </header>
  )
}
