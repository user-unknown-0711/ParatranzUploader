import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDataCache } from '../data'
import { fixture, fixtureFetch, runEffectsAtOnce } from '../testdata'
import type { Meta } from '../types'
import { App } from './App'

const containers: HTMLElement[] = []

function mount(): HTMLElement {
  const container = document.createElement('div')
  document.body.append(container)
  containers.push(container)
  render(<App />, container)
  return container
}

async function loaded(el: HTMLElement): Promise<void> {
  await vi.waitFor(() => expect(el.querySelector('.directory, .notice')).not.toBeNull())
}

function go(hash: string): void {
  act(() => {
    location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

let undoEffects = () => {}

beforeEach(() => {
  undoEffects = runEffectsAtOnce()
  clearDataCache()
  localStorage.clear()
  location.hash = ''
  vi.stubGlobal('fetch', vi.fn(fixtureFetch()))
})

afterEach(() => {
  undoEffects()
  for (const container of containers.splice(0)) {
    render(null, container)
    container.remove()
  }
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('shows the release and the assets it compares, the progress and the checks', async () => {
    const el = mount()
    expect(el.querySelector('.top .brand')?.textContent).toBe('Limbus 繁中譯文檢視')
    await loaded(el)
    expect([...el.querySelectorAll('.dir-family-id')].map((e) => e.textContent)).toEqual(['Passives', 'ScenarioModelCodes', 'Skills', 'StoryData'])
    const home = el.querySelector('.home')?.textContent ?? ''
    expect(home).toContain('Release 2023-11-14')
    expect(home).toContain('tool-jx3/Assets@0123456')
    expect(home).toContain('韓文未譯 1')
    expect(home).toContain('佔位符不符 1')
    expect(el.querySelector('.source-warn')).toBeNull()
    expect(el.querySelector('.review-count')?.textContent).toBe('4')
    expect(el.querySelector('.foot-version a')?.getAttribute('href')).toBe('https://github.com/tool-jx3/ParatranzUploader/releases/tag/1700000000')
  })

  it('says when the assets are not the ones of the release', async () => {
    const meta = fixture<Meta>('meta.json')
    vi.stubGlobal('fetch', vi.fn(fixtureFetch({ 'meta.json': { ...meta, source: { ...meta.source, assets: { ...meta.source.assets, pinned: false } } } })))
    const el = mount()
    await loaded(el)
    expect(el.querySelector('.source-warn')?.textContent).toContain('可能比 release 新')
  })

  it('shows the reload notice when the data is of another format', async () => {
    vi.stubGlobal('fetch', vi.fn(fixtureFetch({ 'meta.json': { ...fixture<Meta>('meta.json'), format: 2 } })))
    const el = mount()
    await loaded(el)
    expect(el.querySelector('.notice')?.textContent).toContain('資料已更新，請重新整理')
  })

  it('shows a file as a table, with the status of untranslated texts and a link to each finding', async () => {
    const el = mount()
    await loaded(el)
    go('#/f/Skills_personality-99.json')
    await vi.waitFor(() => expect(el.querySelectorAll('.tbl .trow:not(.thead)').length).toBeGreaterThan(0))
    // "no translation needed" is hidden by default: 11 units, 2 of them the same as KR
    expect(el.querySelector('.file-count')?.textContent).toBe('顯示 9 / 11 個單位')
    expect([...el.querySelectorAll('.cell-zh .status')].map((e) => e.textContent)).toEqual(['英文暫代', '英文暫代', '韓文未譯'])
    const chips = [...el.querySelectorAll<HTMLAnchorElement>('.cell-zh a.chip')]
    expect(chips.map((a) => a.textContent)).toEqual(['關鍵字不符', '佔位符不符', '標籤不符'])
    expect(chips[0]?.getAttribute('href')).toMatch(/^#\/r\/checks\?id=keyword%2F/)
  })

  it('reads a story as a script, with the speaker the game takes from the model', async () => {
    const el = mount()
    await loaded(el)
    go('#/f/StoryData/S9999.json')
    await vi.waitFor(() => expect(el.querySelector('.line-model .cell-zh')?.textContent).toBe('李箱'))
    expect(el.querySelectorAll('.passage')).toHaveLength(6)
    expect(el.querySelector('.line-model .cell-en')?.textContent).toBe('Yi Sang')
  })

  it('says a file is not in the release', async () => {
    const el = mount()
    await loaded(el)
    go('#/f/StoryData/S9998.json')
    await vi.waitFor(() => expect(el.querySelector('.file-absent')).not.toBeNull())
  })

  it('lists the untranslated files, and opens one with only what needs a review', async () => {
    const el = mount()
    await loaded(el)
    go('#/r/untranslated')
    await vi.waitFor(() => expect(el.querySelectorAll('.rv-file')).toHaveLength(2))
    expect(el.querySelector('.rv-orphans')?.textContent).toContain('Old.json')
    const link = el.querySelector<HTMLAnchorElement>('.rv-file a.rv-path')
    expect(link?.textContent).toBe('Skills_personality-99.json')
    act(() => link?.click())
    await vi.waitFor(() => expect(el.querySelector('.file-count')?.textContent).toBe('顯示 5 / 11 個單位'))
    expect(el.querySelector<HTMLInputElement>('[data-setting="reviewOnly"]')?.checked).toBe(true)
  })

  it('lists the findings by check, and the one of the address', async () => {
    const el = mount()
    await loaded(el)
    go('#/r/checks')
    await vi.waitFor(() => expect(el.querySelectorAll('.rv-card')).toHaveLength(4))
    expect([...el.querySelectorAll('.rv-section h2')].map((h) => h.textContent)).toEqual(['佔位符不符 1 項', '關鍵字不符 1 項', '標籤不符 1 項', '韓文殘留 1 項'])
    const keyword = el.querySelector('.rv-card[data-id^="keyword/"]')
    expect(keyword?.querySelector('.tok-miss')?.textContent).toBe('[Burn]')
    expect(keyword?.querySelector('mark')?.textContent).toBe('[Burn]')
    const id = keyword?.getAttribute('data-id') ?? ''
    go(`#/r/checks?kind=tag&id=${encodeURIComponent(id)}`)
    await vi.waitFor(() => expect(el.querySelectorAll('.rv-card')).toHaveLength(2))
    expect(el.querySelector('.rv-card.is-target')?.getAttribute('data-id')).toBe(id)
  })
})
