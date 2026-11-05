import type { CheckCode, JPENClass, Status, Unit } from '../types'

/** What each status is called, and what it means. */
export const STATUS_INFO: Record<Status, { name: string; desc: string }> = {
  tw: { name: '已翻譯', desc: 'release 裡是譯文' },
  en: { name: '英文暫代', desc: 'release 裡是英文：Paratranz 上還沒有譯文' },
  kr: { name: '韓文未譯', desc: 'release 裡是韓文原文：Paratranz 上還沒有譯文，也沒有英文可墊' },
  missing: { name: '缺少', desc: 'release 沒有這個字串：檔案或 key 不在 release 裡（多半是 release 之後才新增的原文）' },
  same: { name: '無需翻譯', desc: 'release 與原文相同，而原文沒有韓文（數字、符號、代號）' },
}

/** The statuses a reviewer has to look at. */
export const UNTRANSLATED: readonly Status[] = ['en', 'kr', 'missing']

/** What each check is called, and what it looks for. */
export const CHECK_INFO: Record<CheckCode, { name: string; desc: string }> = {
  placeholder: { name: '佔位符不符', desc: '{0} 這類佔位符與原文不同：遊戲填入的數值可能消失或錯位' },
  keyword: { name: '關鍵字不符', desc: '[Burn] 這類關鍵字代碼與原文不同：遊戲不會把它換成關鍵字圖示與說明' },
  tag: { name: '標籤不符', desc: '<color>、<style> 等標籤與原文不同，或開了沒關：顏色、樣式可能延伸到後面的文字' },
  hangul: { name: '韓文殘留', desc: '譯文裡有韓文：可能漏譯' },
  llc: { name: 'LLC 匯入未校對', desc: '譯文以 [LLC] 開頭：由簡中匯入，還沒校對' },
}

export const CHECK_CODES: readonly CheckCode[] = ['placeholder', 'keyword', 'tag', 'hangul', 'llc']

/** The code of a finding, from its ID ("placeholder/0123abcd"). */
export function checkCode(id: string): CheckCode | undefined {
  const code = id.slice(0, id.indexOf('/'))
  return (CHECK_CODES as readonly string[]).includes(code) ? (code as CheckCode) : undefined
}

/** The badge of an inconsistent group, and what it means. */
export const JPEN_INFO: Record<JPENClass, { name: string; desc: string }> = {
  same: { name: 'JP/EN 相同', desc: '所有單位的 JP 與 EN 都相同：譯法不同多半是真的不一致' },
  explained: { name: 'JP/EN 可解釋', desc: '每一種 JP/EN 只對到一種譯法：KR 比 JP、EN 籠統，譯法不同可能是對的' },
  partial: { name: '部分可解釋', desc: '有些 JP/EN 對到兩種以上的譯法' },
}

export const JPEN_CLASSES: readonly JPENClass[] = ['same', 'explained', 'partial']

/** Whether a reviewer has to look at the unit: it is not translated, its translation has findings, or its text is translated in more than one way. */
export function needsReview(u: Unit | undefined): boolean {
  if (u === undefined) return false
  return UNTRANSLATED.includes(u.s) || (u.w?.length ?? 0) > 0 || u.v !== undefined
}
