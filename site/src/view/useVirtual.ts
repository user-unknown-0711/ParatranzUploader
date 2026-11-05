import type { RefObject } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { rowTop, totalHeight, VIRTUAL_MIN, windowRange, type RowHeights } from './virtual'

/** Rows rendered above and below what is in view. */
const OVERSCAN = 8

/** A row whose bottom is above this many px from the top of the window has been read: the header is there. */
const READ_LINE = 80

/** Where to scroll to, and what to focus: the row, or inside it the first element that matches `inner`. */
type Goal = { row: number; block: 'center' | 'start'; inner?: string }

export interface VirtualOptions {
  /** Identifies each row, so that its measured height is kept while the rows change (a filter). */
  keys: readonly string[]
  /** The height in px of a row that has not been measured. */
  estimate: number
  /** Changes when the rows change their height as a whole (columns, raw tags, layout). */
  layout: string
  /** A row to scroll to and focus once for each id: the unit of a deep link. */
  target?: { id: string; row: number }
}

export interface Virtual {
  /** The element that holds the rows (and the spacers). */
  listRef: RefObject<HTMLDivElement>
  /** The rows [start, end) to render. */
  start: number
  end: number
  /** The px that the rows before start and from end on take, as spacers. */
  before: number
  after: number
  /** Scroll to a row and focus it. */
  reveal: (row: number) => void
  /** The row in focus, else the first row that is in view, else -1. */
  current: () => number
}

/**
 * Which rows of a long list are rendered. The page scrolls (not a box), so the
 * viewport is the window. Rows are measured once rendered; until then they are
 * `estimate` px, so what scrolls past is exact and what lies ahead is a guess
 * that gets better.
 */
export function useVirtual({ keys, estimate, layout, target }: VirtualOptions): Virtual {
  const count = keys.length
  const virtual = count > VIRTUAL_MIN
  const listRef = useRef<HTMLDivElement>(null)
  const measured = useRef(new Map<string, number>())
  const goal = useRef<Goal | undefined>(undefined)
  const seen = useRef('')
  const [, redraw] = useState(0)

  // A new deep link, or one that was hidden and is shown now: scroll there once.
  if (target !== undefined && target.row >= 0 && seen.current !== target.id) {
    seen.current = target.id
    goal.current = { row: target.row, block: 'center', inner: '.is-target' }
  }

  const heights = (): RowHeights => (virtual ? keys.map((k) => measured.current.get(k) ?? estimate) : estimate)

  const compute = (): [number, number] => {
    const el = listRef.current
    const top = el ? Math.max(0, -el.getBoundingClientRect().top) : 0
    return windowRange(count, heights(), top, window.innerHeight, OVERSCAN, goal.current?.row)
  }

  const [range, setRange] = useState<[number, number]>(compute)

  const update = () => {
    const next = compute()
    setRange((prev) => (prev[0] === next[0] && prev[1] === next[1] ? prev : next))
  }

  /** Scroll to the goal and focus it, if its row is in the page. */
  const settle = (): boolean => {
    const g = goal.current
    if (g === undefined) return true
    if (g.row < 0 || g.row >= count) {
      goal.current = undefined
      return true
    }
    const row = listRef.current?.querySelector<HTMLElement>(`[data-row="${g.row}"]`)
    if (!row) return false
    const el = g.inner === undefined || row.matches(g.inner) ? row : (row.querySelector<HTMLElement>(g.inner) ?? row)
    goal.current = undefined
    el.scrollIntoView?.({ block: g.block })
    el.focus({ preventScroll: true })
    return true
  }

  const reveal = (row: number) => {
    goal.current = { row, block: 'start' }
    if (!settle()) update()
  }

  const current = (): number => {
    const list = listRef.current
    if (!list) return -1
    const active = document.activeElement
    const focused = active instanceof HTMLElement ? active.closest<HTMLElement>('[data-row]') : null
    if (focused && list.contains(focused)) return Number(focused.dataset.row)
    for (const el of list.querySelectorAll<HTMLElement>('[data-row]')) {
      if (el.getBoundingClientRect().bottom > READ_LINE) return Number(el.dataset.row)
    }
    return -1
  }

  // What was measured is not true after the rows changed their height as a whole.
  useLayoutEffect(() => {
    measured.current.clear()
  }, [layout])

  // After each render: measure the rows, then go where the goal is, or move the window if the measures moved it.
  useLayoutEffect(() => {
    let changed = false
    if (virtual) {
      for (const el of listRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? []) {
        const key = el.dataset.key
        const h = el.getBoundingClientRect().height
        if (key === undefined || !(h > 0)) continue
        if (Math.abs((measured.current.get(key) ?? 0) - h) >= 0.5) {
          measured.current.set(key, h)
          changed = true
        }
      }
    }
    if (!settle() || changed) update()
  })

  // Other rows: the window may be somewhere that is not there any more.
  const lastKeys = useRef(keys)
  useLayoutEffect(() => {
    if (lastKeys.current === keys) return
    lastKeys.current = keys
    if (virtual) update()
  }, [keys])

  // The window follows the scroll and the width of the page.
  const latest = useRef(update)
  latest.current = update
  useEffect(() => {
    if (!virtual) return
    let frame = 0
    const later = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(() => {
          frame = 0
          latest.current()
        })
      }
    }
    const onResize = () => {
      measured.current.clear() // wrapping changed the heights
      redraw((n) => n + 1)
      later()
    }
    window.addEventListener('scroll', later, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', later)
      window.removeEventListener('resize', onResize)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [virtual])

  if (!virtual) return { listRef, start: 0, end: count, before: 0, after: 0, reveal, current }
  const h = heights()
  const start = Math.min(range[0], count)
  const end = Math.min(Math.max(range[1], start), count)
  return { listRef, start, end, before: rowTop(h, start), after: totalHeight(h, count) - rowTop(h, end), reveal, current }
}
