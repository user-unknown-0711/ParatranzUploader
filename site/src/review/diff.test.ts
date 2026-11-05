import { describe, expect, it } from 'vitest'
import { variantDiff } from './diff'

describe('variantDiff', () => {
  it('keeps the tags as pieces in raw mode, and marks a tag only the other has', () => {
    const pieces = variantDiff('使用「加斥我援」', '使用「加斥我<noparse>援</noparse>」', { raw: true })
    expect(pieces.map((p) => p.text).join('')).toBe('使用「加斥我<noparse>援</noparse>」')
    expect(pieces.filter((p) => !p.same).map((p) => p.text)).toEqual(['<noparse>', '</noparse>'])
    expect(pieces.find((p) => p.text === '<noparse>')?.tok).toBe(true)
    // Without raw the tags are no pieces, so the two read the same.
    expect(variantDiff('使用「加斥我援」', '使用「加斥我<noparse>援</noparse>」').every((p) => p.same)).toBe(true)
  })

  it('marks only what differs, and the highlight style counts', () => {
    const pieces = variantDiff('使目標增加<style="highlight">2</style>回 [Laceration]', '使目標增加<style="highlight">2回</style> [Laceration]')
    expect(pieces.filter((p) => !p.same).map((p) => p.text)).toEqual(['回'])
    expect(pieces.find((p) => p.text === '回')?.hl).toBe(true)
  })

  it('shows a space the other has more as different', () => {
    const pieces = variantDiff('使目標增加 [Laceration]', '使目標增加 [Laceration] ')
    const last = pieces[pieces.length - 1]
    expect(last).toEqual({ text: ' ', tok: false, hl: false, same: false })
    expect(pieces.slice(0, -1).every((p) => p.same)).toBe(true)
  })

  it('takes an [ID] as one piece', () => {
    const pieces = variantDiff('a [Laceration]', 'a [Laceration]')
    const tokens = pieces.filter((p) => p.tok)
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.text).toBe('[Laceration]')
    expect(pieces.every((p) => p.same)).toBe(true)
  })

  it('marks every piece of an unrelated text', () => {
    expect(variantDiff('abc', 'xyz').every((p) => !p.same)).toBe(true)
  })

  it('shows a space the other lacks as a missing piece at its place', () => {
    const pieces = variantDiff('獲得攻擊等級提升 ', '獲得攻擊等級提升')
    expect(pieces.filter((p) => !p.missing).map((p) => p.text).join('')).toBe('獲得攻擊等級提升')
    expect(pieces.filter((p) => p.same)).toHaveLength(8)
    const gap = pieces.filter((p) => p.missing)
    expect(gap).toEqual([{ text: ' ', tok: false, hl: false, same: false, missing: true }])
    expect(pieces[pieces.length - 1]).toBe(gap[0])
  })

  it('puts a missing space between its neighbours, and reports other white space too', () => {
    const pieces = variantDiff('a b\u3000c', 'abc')
    expect(pieces.map((p) => (p.missing ? `[${p.text}]` : p.text)).join('')).toBe('a[ ]b[\u3000]c')
    expect(variantDiff('abc', 'abc').some((p) => p.missing)).toBe(false)
    expect(variantDiff('a\nb', 'ab').find((p) => p.missing)?.text).toBe('\n')
  })
})
