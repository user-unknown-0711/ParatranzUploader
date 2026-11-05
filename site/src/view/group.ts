import { needsReview } from '../review/names'
import type { Settings } from '../settings'
import type { Unit } from '../types'

/** One element of dataList, or one string outside it: what a script shows as a passage. */
export type Entry = {
  /** The index of the dataList element, or -1. */
  i: number
  /** The units that are not the place, the teller or the title. */
  units: Unit[]
  place?: Unit
  teller?: Unit
  title?: Unit
  /** The KR of the place differs from that of the last entry that had a place. */
  placeChanged: boolean
  /** The model of the element, where it has no teller. */
  model?: string
}

const SLOTS = ['place', 'teller', 'title'] as const

/**
 * The units in the order of the file, as entries: neighbours of one dataList
 * element make one entry; each string outside dataList (i == -1) is its own.
 */
export function groupEntries(units: Unit[]): Entry[] {
  const out: Entry[] = []
  let cur: Entry | undefined
  let lastPlace: string | undefined
  for (const u of units) {
    if (cur === undefined || u.i < 0 || u.i !== cur.i) {
      cur = { i: u.i, units: [], placeChanged: false }
      out.push(cur)
    }
    if (u.m !== undefined && cur.model === undefined) cur.model = u.m
    const slot = SLOTS.find((f) => f === u.f)
    // A second place, teller or title of one element is a line like any other: it is not lost.
    if (slot === undefined || cur[slot] !== undefined) {
      cur.units.push(u)
      continue
    }
    cur[slot] = u
    if (slot === 'place') {
      cur.placeChanged = u.kr !== lastPlace
      lastPlace = u.kr
    }
  }
  return out
}

/** Whether the reader wants to see the unit: the status of its TW text is ticked. */
export function isVisible(u: Unit, s: Settings): boolean {
  return s.statuses[u.s]
}

/** Whether a reviewer has to look at the unit. */
export const isReviewed = needsReview

/** The units whose status is ticked, in their order; with reviewOnly, those a reviewer has to look at. */
export function visibleUnits(units: Unit[], s: Settings): Unit[] {
  return units.filter((u) => isVisible(u, s) && (!s.reviewOnly || isReviewed(u)))
}

/** Whether a file reads as a script by its kind: StoryData/, or the dialogue files of RPGSystem/. */
export function isScriptFile(path: string): boolean {
  if (path.startsWith('StoryData/')) return true
  if (!path.startsWith('RPGSystem/')) return false
  return (path.split('/').pop() ?? '').toLowerCase().includes('dialogue')
}

/** What a script shows of an entry once the status filter has been applied. */
export type Passage = {
  /** Stable for the entry whatever is filtered: the pointer of one of its units. */
  key: string
  /** The place divider to show in front of the passage. */
  divider?: Unit
  /** The place of the entry when no divider is drawn for it (it is the place that is already shown): kept so that the passage still owns it. */
  place?: Unit
  teller?: Unit
  title?: Unit
  /** The model whose name the game shows as the speaker, where there is no teller. */
  model?: string
  /** The lines. */
  units: Unit[]
}

/** The pointers of the units a passage owns: those it draws, and its place if that is not drawn. */
export function passagePointers(p: Passage): string[] {
  return [p.divider, p.place, p.teller, p.title, ...p.units].flatMap((u) => (u ? [u.p] : []))
}

/**
 * The passages of a script under the status filter. A passage whose lines are
 * all filtered out is hidden whole, speaker and all; its place divider, if it
 * brought one, moves to the next passage that is shown.
 */
export function passages(entries: Entry[], s: Settings): Passage[] {
  const out: Passage[] = []
  const shown = (u: Unit | undefined): Unit | undefined => (u !== undefined && isVisible(u, s) ? u : undefined)
  let pending: Unit | undefined // a place that has begun and has not been shown yet
  let shownPlace: string | undefined // the KR of the last divider shown
  for (const e of entries) {
    const own = shown(e.place)
    if (own !== undefined && e.placeChanged) pending = own
    const units = visibleUnits(e.units, s)
    const teller = shown(e.teller)
    const title = shown(e.title)
    // Lines that are all filtered out hide the passage; with reviewOnly, a place, teller or title that has review items keeps it.
    if (e.units.length > 0 && units.length === 0 && !(s.reviewOnly && [own, teller, title].some(isReviewed))) continue
    const first = e.units[0] ?? e.teller ?? e.title ?? e.place
    if (first === undefined) continue
    let divider = pending !== undefined && pending.kr !== shownPlace ? pending : undefined
    // A passage that is only a place has nothing else to show: it shows the place, repeated or not.
    // With reviewOnly, a passage is shown for its lines that have review items, or for a place, teller or title that has.
    // A passage skipped here leaves its place for the next one shown.
    if (s.reviewOnly && units.length === 0 && ![own, teller, title].some(isReviewed)) continue
    pending = undefined
    const bare = units.length === 0 && teller === undefined && title === undefined
    if (bare && divider === undefined && own !== undefined) divider = own
    if (bare && divider === undefined) continue
    if (divider !== undefined) shownPlace = divider.kr
    const model = e.teller === undefined && e.model !== undefined && units.length > 0 ? e.model : undefined
    out.push({ key: first.p, divider, place: own !== undefined && own !== divider ? own : undefined, teller, title, ...(model !== undefined ? { model } : {}), units })
  }
  return out
}
