// A parser for the TextMeshPro rich text of the game strings. It builds a tree
// of nodes and never produces markup: what is not a known tag stays text.

export type TmpNode =
  | { t: 'text'; s: string }
  | { t: 'token'; s: string }
  | { t: 'br' }
  | { t: 'sprite'; name: string }
  | { t: 'tag'; name: string; value?: string; kids: TmpNode[] }

type TagNode = Extract<TmpNode, { t: 'tag' }>

// The names internal/validate counts as tags (richTextTags), in any case. A
// longer name that merely starts with one (<bold>, <sizes>) is not a tag, and
// neither is any other <…> text: KR writes <…> around plain words.
const TAG_NAMES = [
  'align', 'allcaps', 'alpha', 'b', 'br', 'color', 'cspace', 'font', 'font-weight', 'gradient', 'i', 'indent',
  'line-height', 'line-indent', 'link', 'lowercase', 'margin', 'mark', 'mspace', 'nobr', 'noparse', 'page',
  'pos', 'rotate', 's', 'size', 'smallcaps', 'space', 'sprite', 'strikethrough', 'style', 'sub', 'sup', 'u',
  'uppercase', 'voffset', 'width', 'ruby',
]

// One alternative for each thing the parser sets apart. The tag is tagRe of
// internal/validate: after the name come =value, or spaces with an optional
// name=value attribute, and then >. A token is an [ID] (idRe), a {…}
// placeholder or a <0> (placeholderRe); a {…} does not run over a tag or a line.
const PIECE = new RegExp(
  [
    `<(?<close>/)?(?<name>${TAG_NAMES.join('|')})(?:=(?<value>[^>]*))?(?<attrs> +(?:[a-z][a-z0-9_-]*=[^>]*)?)?>`,
    String.raw`(?<token>\[[A-Za-z][A-Za-z0-9_]*\]|\{[^{}<>\r\n]+\}|<\d+>)`,
    String.raw`(?<nl>\r?\n)`,
  ].join('|'),
  'gi',
)

/** Parses s into nodes. Closing tags with no opening tag are dropped; tags left open close at the end. */
export function parseTMP(s: string): TmpNode[] {
  const root: TmpNode[] = []
  const open: TagNode[] = []
  const kids = (): TmpNode[] => open[open.length - 1]?.kids ?? root
  const addText = (text: string): void => {
    if (text === '') return
    const into = kids()
    const last = into[into.length - 1]
    if (last?.t === 'text') last.s += text
    else into.push({ t: 'text', s: text })
  }

  let pos = 0
  for (const m of s.matchAll(PIECE)) {
    addText(s.slice(pos, m.index))
    pos = m.index + m[0].length
    const g = m.groups
    if (!g) continue
    if (g.nl !== undefined) {
      kids().push({ t: 'br' })
    } else if (g.token !== undefined) {
      kids().push({ t: 'token', s: g.token })
    } else if (g.name !== undefined) {
      const name = g.name.toLowerCase()
      if (g.close !== undefined) {
        // Closes the nearest open tag of that name, and the tags inside it.
        for (let at = open.length - 1; at >= 0; at--) {
          if (open[at]?.name === name) {
            open.length = at
            break
          }
        }
      } else if (name === 'br') {
        kids().push({ t: 'br' })
      } else if (name === 'sprite') {
        kids().push({ t: 'sprite', name: spriteName(g.value, g.attrs) })
      } else {
        const node: TagNode = { t: 'tag', name, kids: [] }
        if (g.value !== undefined) node.value = unquote(g.value)
        kids().push(node)
        open.push(node)
      }
    }
  }
  addText(s.slice(pos))
  return root
}

/** Strips the pair of quotes around the whole of v, if there is one. */
function unquote(v: string): string {
  const m = /^"([^"]*)"$|^'([^']*)'$/.exec(v)
  return m ? (m[1] ?? m[2] ?? v) : v
}

// An attribute such as name="Burn", name='Burn' or name=Burn.
function attribute(from: string, key: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"']+))`, 'i').exec(from)
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined
}

// The name of a sprite: <sprite name="Burn">, <sprite="Asset" name="Burn">,
// <sprite="Asset" index=3> or <sprite=3>.
function spriteName(value: string | undefined, attrs: string | undefined): string {
  const from = (value === undefined ? '' : '=' + value) + (attrs ?? '')
  return attribute(from, 'name') ?? attribute(from, 'index') ?? unquote(value ?? '').trim()
}
