import { describe, expect, it } from 'vitest'
import { rowTop, totalHeight, VIRTUAL_MIN, windowRange } from './virtual'

describe('windowRange', () => {
  it('gives all rows up to 1000', () => {
    expect(windowRange(500, 30, 0, 900, 20)).toEqual([0, 500])
    expect(windowRange(500, 30, 9000, 900, 20)).toEqual([0, 500])
    expect(windowRange(VIRTUAL_MIN, 30, 0, 900, 20)).toEqual([0, VIRTUAL_MIN])
    expect(windowRange(0, 30, 0, 900, 20)).toEqual([0, 0])
  })

  it('gives all rows up to 1000 even with a target', () => {
    expect(windowRange(500, 30, 0, 900, 20, 400)).toEqual([0, 500])
  })

  it('gives only the rows near the viewport above 1000', () => {
    const [start, end] = windowRange(5000, 30, 0, 900, 20)
    expect(start).toBe(0)
    expect(end).toBeGreaterThanOrEqual(30 + 20)
    expect(end).toBeLessThanOrEqual(55)
  })

  it('moves with the viewport', () => {
    const [start, end] = windowRange(5000, 30, 30000, 900, 20)
    expect(start).toBe(1000 - 20)
    expect(end).toBeGreaterThanOrEqual(1030 + 20)
    expect(end).toBeLessThanOrEqual(1060 + 5)
  })

  it('stops at the last row', () => {
    const [start, end] = windowRange(5000, 30, 5000 * 30 - 100, 900, 20)
    expect(end).toBe(5000)
    expect(start).toBeLessThan(5000)
    expect(start).toBeGreaterThanOrEqual(5000 - 60)
  })

  it('virtual window includes deep-link target', () => {
    const [start, end] = windowRange(5000, 30, 0, 900, 20, 4800)
    expect(start).toBeLessThanOrEqual(4800)
    expect(end).toBeGreaterThan(4800)
    // ... and it is still a window, not 4800 rows
    expect(end - start).toBeLessThan(200)
  })

  it('includes the target at the ends of the file', () => {
    expect(windowRange(5000, 30, 90000, 900, 20, 0)[0]).toBe(0)
    const [, end] = windowRange(5000, 30, 0, 900, 20, 4999)
    expect(end).toBe(5000)
  })

  it('keeps the viewport rows when the target is among them', () => {
    expect(windowRange(5000, 30, 3000, 900, 20, 110)).toEqual(windowRange(5000, 30, 3000, 900, 20))
  })

  it('ignores a target that is not a row', () => {
    expect(windowRange(5000, 30, 0, 900, 20, 9999)).toEqual(windowRange(5000, 30, 0, 900, 20))
    expect(windowRange(5000, 30, 0, 900, 20, -1)).toEqual(windowRange(5000, 30, 0, 900, 20))
  })

  it('reads the viewport off the measured heights when rows differ', () => {
    // rows 0..999 are 10px tall, the rest 100px: 10000px of small rows first
    const heights = Array.from({ length: 2000 }, (_, i) => (i < 1000 ? 10 : 100))
    const [start, end] = windowRange(2000, heights, 10000 + 500, 600, 2)
    // the viewport shows rows 1005 .. 1010 (500px to 1100px into the 100px rows)
    expect(start).toBe(1005 - 2)
    expect(end).toBe(1011 + 2)
  })

  it('puts the target in the window of measured heights too', () => {
    const heights = Array.from({ length: 3000 }, (_, i) => 20 + (i % 7))
    const [start, end] = windowRange(3000, heights, 0, 800, 10, 2500)
    expect(start).toBeLessThanOrEqual(2500)
    expect(end).toBeGreaterThan(2500)
    expect(end - start).toBeLessThan(200)
  })
})

describe('rowTop and totalHeight', () => {
  it('count a fixed height', () => {
    expect(rowTop(30, 0)).toBe(0)
    expect(rowTop(30, 10)).toBe(300)
    expect(totalHeight(30, 5000)).toBe(150000)
  })

  it('add up measured heights', () => {
    const heights = [10, 20, 30, 40]
    expect(rowTop(heights, 0)).toBe(0)
    expect(rowTop(heights, 3)).toBe(60)
    expect(rowTop(heights, 4)).toBe(100)
    expect(totalHeight(heights, 4)).toBe(100)
  })
})
