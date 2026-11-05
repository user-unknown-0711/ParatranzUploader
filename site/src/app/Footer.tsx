import type { Meta } from '../types'

export interface FooterProps {
  /** The version of the data; not there until meta.json is loaded. */
  meta?: Meta
}

export function Footer({ meta }: FooterProps) {
  const release = meta?.source.release
  const assets = meta?.source.assets
  return (
    <footer class="foot">
      <p>KR／JP／EN 原文著作權屬 Project Moon；本站非商業、供翻譯校對使用。TW 譯文採用 CC BY-NC-SA 4.0。</p>
      {meta && (release || assets) && (
        <p class="foot-version">
          資料版本：
          {release && (
            <>
              譯文{' '}
              <a href={release.url} target="_blank" rel="noopener noreferrer">
                {release.name || release.tag}
              </a>
            </>
          )}
          {release && assets && '；'}
          {assets && (
            <>
              原文 <code>{assets.repo}@{assets.commit.slice(0, 7)}</code>
            </>
          )}
        </p>
      )}
    </footer>
  )
}
