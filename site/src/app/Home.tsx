import { reviewHref } from '../route'
import { CHECK_CODES, CHECK_INFO, STATUS_INFO } from '../review/names'
import { STATUSES } from '../settings'
import type { Index, Meta } from '../types'

const number = new Intl.NumberFormat('en-US')

/** A date of the release as the reader's calendar has it; the text itself where it is not a date. */
function day(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export interface HomeProps {
  meta: Meta
  index: Index
  /** Open the directory where it is a drawer. */
  onOpenDirectory: () => void
}

/** Where the data comes from, how far the translation is, and what the review holds. */
export function Home({ meta, index, onOpenDirectory }: HomeProps) {
  const { release, assets } = meta.source
  const total = meta.units || 1
  const checks = CHECK_CODES.reduce((n, c) => n + (meta.checks[c] ?? 0), 0)
  return (
    <section class="home">
      <h1>Limbus 繁中譯文檢視</h1>
      <p>release 裡的 TW 譯文與 KR 韓文、JP 日文、EN 英文原文逐句並排對照，並列出還沒翻譯與格式和原文對不上的地方，供翻譯校對使用。</p>

      <dl class="source">
        {release && (
          <div>
            <dt>譯文</dt>
            <dd>
              <a href={release.url} target="_blank" rel="noopener noreferrer">
                {release.name || release.tag}
              </a>{' '}
              <span class="muted">（tag {release.tag}，{day(release.published_at)} 發布）</span>
            </dd>
          </div>
        )}
        {assets && (
          <div>
            <dt>原文</dt>
            <dd>
              <code>
                {assets.repo}@{assets.commit.slice(0, 7)}
              </code>
              {!assets.pinned && <p class="source-warn">這個 release 沒有記錄建置時的原文版本，這裡對照的是 Assets 最新的版本，可能比 release 新：較新的原文會顯示為「缺少」。</p>}
            </dd>
          </div>
        )}
      </dl>

      <dl class="stats">
        <div>
          <dt>群組</dt>
          <dd>{number.format(index.groups.length)}</dd>
        </div>
        <div>
          <dt>檔案</dt>
          <dd>{number.format(meta.files)}</dd>
        </div>
        <div>
          <dt>單位</dt>
          <dd>{number.format(meta.units)}</dd>
        </div>
      </dl>

      <h2>翻譯進度</h2>
      <div class="progress" role="img" aria-label={STATUSES.map((s) => `${STATUS_INFO[s].name} ${meta.status[s] ?? 0}`).join('，')}>
        {STATUSES.map((s) => {
          const n = meta.status[s] ?? 0
          return n > 0 ? <span key={s} class={`bar status-${s}`} style={{ width: `${(n / total) * 100}%` }} title={`${STATUS_INFO[s].name} ${number.format(n)}`} /> : null
        })}
      </div>
      <ul class="legend">
        {STATUSES.map((s) => (
          <li key={s}>
            <span class={`swatch status-${s}`} aria-hidden="true" />
            {STATUS_INFO[s].name} <b>{number.format(meta.status[s] ?? 0)}</b>
            <span class="muted">（{(((meta.status[s] ?? 0) / total) * 100).toFixed(1)}%）</span>
          </li>
        ))}
      </ul>
      {meta.absent > 0 && (
        <p>
          release 沒有的原文檔案：<b>{number.format(meta.absent)}</b> 個（<a href={reviewHref('untranslated', { sub: 'absent' })}>看清單</a>）。
        </p>
      )}

      <h2>
        <a href={reviewHref('checks')}>格式檢查</a> <span class="muted">共 {number.format(checks)} 項</span>
      </h2>
      <ul class="legend">
        {CHECK_CODES.map((c) => (
          <li key={c}>
            <a href={reviewHref('checks', { sub: c })}>{CHECK_INFO[c].name}</a> <b>{number.format(meta.checks[c] ?? 0)}</b>
            <span class="muted">：{CHECK_INFO[c].desc}</span>
          </li>
        ))}
      </ul>

      <h2>使用方式</h2>
      <ul class="howto">
        <li>
          目錄依群組列出檔案，點群組名稱展開；檔名旁的數字是需要審核的單位數。
          <button type="button" class="link only-narrow" onClick={onOpenDirectory}>
            開啟目錄
          </button>
        </li>
        <li>「審核」列出還沒翻譯的檔案與格式檢查的項目，每一項都連到所在檔案的那一列。</li>
        <li>檔案頁的欄位名稱滑過會顯示 Paratranz 的 key（例如 <code>dataList-&gt;0-&gt;content</code>），點一下複製這一列的連結。</li>
        <li>「全文搜尋」在選定語言的所有字串中找文字，可用正規表示式。</li>
        <li>上方的語言開關決定顯示哪些語言欄；選擇會記在這個瀏覽器。</li>
      </ul>
    </section>
  )
}
