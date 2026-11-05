import type { Index } from '../types'

/** The files before and after a file, in the order of index.files; a side the file has none on is left out. */
export function neighbors(index: Index, path: string): { prev?: string; next?: string } {
  const n = index.files.findIndex((f) => f.path === path)
  if (n < 0) return {}
  const prev = index.files[n - 1]?.path
  const next = index.files[n + 1]?.path
  return { ...(prev !== undefined && { prev }), ...(next !== undefined && { next }) }
}

export type KeyAction = 'prevFile' | 'nextFile' | 'nextRow' | 'prevRow'

const KEYS: Record<string, KeyAction> = { '[': 'prevFile', ']': 'nextFile', j: 'nextRow', k: 'prevRow' }

/** Inputs that take typed text, or letters (a select): the keys of the page are not for them. */
const NO_TEXT = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']

function takesKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target instanceof HTMLInputElement) return !NO_TEXT.includes(target.type)
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable
}

/** What a key press asks of the file view: [ and ] change the file, j and k move by a passage. Nothing while a box takes the typing. */
export function keyAction(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>): KeyAction | undefined {
  if (e.ctrlKey || e.metaKey || e.altKey) return undefined
  if (takesKeys(e.target)) return undefined
  return KEYS[e.key]
}
