import { afterEach, describe, expect, it } from 'vitest'
import { defaultSettings, loadSettings, saveSettings } from './settings'

afterEach(() => localStorage.clear())

describe('settings', () => {
  it('shows every language and every status but "no translation needed" by default', () => {
    const s = defaultSettings()
    expect(s.langs).toEqual({ kr: true, jp: true, en: true, zh: true })
    expect(s.statuses).toEqual({ tw: true, en: true, kr: true, missing: true, same: false })
    expect(s.reviewOnly).toBe(false)
  })

  it('keeps what was saved, and TW is always shown', () => {
    const s = defaultSettings()
    saveSettings({ ...s, langs: { ...s.langs, jp: false, zh: false }, statuses: { ...s.statuses, tw: false }, reviewOnly: true, scriptMode: 'off' })
    const back = loadSettings()
    expect(back.langs).toEqual({ kr: true, jp: false, en: true, zh: true })
    expect(back.statuses.tw).toBe(false)
    expect(back.reviewOnly).toBe(true)
    expect(back.scriptMode).toBe('off')
  })

  it('uses the defaults for what is not valid', () => {
    localStorage.setItem('paratranz-viewer-settings', '{"langs":3,"statuses":{"en":"no"},"scriptMode":"x","rawTags":1}')
    expect(loadSettings()).toEqual(defaultSettings())
    localStorage.setItem('paratranz-viewer-settings', 'not json')
    expect(loadSettings()).toEqual(defaultSettings())
  })
})
