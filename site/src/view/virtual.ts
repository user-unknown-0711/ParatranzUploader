// Only the rows near the viewport are in the page, so that a file of tens of
// thousands of units is as light as a short one. Rows differ in height, so the
// heights can be given row by row (as far as they are measured), not only as
// one number.

/** Up to this many rows everything is rendered. */
export const VIRTUAL_MIN = 1000

/** One height for all rows, or the height of each row. */
export type RowHeights = number | readonly number[]

function heightOf(h: RowHeights, i: number): number {
  return typeof h === 'number' ? h : (h[i] ?? 0)
}

/** The distance in px from the top of the first row to the top of row i. */
export function rowTop(h: RowHeights, i: number): number {
  if (typeof h === 'number') return i * h
  let y = 0
  for (let k = 0; k < i; k++) y += h[k] ?? 0
  return y
}

/** The height in px of count rows. */
export function totalHeight(h: RowHeights, count: number): number {
  return rowTop(h, count)
}

/** The row that holds the point y (px from the top of the first row), clamped to the rows. */
function rowAt(h: RowHeights, count: number, y: number): number {
  if (typeof h === 'number') return Math.min(count - 1, Math.max(0, Math.floor(y / h)))
  let bottom = 0
  for (let i = 0; i < count; i++) {
    bottom += h[i] ?? 0
    if (y < bottom) return i
  }
  return count - 1
}

/**
 * The rows [start, end) to render for a viewport of viewportHeight px whose
 * top is viewportTop px below the top of the first row, with overscan rows
 * more at each end. Up to VIRTUAL_MIN rows it is all of them.
 *
 * With a target (the row of a deep link) the range holds that row. If the
 * viewport is elsewhere the range is the one of a viewport centred on the
 * target — the page is about to scroll there — and not a range that spans both,
 * which would be the whole file.
 */
export function windowRange(
  count: number,
  rowHeight: RowHeights,
  viewportTop: number,
  viewportHeight: number,
  overscan: number,
  target?: number,
): [start: number, end: number] {
  if (count <= VIRTUAL_MIN) return [0, count]
  const span = (top: number): [number, number] => [rowAt(rowHeight, count, top), rowAt(rowHeight, count, top + viewportHeight - 1e-6) + 1]
  let [first, last] = span(Math.max(0, viewportTop))
  if (target !== undefined && target >= 0 && target < count && (target < first || target >= last)) {
    const centred = rowTop(rowHeight, target) - (viewportHeight - heightOf(rowHeight, target)) / 2
    ;[first, last] = span(Math.max(0, centred))
  }
  return [Math.max(0, first - overscan), Math.min(count, last + overscan)]
}
