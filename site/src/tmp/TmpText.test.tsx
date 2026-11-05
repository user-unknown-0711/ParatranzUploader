import { render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'
import type { Lang } from '../types'
import { TmpText } from './TmpText'

const containers: HTMLElement[] = []

function show(text: string, opts: { raw?: boolean; lang?: Lang } = {}): HTMLElement {
  const container = document.createElement('div')
  document.body.append(container)
  containers.push(container)
  render(<TmpText text={text} raw={opts.raw ?? false} lang={opts.lang ?? 'zh'} />, container)
  return container
}

afterEach(() => {
  for (const container of containers.splice(0)) {
    render(null, container)
    container.remove()
  }
})

describe('TmpText', () => {
  it('shows a script and an img as text, not as elements', () => {
    for (const s of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<b><img src=x onerror=alert(1)></b>']) {
      const el = show(s)
      expect(el.querySelector('script'), s).toBeNull()
      expect(el.querySelector('img'), s).toBeNull()
      expect(el.textContent, s).toBe(s.replace(/<\/?b>/g, ''))
    }
  })

  it('does not let an attribute value out of its tag', () => {
    const el = show('<color=#fff" onmouseover="alert(1)>x</color>')
    expect(el.querySelector('[onmouseover]')).toBeNull()
    expect(el.querySelector('[style]')).toBeNull()
    expect(el.textContent).toBe('x')
  })

  it('shows ruby with the reading above the text', () => {
    const el = show('<ruby=天退星>插翅虎</ruby>')
    const ruby = el.querySelector('ruby')
    expect(ruby).not.toBeNull()
    expect(ruby?.querySelector('rt')?.textContent).toBe('天退星')
    expect(ruby?.firstChild?.textContent).toBe('插翅虎')
  })

  it('limits a relative size to 0.75 to 1.5 times', () => {
    expect(show('<size=200%>大</size>').querySelector<HTMLElement>('[style]')?.style.fontSize).toBe('1.5em')
    expect(show('<size=10%>小</size>').querySelector<HTMLElement>('[style]')?.style.fontSize).toBe('0.75em')
    expect(show('<size=120%>中</size>').querySelector<HTMLElement>('[style]')?.style.fontSize).toBe('1.2em')
    expect(show('<size=100%>常</size>').querySelector<HTMLElement>('[style]')?.style.fontSize).toBe('1em')
  })

  it('shows an absolute size as 1.25em, and keeps only the text of an odd size', () => {
    expect(show('<size=24>大</size>').querySelector<HTMLElement>('[style]')?.style.fontSize).toBe('1.25em')
    const odd = show('<size=+5>x</size>')
    expect(odd.querySelector('[style]')).toBeNull()
    expect(odd.textContent).toBe('x')
  })

  it('sets a color for hex digits only', () => {
    expect(show('<color=#e30000>紅</color>').querySelector<HTMLElement>('[style]')?.style.color).toBe('rgb(227, 0, 0)')
    expect(show('<color=#f00>紅</color>').querySelector<HTMLElement>('[style]')?.style.color).toBe('rgb(255, 0, 0)')
    expect(show('<color=#e3000080>紅</color>').querySelector<HTMLElement>('[style]')).not.toBeNull()
    for (const bad of ['red', '#12', '#12345', '#ggg', 'e30000', 'rgb(0,0,0)', 'url(x)']) {
      const el = show(`<color=${bad}>字</color>`)
      expect(el.querySelector('[style]'), bad).toBeNull()
      expect(el.textContent, bad).toBe('字')
    }
  })

  it('maps b, i, u and s to their elements', () => {
    const el = show('<b>a</b><i>b</i><u>c</u><s>d</s>')
    for (const name of ['b', 'i', 'u', 's']) {
      expect(el.querySelectorAll(name), name).toHaveLength(1)
    }
    expect(el.textContent).toBe('abcd')
  })

  it('shows a sprite by its name', () => {
    expect(show('甲<sprite name="Burn">乙').textContent).toBe('甲[sprite:Burn]乙')
  })

  it('keeps only the content of the other tags', () => {
    const el = show('<style="dkr">피가</style> <link="x">鏈</link><noparse>np</noparse>')
    expect(el.textContent).toBe('피가 鏈np')
    expect(el.querySelector('a, style, link')).toBeNull()
  })

  it('shows a newline as a br', () => {
    const el = show('甲\n乙')
    expect(el.querySelectorAll('br')).toHaveLength(1)
    expect(el.textContent).toBe('甲乙')
  })

  it('marks the tokens, with the text unchanged', () => {
    const el = show('[Burn] {0}')
    expect(el.textContent).toBe('[Burn] {0}')
    expect([...el.querySelectorAll('.tok')].map((t) => t.textContent)).toEqual(['[Burn]', '{0}'])
  })

  it('shows angle text that is not a tag as it is', () => {
    expect(show('<N公司……>前').textContent).toBe('<N公司……>前')
    expect(show('a < b').textContent).toBe('a < b')
  })

  it('shows the original string in a monospace element when raw', () => {
    const s = '<color=#e30000>紅</color>字\n[Burn] <script>alert(1)</script>'
    const el = show(s, { raw: true })
    expect(el.textContent).toBe(s)
    expect(el.querySelector('color, script, br, .tok')).toBeNull()
    expect(el.querySelector('.tmp-raw')).not.toBeNull()
  })

  it('sets the lang attribute of its language', () => {
    expect(show('x', { lang: 'kr' }).firstElementChild?.getAttribute('lang')).toBe('ko')
    expect(show('x', { lang: 'jp' }).firstElementChild?.getAttribute('lang')).toBe('ja')
    expect(show('x', { lang: 'en' }).firstElementChild?.getAttribute('lang')).toBe('en')
    expect(show('x', { lang: 'zh' }).firstElementChild?.getAttribute('lang')).toBe('zh-Hant-TW')
  })

  it('marks the matches in raw mode too, with the tags shown as they are', () => {
    const container = document.createElement('div')
    document.body.append(container)
    render(<TmpText text={'<sprite name="Burn"> 達5次以上の時'} raw lang="zh" mark={/の/g} />, container)
    expect(container.querySelector('.tmp-raw')?.textContent).toBe('<sprite name="Burn"> 達5次以上の時')
    expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['の'])
    render(null, container)
    container.remove()
  })

  it('shows a new text when it changes', () => {
    const el = show('<b>甲</b>')
    render(<TmpText text="乙" raw={false} lang="zh" />, el)
    expect(el.textContent).toBe('乙')
    expect(el.querySelector('b')).toBeNull()
  })
})
