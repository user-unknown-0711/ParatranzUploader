import { useEffect, useState } from 'preact/hooks'
import { DataError, loadIndex, loadMeta } from '../data'
import { parseHash, type Route } from '../route'
import { SearchView } from '../search/SearchView'
import { ReviewView } from '../review/ReviewView'
import { loadSettings, saveSettings, type Settings } from '../settings'
import type { Index, Meta } from '../types'
import { FileView } from '../view/FileView'
import { Directory } from './Directory'
import { Footer } from './Footer'
import { FileFilter, Header } from './Header'
import { Home } from './Home'
import { Notice } from './Notice'

type Data = { status: 'loading' } | { status: 'ready'; meta: Meta; index: Index } | { status: 'error'; error: DataError }

/** The route of the address bar, kept up to date as the hash changes. */
function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

/** meta.json and index.json, loaded once when the page starts. */
function useData(): Data {
  const [data, setData] = useState<Data>({ status: 'loading' })
  useEffect(() => {
    let live = true
    Promise.all([loadMeta(), loadIndex()]).then(
      ([meta, index]) => {
        if (live) setData({ status: 'ready', meta, index })
      },
      (e: unknown) => {
        if (live) setData({ status: 'error', error: e instanceof DataError ? e : new DataError('network', String(e)) })
      },
    )
    return () => {
      live = false
    }
  }, [])
  return data
}

export function App() {
  const route = useRoute()
  const data = useData()
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [fileQuery, setFileQuery] = useState('')
  const [drawer, setDrawer] = useState(false)

  const changeSettings = (next: Settings) => {
    setSettings(next)
    saveSettings(next)
  }

  // A new address closes the drawer; so does Escape.
  useEffect(() => setDrawer(false), [route])
  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer])

  const current = route.kind === 'file' ? route.path : undefined

  return (
    <div class="app">
      <Header
        route={route}
        meta={data.status === 'ready' ? data.meta : undefined}
        settings={settings}
        onSettings={changeSettings}
        fileQuery={fileQuery}
        onFileQuery={setFileQuery}
        drawerOpen={drawer}
        onToggleDrawer={() => setDrawer((open) => !open)}
      />
      <div class="layout">
        <div class={drawer ? 'scrim is-open' : 'scrim'} onClick={() => setDrawer(false)} />
        <aside id="directory" class={drawer ? 'dir is-open' : 'dir'} aria-label="目錄">
          <div class="dir-head">
            <FileFilter value={fileQuery} onInput={setFileQuery} />
            <button type="button" class="dir-close" onClick={() => setDrawer(false)}>
              關閉
            </button>
          </div>
          {data.status === 'ready' && <Directory index={data.index} query={fileQuery} current={current} />}
          {data.status === 'loading' && <p class="dir-empty">載入中…</p>}
        </aside>
        <main class="main">
          {data.status === 'loading' && <p role="status">資料載入中…</p>}
          {data.status === 'error' && <Notice error={data.error} />}
          {data.status === 'ready' && (
            <Page
              route={route}
              meta={data.meta}
              index={data.index}
              settings={settings}
              onSettings={changeSettings}
              onOpenDirectory={() => setDrawer(true)}
            />
          )}
        </main>
      </div>
      <Footer meta={data.status === 'ready' ? data.meta : undefined} />
    </div>
  )
}

interface PageProps {
  route: Route
  meta: Meta
  index: Index
  settings: Settings
  onSettings: (s: Settings) => void
  onOpenDirectory: () => void
}

/** The main area for a route. */
function Page({ route, meta, index, settings, onSettings, onOpenDirectory }: PageProps) {
  switch (route.kind) {
    case 'home':
      return <Home meta={meta} index={index} onOpenDirectory={onOpenDirectory} />
    case 'file':
      return <FileView path={route.path} ptr={route.ptr} index={index} settings={settings} onSettings={onSettings} />
    case 'search':
      return <SearchView q={route.q} lang={route.lang} re={route.re} index={index} />
    case 'review':
      return <ReviewView route={route} index={index} meta={meta} settings={settings} onSettings={onSettings} />
  }
}
