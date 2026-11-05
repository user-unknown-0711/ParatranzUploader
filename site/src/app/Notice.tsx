import type { DataError } from '../data'

export interface NoticeProps {
  error: DataError
  /** What the button does; the default reloads the page. */
  onReload?: () => void
}

/** What a failed load says to the reader: the data moved on (reload), or could not be reached. */
export function Notice({ error, onReload }: NoticeProps) {
  const text = error.kind === 'network' ? '資料載入失敗，請檢查網路後重新整理' : '資料已更新，請重新整理'
  return (
    <div class="notice" role="alert">
      <p>{text}</p>
      <button type="button" onClick={onReload ?? (() => location.reload())}>
        重新整理
      </button>
    </div>
  )
}
