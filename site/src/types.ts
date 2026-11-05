// The JSON the viewer reads. Keys and shapes are those of site.go (the -site mode
// of ParatranzUploader) and of docs/superpowers/specs/2026-11-05-pages-viewer-design.md §5; format 1.

/** The release the TW texts are from. */
export interface ReleaseInfo {
  tag: string
  name: string
  url: string
  published_at: string
}

/** The assets repo the KR, JP and EN texts are from. */
export interface AssetsInfo {
  repo: string
  commit: string
  /** The commit is the one the release recorded, not the newest of the repo. */
  pinned: boolean
}

/** data/meta.json: where the data comes from and how much there is. */
export interface Meta {
  /** The version of the layout and keys of the data; 1. */
  format: number
  source: { release?: ReleaseInfo; assets?: AssetsInfo }
  langs: Lang[]
  files: number
  units: number
  /** The number of units of each status; a status no unit has may be left out. */
  status: Partial<Record<Status, number>>
  /** The number of findings of each check code. */
  checks: Partial<Record<CheckCode, number>>
  /** The number of texts translated in more than one way, by JP/EN class. */
  inconsistent: Partial<Record<JPENClass, number>>
  /** The KR files the release has no file for. */
  absent: number
  /** The release files that have no KR file. */
  orphans: string[]
}

/** A group of files in data/index.json: files are positions in Index.files. */
export interface IndexGroup {
  id: string
  files: number[]
}

/** What the index says of one file. */
export interface FileSummary {
  path: string
  group: string
  /** The first place of a story (TW, else KR); "" outside StoryData/. */
  label: string
  /** The tellers of a story (TW, else KR), each once, first seen first. */
  speakers: string[]
  units: number
  status: Partial<Record<Status, number>>
  /** The number of units that have check findings. */
  checks: number
  /** The number of units whose text is translated in more than one way. */
  inconsistent: number
  /** The KR strings of the file that the language has no string for. */
  missing: { en: number; jp: number }
  /** The release has no such file. */
  absent?: boolean
}

/** data/index.json. The position of a file in files is its number in search/keys.json. */
export interface Index {
  groups: IndexGroup[]
  files: FileSummary[]
}

/**
 * What the release has for a KR string: a translation (tw), the EN text (en),
 * the KR text that needs translating (kr) or that needs none (same), or nothing (missing).
 */
export type Status = 'tw' | 'en' | 'kr' | 'same' | 'missing'

/** The checks of a translation against its KR text. */
export type CheckCode = 'placeholder' | 'keyword' | 'tag' | 'hangul' | 'llc'

/** The four languages of a unit; zh is the TW text. */
export type Lang = 'kr' | 'jp' | 'en' | 'zh'

/** One string of a file in the four languages. */
export interface Unit {
  /** The key, as on Paratranz: dataList->0->content. */
  p: string
  /** Field name. */
  f: string
  /** Index of the dataList element, or -1. */
  i: number
  kr: string
  /** Left out where the language has no string for the key. */
  jp?: string
  en?: string
  /** The string of the release, what a player sees; left out where the release has none. */
  zh?: string
  s: Status
  /** The IDs of the check findings of the unit; left out when there are none. */
  w?: string[]
  /** The model of its dataList element, where the element has no teller: the game shows the model's name. */
  m?: string
  /** The ID of the inconsistent translations the unit is one of. */
  v?: string
}

/** data/models.json: the name of each model in each language, by model ID. */
export type Models = Record<string, Partial<Record<Lang, string>>>

/** data/files/<path>. A file with no strings has units: []. */
export interface FileData {
  path: string
  units: Unit[]
}

/** One finding of review/checks.json: a code about one KR text and its translation, with every unit that has the pair. */
export interface CheckItem {
  id: string
  code: CheckCode
  kr: string
  zh: string
  /** What the translation lacks. */
  miss: string[]
  /** What the translation has that KR does not. */
  extra: string[]
  /** Unit keys, "<file path>|<key>", in the order of the index. */
  keys: string[]
}

/** Whether JP and EN tell the translations of an inconsistent group apart. */
export type JPENClass = 'same' | 'explained' | 'partial'

/** Units of a translation with one JP and one EN string; jp or en is left out where the units have none. */
export interface JPENGroup {
  jp?: string
  en?: string
  count: number
  keys: string[]
}

/** One translation of an inconsistent text, with every unit that shows it. */
export interface Variant {
  zh: string
  count: number
  /** Unit keys ("<file path>|<key>"), in the order of the index. */
  keys: string[]
  /** The units of the translation by their JP and EN, the most first. */
  jpen: JPENGroup[]
}

/** One item of review/inconsistent.json: a KR text of one group and field, translated in more than one way. */
export interface InconsistentItem {
  id: string
  group: string
  field: string
  kr: string
  /** The JP and EN of the first unit of the most used translation. */
  jp?: string
  en?: string
  units: number
  /** The most used first. */
  variants: Variant[]
  jpen_class: JPENClass
}

/** The pages of the review. */
export type ReviewTab = 'untranslated' | 'checks' | 'inconsistent'

/** The `lang` attribute of the text of each language, so that the browser picks the right glyphs. */
export const LANG_ATTR: Record<Lang, string> = {
  kr: 'ko',
  jp: 'ja',
  en: 'en',
  zh: 'zh-Hant-TW',
}
