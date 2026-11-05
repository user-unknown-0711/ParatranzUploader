import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../settings'
import { fixture } from '../testdata'
import type { FileData, Unit } from '../types'
import { groupEntries, isScriptFile, passages, visibleUnits } from './group'

const story = fixture<FileData>('files/StoryData/S9999.json').units
const skills = fixture<FileData>('files/Skills_personality-99.json').units

function unit(p: string, f: string, i: number, extra: Partial<Unit> = {}): Unit {
  return { p, f, i, kr: p, zh: p, s: 'tw', ...extra }
}

describe('groupEntries and passages', () => {
  it('makes one passage of each dataList element, with the place where it changes', () => {
    const shown = passages(groupEntries(story), defaultSettings())
    expect(shown).toHaveLength(8)
    expect(shown[0]?.divider?.zh).toBe('4區 後巷')
    expect(shown[1]?.teller?.zh).toBe('但丁')
    expect(shown[1]?.title?.zh).toBe('管理人')
    expect(shown[3]?.divider?.zh).toBe('邊獄公司 巴士')
  })

  it('gives the model of a line that has no teller, and none where there is one', () => {
    const shown = passages(groupEntries(story), defaultSettings())
    expect(shown[5]?.model).toBe('이상')
    expect(shown[5]?.teller).toBeUndefined()
    expect(shown.slice(0, 5).map((p) => p.model)).toEqual([undefined, undefined, undefined, undefined, undefined])
  })

  it('hides a passage whose lines the status filter hides, and keeps the model of a teller that is only hidden', () => {
    const s = defaultSettings()
    const units = [unit('a', 'teller', 0), unit('b', 'content', 0, { s: 'en' }), unit('c', 'content', 1, { m: '이상' })]
    expect(passages(groupEntries(units), { ...s, statuses: { ...s.statuses, en: false } }).map((p) => p.key)).toEqual(['c'])
    expect(passages(groupEntries(units), { ...s, statuses: { ...s.statuses, tw: false } }).map((p) => [p.key, p.model])).toEqual([['b', undefined]])
  })
})

describe('visibleUnits', () => {
  it('leaves out the statuses that are not ticked: "no translation needed" by default', () => {
    expect(visibleUnits(skills, defaultSettings()).some((u) => u.s === 'same')).toBe(false)
    expect(visibleUnits(skills, { ...defaultSettings(), statuses: { tw: true, en: true, kr: true, missing: true, same: true } })).toHaveLength(skills.length)
  })

  it('keeps only what needs a review with reviewOnly: untranslated, with findings, or translated in more than one way', () => {
    const shown = visibleUnits(skills, { ...defaultSettings(), reviewOnly: true })
    expect(shown.map((u) => `${u.p}:${u.s}:${u.w?.length ?? 0}${u.v ? ':v' : ''}`)).toEqual([
      'dataList->0->desc:tw:1',
      'dataList->1->name:en:0',
      'dataList->1->desc:en:0',
      'dataList->2->name:kr:0',
      'dataList->2->desc:tw:0:v',
      'dataList->4->desc:tw:2',
      'dataList->5->desc:tw:0:v',
    ])
  })
})

describe('isScriptFile', () => {
  it('is a story, or a dialogue of RPGSystem', () => {
    expect(isScriptFile('StoryData/S1.json')).toBe(true)
    expect(isScriptFile('RPGSystem/rpg-loc-dialogue-floor-1.json')).toBe(true)
    expect(isScriptFile('RPGSystem/rpg-loc-items.json')).toBe(false)
    expect(isScriptFile('Skills.json')).toBe(false)
  })
})
