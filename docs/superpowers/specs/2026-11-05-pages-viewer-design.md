# 譯文對照與審核網站（GitHub Pages）— 設計

> 參考：tool-jx3/limbus-translate 的 `pages.yml` 與 `site/`（Go 產生 JSON → Preact＋Vite 靜態網站 → `actions/deploy-pages`）。
> 需求：參考該專案的 GitHub Pages 做法，增加檢視譯文與顯示審核資訊的頁面；在 release 之後，根據 release 檔案以及指定的 Assets repo 建立。

## 1. 目的

給譯者與校對者一個不用下載 zip、不用 clone repo 就能用的網頁：

- **檢視**：任一檔案的 KR／JP／EN 原文與 release 裡的 TW 譯文逐句並排；劇情檔可用劇本模式連貫閱讀；全文搜尋。
- **審核資訊**：這次 release 還有哪些字串沒翻（仍是韓文、英文暫代、release 缺少）、哪些譯文的格式和原文對不上（佔位符、關鍵字、TextMeshPro 標籤），每一項都連到所在檔案的那一列。

## 2. 輸入（只有這兩樣）

| 來源 | 內容 | 取得方式 |
|---|---|---|
| Release 檔案 | `localize_files.zip`（`Lang/TW/` 底下的全部 JSON，即玩家看到的譯文） | `gh release download <tag> -p localize_files.zip` |
| Assets repo（`vars.ASSETS_REPO`） | `kr/`、`jp/`、`en/` 原文 | `actions/checkout`；release 有記錄 Assets commit 時取那個 commit |

不讀 Paratranz（不需要 `PARA_*` secrets）。release 本身沒有 Paratranz 的 stage，所以「審核資訊」是由 release 譯文與原文比對得出（§4）。

為了讓網站對照的原文就是 release 當時用的原文，`release.yaml` 與 `release-with-importllc.yaml` 在 release notes 末尾加一行 HTML 註解 `<!-- assets-commit: <40 碼 SHA> -->`（GitHub 上不顯示）。沒有這行的舊 release 改用 Assets 預設分支的最新 commit，網站首頁會提示「原文版本可能比 release 新」。

## 3. 架構

```
release 的 localize_files.zip ─┐
ASSETS_REPO（kr/jp/en）────────┼─ ./ParatranzUploader -site site/public/data ─┐
release 資訊（tag、網址、日期）─┘                                              │
site/（Preact＋Vite 原始碼）────────────────── npm run build ─── site/dist ───┴─ upload-pages-artifact → deploy-pages
```

- Go：在現有 CLI 加 `-site <輸出目錄>` 模式（`site.go`），沿用 `alignOrderByID` 把 EN、JP、TW 依 KR 的 `id` 順序對齊，key 與 Paratranz 相同（`dataList->3->content`），方便到 Paratranz 搜尋。
- 前端：沿用 limbus-translate 的 TextMeshPro 標籤呈現、Web Worker 全文搜尋、虛擬捲動、劇本模式分段（兩邊都是 GPL-3.0）。
- 網站資料只由 CI 產生並部署，不 commit。

## 4. 狀態與檢查

每個單位（KR 的一個非空字串；`id`、`model` 欄位不算，與匯出時不翻譯的欄位相同）有一個**狀態**：

| 狀態 | 條件 |
|---|---|
| `tw` 已翻譯 | 其他情況 |
| `en` 英文暫代 | TW 等於 EN、EN 不等於 KR 且 EN 含拉丁字母（匯出時先用 EN 墊底） |
| `kr` 韓文未譯 | TW 等於 KR 且 KR 含韓文 |
| `same` 無需翻譯 | TW 等於 KR 且 KR 不含韓文（數字、符號、英文代號）；預設隱藏 |
| `missing` 缺少譯文 | release 裡沒有這個檔案或這個 key |

已翻譯的單位再做**格式檢查**（同一組 KR＋TW 在多處出現時合併成一項）：

| 代碼 | 名稱 | 條件 |
|---|---|---|
| `placeholder` | 佔位符不符 | `{0}` 這類佔位符的集合與 KR 不同（也抓得到整列錯位） |
| `keyword` | 關鍵字不符 | `[Burn]` 這類關鍵字代碼的集合與 KR 不同 |
| `tag` | 標籤不符 | TextMeshPro 標籤種類與 KR 不同；或譯文留下比 KR 多的未關閉標籤、有多出來的關閉標籤（KR 自己沒關、譯文關好了的不算）。`<ruby>`、`<br>` 由譯者決定，不檢查 |
| `hangul` | 韓文殘留 | TW 含韓文 |
| `llc` | LLC 匯入未校對 | TW 以 `[LLC]` 開頭 |

