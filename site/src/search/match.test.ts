import { describe, expect, it } from 'vitest'
import { makeMatcher, stripTags } from './match'

/** The matcher of a query that is valid; the test fails if it is not. */
function matcher(q: string, regex = false): (s: string) => [number, number][] {
  const m = makeMatcher(q, regex)
  if (typeof m !== 'function') throw new Error(`not a matcher: ${m.error}`)
  return m
}

describe('stripTags', () => {
  it('drops the tags and keeps the text and the [ID] and {n} the game fills in', () => {
    expect(stripTags('<color=#fff>甲</color>[Burn]')).toBe('甲[Burn]')
    expect(stripTags('[OnSucceedAttack] 賦予目標 {0} [Burn]')).toBe('[OnSucceedAttack] 賦予目標 {0} [Burn]')
    expect(stripTags('<size=120%>警告</size>\n<b>[Burn]</b> {0}')).toBe('警告\n[Burn] {0}')
  })

  it('keeps the text inside <ruby> and drops its reading and the sprites', () => {
    expect(stripTags('有個被稱作<ruby=天退星>插翅虎</ruby>的人。')).toBe('有個被稱作插翅虎的人。')
    expect(stripTags('<sprite name="Burn"> 達 5 次以上')).toBe(' 達 5 次以上')
  })

  it('turns <br> and a line ending into a newline', () => {
    expect(stripTags('一<br>二\r\n三')).toBe('一\n二\n三')
  })

  it('keeps what is not a tag of the whitelist as text', () => {
    expect(stripTags('<……什麼？> <bold>x</bold> 1 < 2')).toBe('<……什麼？> <bold>x</bold> 1 < 2')
  })

  it('closes what is left open and ignores a closing tag with no opening', () => {
    expect(stripTags('<b>甲</i>乙')).toBe('甲乙')
  })

  it('is the identity on a string with no < in it', () => {
    expect(stripTags('plain {0} [ID]\n字')).toBe('plain {0} [ID]\n字')
    expect(stripTags('')).toBe('')
  })
})

describe('makeMatcher, substring', () => {
  it('is case-insensitive for Latin letters', () => {
    expect(matcher('cinq')('Cinq協會')).toEqual([[0, 4]])
    expect(matcher('CINQ')('xx cinq')).toEqual([[3, 7]])
    expect(matcher('é')('CAFÉ')).toEqual([[3, 4]])
  })

  it('does not fold the case of other scripts', () => {
    expect(matcher('ω')('Ω ω')).toEqual([[2, 3]])
  })

  it('gives every range, in order and without overlap', () => {
    expect(matcher('協會')('Cinq協會與協會')).toEqual([
      [4, 6],
      [7, 9],
    ])
    expect(matcher('aa')('aaaaa')).toEqual([
      [0, 2],
      [2, 4],
    ])
  })

  it('gives no range where the text does not hold the query', () => {
    expect(matcher('協會')('但丁')).toEqual([])
    expect(matcher('x')('')).toEqual([])
  })

  it('takes the query as it is: no character of it is a pattern', () => {
    expect(matcher('a.c')('abc a.c')).toEqual([[4, 7]])
    expect(matcher('(+)[x]\\')('f(+)[x]\\')).toEqual([[1, 8]])
    expect(matcher('{0}')('值 {0} 以上')).toEqual([[2, 5]])
    expect(matcher('a-b/c|d')('a-b/c|d')).toEqual([[0, 7]])
  })

  it('keeps the offsets where lower-casing would change the length of the text', () => {
    // 'İ'.toLowerCase() is two code units long.
    expect(matcher('x')('İx')).toEqual([[1, 2]])
    expect(matcher('i')('İi')).toEqual([[1, 2]])
    expect(matcher('İ')('ai İ')).toEqual([[3, 4]])
  })

  it('counts the offsets in UTF-16 code units', () => {
    expect(matcher('b')('😀b')).toEqual([[2, 3]])
    expect(matcher('😀')('a😀😀')).toEqual([
      [1, 3],
      [3, 5],
    ])
  })

  it('gives the same ranges to every string: it keeps nothing from the one before', () => {
    const m = matcher('a')
    expect(m('xa')).toEqual([[1, 2]])
    expect(m('xa')).toEqual([[1, 2]])
    expect(m('a')).toEqual([[0, 1]])
  })

  it('returns an error for an empty query', () => {
    expect(makeMatcher('', false)).toHaveProperty('error')
    expect(makeMatcher('', true)).toHaveProperty('error')
    expect(typeof (makeMatcher('', false) as { error: string }).error).toBe('string')
  })
})

describe('makeMatcher, regular expression', () => {
  it('matches a pattern', () => {
    expect(matcher('對話 \\d+', true)('對話 3')).toEqual([[0, 4]])
    expect(matcher('\\[\\w+\\]', true)('[Burn] 與 [Bleed]')).toEqual([
      [0, 6],
      [9, 16],
    ])
  })

  it('ignores case, with the u flag', () => {
    expect(matcher('cinq', true)('CINQ')).toEqual([[0, 4]])
    expect(matcher('\\p{Script=Hangul}+', true)('a 지부 b')).toEqual([[2, 4]])
  })

  it('returns an error for a pattern that is not valid', () => {
    for (const bad of ['(', '[a-', '*a', '\\', 'a{2,1}', '\\-']) {
      const m = makeMatcher(bad, true)
      expect(typeof m, bad).toBe('object')
      expect((m as { error: string }).error, bad).not.toBe('')
    }
  })

  it('says what is wrong with a pattern that is not valid', () => {
    expect((makeMatcher('(', true) as { error: string }).error).toContain('正規表示式')
  })

  it('returns an error for an empty pattern', () => {
    expect(makeMatcher('', true)).toHaveProperty('error')
  })

  it('gives no range for a match that has no length, and still finds the others', () => {
    expect(matcher('a*', true)('baab')).toEqual([[1, 3]])
    expect(matcher('^', true)('abc')).toEqual([])
    expect(matcher('$', true)('abc')).toEqual([])
    expect(matcher('x*', true)('abc')).toEqual([])
    expect(matcher('\\b', true)('ab cd')).toEqual([])
    expect(matcher('(?=b)', true)('abab')).toEqual([])
    expect(matcher('a|b*', true)('ab')).toEqual([[0, 1], [1, 2]])
  })

  it('moves on over a whole code point when a match has no length', () => {
    expect(matcher('(?:)', true)('😀😀')).toEqual([])
    expect(matcher('x*', true)('😀x')).toEqual([[2, 3]])
  })

  it('counts a code point in a range as two code units', () => {
    expect(matcher('.', true)('😀')).toEqual([[0, 2]])
  })

  it('keeps nothing from the string before', () => {
    const m = matcher('a', true)
    expect(m('xa')).toEqual([[1, 2]])
    expect(m('xa')).toEqual([[1, 2]])
  })
})
