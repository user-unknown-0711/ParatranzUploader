// What the search reads and how it matches: the text of a game string without
// its tags, and a matcher that gives the ranges of a query in a text. Pure, so
// the worker and the tests share it.
import { parseTMP, type TmpNode } from '../tmp/parse'

/** [start, end) offsets in UTF-16 code units of the string that was matched. */
export type Ranges = [number, number][]

/** Where a query is in a text; no range if it is not. */
export type Matcher = (s: string) => Ranges

function plain(nodes: TmpNode[]): string {
  let out = ''
  for (const n of nodes) {
    switch (n.t) {
      case 'text':
      case 'token':
        out += n.s
        break
      case 'br':
        out += '\n'
        break
      case 'sprite':
        break
      case 'tag':
        out += plain(n.kids)
        break
    }
  }
  return out
}

/**
 * The text of a game string: its tags are gone (a <ruby> keeps the text it is
 * over, not its reading, and a sprite is gone with the rest) and what the game
 * fills in, [ID] and {n}, stays. A line ending is a "\n".
 */
export function stripTags(s: string): string {
  // Without a < there is no tag, and a \r is the one thing the parser would change.
  if (!s.includes('<') && !s.includes('\r')) return s
  return plain(parseTMP(s))
}

const LATIN = /^\p{Script=Latin}$/u
const SYNTAX = /[\\^$.*+?()[\]{}|/]/g

/**
 * One character of a substring query as a pattern that matches it literally.
 * A Latin letter also matches its other case, when that is one code unit like
 * itself; nothing else is folded. The text is never changed, so an offset in a
 * match is an offset in the text: 'İ'.toLowerCase() is two code units, and a
 * text lower-cased to compare would shift every range after it.
 */
function literal(ch: string): string {
  if (LATIN.test(ch)) {
    const lower = ch.toLowerCase()
    const upper = ch.toUpperCase()
    if (lower.length === ch.length && upper.length === ch.length) {
      const forms = [...new Set([ch, lower, upper])]
      if (forms.length > 1) return `[${forms.join('')}]`
    }
  }
  return ch.replace(SYNTAX, '\\$&')
}

/** The code unit offset after the code point at i. */
function advance(s: string, i: number): number {
  const hi = s.charCodeAt(i)
  const lo = s.charCodeAt(i + 1)
  return hi >= 0xd800 && hi <= 0xdbff && lo >= 0xdc00 && lo <= 0xdfff ? i + 2 : i + 1
}

/** A matcher that gives each match of re that has a length. */
function ranges(re: RegExp): Matcher {
  return (s) => {
    const out: Ranges = []
    re.lastIndex = 0
    for (let m = re.exec(s); m !== null; m = re.exec(s)) {
      if (m[0].length > 0) out.push([m.index, m.index + m[0].length])
      // a match with no length (a*, ^, \b) leaves lastIndex where it was
      else re.lastIndex = advance(s, m.index)
    }
    return out
  }
}

/**
 * The matcher of a query: the query as text, ignoring the case of Latin
 * letters, or, with `regex`, as a JavaScript regular expression (flags giu).
 * An empty query, and a pattern that is not valid, give an error to show.
 */
export function makeMatcher(q: string, regex: boolean): Matcher | { error: string } {
  if (q === '') return { error: '請輸入要搜尋的字串' }
  try {
    return ranges(regex ? new RegExp(q, 'giu') : new RegExp([...q].map(literal).join(''), 'gu'))
  } catch (e) {
    return { error: `正規表示式語法錯誤：${e instanceof Error ? e.message : String(e)}` }
  }
}
