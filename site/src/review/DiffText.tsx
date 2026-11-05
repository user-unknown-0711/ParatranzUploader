import { Fragment, type ComponentChildren } from 'preact'
import type { Piece } from './diff'

/** The pieces of a translation: [ID]s as tokens, the highlight style as colour, what differs on a background, an extra space as a sign. */
export function DiffText({ pieces, raw = false }: { pieces: Piece[]; raw?: boolean }) {
  const out: ComponentChildren[] = []
  let run: ComponentChildren[] | undefined
  const flush = (k: number) => {
    // A run and a piece are keyed apart: the same number for both would confuse a redraw.
    if (run) out.push(<span key={`d${k}`} class="rv-d">{run}</span>)
    run = undefined
  }
  pieces.forEach((p, k) => {
    const node = piece(p, k)
    if (p.same) {
      flush(k)
      out.push(node)
    } else (run ??= []).push(node)
  })
  flush(pieces.length)
  return <span class={raw ? 'tmp tmp-raw' : 'tmp'} lang="zh-Hant-TW">{out}</span>
}

const WHITE_SPACE = /^\s$/u
const SIGNS: Record<string, { sign: string; name: string }> = {
  ' ': { sign: '␣', name: '空格' },
  '\u3000': { sign: '□', name: '全形空格' },
  '\u00a0': { sign: '⍽', name: '不換行空格' },
  '\t': { sign: '⇥', name: '定位字元' },
  '\n': { sign: '↵', name: '換行' },
  '\r': { sign: '↵', name: '換行' },
}

/** The visible sign and the name of a white space character. */
function whiteSpace(ch: string): { sign: string; name: string } {
  return SIGNS[ch] ?? { sign: '␣', name: '空白' }
}

function piece(p: Piece, k: number): ComponentChildren {
  let node: ComponentChildren
  if (p.tok) node = <span class="tok">{p.text}</span>
  else if (!p.same && WHITE_SPACE.test(p.text)) {
    const w = whiteSpace(p.text)
    node = (
      <span class="rv-sp" title={`${p.missing ? '少了' : '多了'}一個${w.name}`} aria-label={`${p.missing ? '少了' : '多了'}一個${w.name}`}>
        {w.sign}
      </span>
    )
  }
  else node = p.text
  return p.hl ? <span key={`p${k}`} class="rv-hl">{node}</span> : <Fragment key={`p${k}`}>{node}</Fragment>
}
