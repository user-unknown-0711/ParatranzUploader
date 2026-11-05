// How a translation differs from another one: the pieces of the other, each
// told apart from what the two share (longest common subsequence).

/**
 * One unit of a text: an [ID] or one character. A piece with missing is not in the
 * text: it stands where the base has a white space that the text lacks.
 */
export type Piece = { text: string; tok: boolean; hl: boolean; same: boolean; missing?: true }

type Unit = Omit<Piece, 'same'>

const SEGMENT = /<\/?[a-z][a-z-]*(?:=[^<>]*)?>|\[[A-Za-z][A-Za-z0-9_]*\]/gi
const HIGHLIGHT = /^<style="?highlight"?>$/i
const CLOSE_STYLE = /^<\/style>$/i

/**
 * The units of a text; the tags are not units, but a highlight style marks the units inside it.
 * With raw, the tags are units too (as [ID]s are), so a tag one text has and the other lacks shows.
 */
function units(s: string, raw: boolean): Unit[] {
  const out: Unit[] = []
  let depth = 0
  let pos = 0
  const chars = (text: string) => {
    for (const ch of text) out.push({ text: ch, tok: false, hl: depth > 0 })
  }
  for (const m of s.matchAll(SEGMENT)) {
    chars(s.slice(pos, m.index))
    pos = m.index + m[0].length
    const tag = m[0]
    if (tag.startsWith('[') || raw) out.push({ text: tag, tok: true, hl: depth > 0 })
    if (tag.startsWith('[')) continue
    if (HIGHLIGHT.test(tag)) depth++
    else if (CLOSE_STYLE.test(tag) && depth > 0) depth--
  }
  chars(s.slice(pos))
  return out
}

const equal = (a: Unit, b: Unit) => a.text === b.text && a.hl === b.hl

/** Too long for the table of the subsequence: nothing is told to be shared. */
const MAX_CELLS = 4_000_000

/** The units of other; same is false where base has no such unit in the same order. With raw, the tags are units too. */
export function variantDiff(base: string, other: string, opts: { raw?: boolean } = {}): Piece[] {
  const a = units(base, opts.raw ?? false)
  const b = units(other, opts.raw ?? false)
  const n = a.length
  const m = b.length
  const same = new Array<boolean>(m).fill(false)
  // The white space of base that other lacks, by the position in other it would come before.
  const gaps = new Map<number, Piece[]>()
  const gap = (u: Unit, at: number) => {
    if (u.tok || !/^\s$/u.test(u.text)) return
    gaps.set(at, [...(gaps.get(at) ?? []), { ...u, same: false, missing: true }])
  }
  if (n * m <= MAX_CELLS) {
    const width = m + 1
    const len = new Uint16Array((n + 1) * width)
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        len[i * width + j] = equal(a[i]!, b[j]!)
          ? len[(i + 1) * width + j + 1]! + 1
          : Math.max(len[(i + 1) * width + j]!, len[i * width + j + 1]!)
      }
    }
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (equal(a[i]!, b[j]!)) {
        same[j] = true
        i++
        j++
      } else if (len[(i + 1) * width + j]! >= len[i * width + j + 1]!) {
        gap(a[i]!, j)
        i++
      } else j++
    }
    for (; i < n; i++) gap(a[i]!, m)
  }
  const out: Piece[] = []
  b.forEach((u, k) => {
    out.push(...(gaps.get(k) ?? []), { ...u, same: same[k] === true })
  })
  out.push(...(gaps.get(m) ?? []))
  return out
}
