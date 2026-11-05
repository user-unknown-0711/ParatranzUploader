import type { Lang, Status } from './types'

/** What the reader chose to see. It lives in localStorage, not in the URL. */
export type Settings = {
  /** The language columns shown. TW is always shown: the review is about its text. */
  langs: Record<Lang, boolean>
  /** The statuses of the TW text whose units are shown. */
  statuses: Record<Status, boolean>
  /** Show a string as it is, with its tags, instead of as the game draws it. */
  rawTags: boolean
  /** Script layout (one passage per dataList element): by the kind of file, always, or never. */
  scriptMode: 'auto' | 'on' | 'off'
  /** Show only the units a reviewer has to look at: not translated, or with check findings. */
  reviewOnly: boolean
}

export const LANGS: readonly Lang[] = ['kr', 'jp', 'en', 'zh']
export const STATUSES: readonly Status[] = ['tw', 'en', 'kr', 'missing', 'same']
const SCRIPT_MODES: readonly string[] = ['auto', 'on', 'off']

const KEY = 'paratranz-viewer-settings'

export function defaultSettings(): Settings {
  return {
    langs: { kr: true, jp: true, en: true, zh: true },
    statuses: { tw: true, en: true, kr: true, missing: true, same: false },
    rawTags: false,
    scriptMode: 'auto',
    reviewOnly: false,
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** The booleans of `from` for the names in `keys`; the value in `base` where `from` has none. */
function flags<K extends string>(keys: readonly K[], from: unknown, base: Record<K, boolean>): Record<K, boolean> {
  const out = { ...base }
  if (!isRecord(from)) return out
  for (const k of keys) {
    const v = from[k]
    if (typeof v === 'boolean') out[k] = v
  }
  return out
}

/** The saved settings; the defaults for what is not saved, or not valid. */
export function loadSettings(): Settings {
  const s = defaultSettings()
  let saved: unknown
  try {
    const text = localStorage.getItem(KEY)
    if (text === null) return s
    saved = JSON.parse(text)
  } catch {
    return s
  }
  if (!isRecord(saved)) return s
  return {
    langs: { ...flags(LANGS, saved.langs, s.langs), zh: true },
    statuses: flags(STATUSES, saved.statuses, s.statuses),
    rawTags: typeof saved.rawTags === 'boolean' ? saved.rawTags : s.rawTags,
    scriptMode: typeof saved.scriptMode === 'string' && SCRIPT_MODES.includes(saved.scriptMode) ? (saved.scriptMode as Settings['scriptMode']) : s.scriptMode,
    reviewOnly: typeof saved.reviewOnly === 'boolean' ? saved.reviewOnly : s.reviewOnly,
  }
}

/** Save the settings. Where the browser will not store them, they last as long as the page. */
export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // private mode or a full store: nothing to do
  }
}