**不一致的譯法**（2026-11-06 追加，做法同 limbus-translate 審核頁的「不一致的譯法」與「連同 JP/EN」檢視）：已翻譯（`tw`）的單位依（群組、欄位、KR 文字）分組，一組有兩種以上的 TW 譯法就是一項，單位最多的在前。每種譯法再依該單位的（JP, EN）分子組，並依此把整組分類：

| 分類 | 條件 |
|---|---|
| `same` JP/EN 相同 | 所有單位的 JP 與 EN 都相同：多半是真的不一致 |
| `explained` JP/EN 可解釋 | 不只一種 (JP, EN)，而且每一種只對到一種譯法：KR 比 JP、EN 籠統，譯法不同可能是對的 |
| `partial` 部分可解釋 | 其他 |

沒有 JP 或 EN 時「沒有」算一個值。分類只是給人看的提示，不替人決定。

## 5. 資料（`-site` 的輸出，format 1）

所有 JSON 為 UTF-8、無縮排；同樣的輸入產生相同的輸出。

- `meta.json`：`format`、`source`（`release{tag,name,url,published_at}`、`assets{repo,commit,pinned}`）、`langs`、`files`、`units`、`status`（各狀態單位數）、`checks`（各代碼項目數）、`absent`（release 沒有的 KR 檔數）、`orphans`（只在 release 的檔案路徑）
- `index.json`：`groups[{id, files[]}]`（子目錄，或根目錄檔名的英文字首）、`files[{path, group, label, speakers, units, status{}, checks, missing{en,jp}, absent?}]`；`files` 的順序就是上一檔／下一檔的順序
- `files/<path>`：`{path, units[{p, f, i, kr, jp?, en?, zh?, s, w?, m?}]}`；`p` 是 Paratranz key、`f` 欄位名、`i` 所屬 `dataList` 索引、`s` 狀態、`w` 檢查項目 ID、`m` 該元素沒有 `teller` 時的 `model`
- `models.json`：`ScenarioModelCodes-AutoCreated.json` 的 `{model: {kr, jp, en, zh}}`，劇本模式用它顯示只有 `model` 的台詞的說話者（與遊戲相同）
- `search/keys.json` 與 `search/{kr,jp,en,zh}.json`：全文搜尋（不含 `same`）
- `review/checks.json`：`items[{id, code, kr, zh, miss[], extra[], keys[]}]`，`keys` 為 `<path>|<key>`
- `review/inconsistent.json`：`items[{id, group, field, kr, jp?, en?, units, variants[{zh, count, keys[], jpen[{jp?, en?, count, keys[]}]}], jpen_class}]`；`id` 為 `inconsistent/<群組、欄位、KR 的雜湊>`，release 之間穩定；`meta.inconsistent` 是各分類的組數，`index.files[].inconsistent` 與單位的 `v` 標出涉及的單位

## 6. 前端

- `#/`：首頁（來源版本、進度、各狀態與檢查數量）
- `#/f/<path>?u=<key>`：檔案檢視（表格／劇本模式、語言開關、狀態篩選、「只看需要審核的單位」、上一檔／下一檔、深連結）
- `#/s?q=&lang=&re=1`：全文搜尋
- `#/r/untranslated`、`#/r/checks`、`#/r/inconsistent?mode=jpen`：審核頁（未翻譯依檔案統計；格式檢查依代碼分組；不一致的譯法列出每種譯法、單位數、與最多那種的差異，可切換「連同 JP/EN」並依分類篩選；都可依群組、文字篩選）。檔案頁的譯文下有「不一致」標籤連到該組
- 每頁 `noindex`；不使用外部 CDN；設定存在 `localStorage`

## 7. 建置與部署（`.github/workflows/pages.yml`）

- 觸發：`release`、`release-with-importllc` 成功結束後（`workflow_run`）；手動執行可指定 tag（空白為最新 release）；有人手動發布 release 時（`release: published`）
- 權限：`contents: read`、`pages: write`、`id-token: write`；`concurrency: pages`
- 一次性設定：Settings → Pages → Source 選「GitHub Actions」

## 8. 非目標

- 在網頁上修改譯文（修改仍在 Paratranz）
- 保留多個 release 的版本（只放最新部署的那一個）
- 顯示 Paratranz 的 stage（release 檔案沒有；之後若要，可在 release 時另附 stage 檔）
