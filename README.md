# Limbus Company Mandarin Language Translation

## Introduction

This repository aims to automate the uploading of Limbus Company's custom language support files to [ParaTranz](https://paratranz.cn/), as well as the downloading and packaging of the proofread localized files into [Releases](https://github.com/user-unknown-0711/ParatranzUploader/releases/latest).

Installation instructions are available [here](./docs/install-custom-lt.md).

## Translation viewer (GitHub Pages)

After every release, `.github/workflows/pages.yml` publishes a static site (`https://<owner>.github.io/<repo>/`) that puts the TW text of the release next to the KR, JP and EN texts of the assets repo, and shows what still needs a reviewer:

- **Viewer**: every file of the assets repo, one row per string (table), or one passage per line for stories (script, with the speaker the game shows); a deep link per string; full-text search (substring or regular expression) in any language. Hovering the field name shows the Paratranz key (`dataList->0->content`).
- **Review** (`#/r`): untranslated strings by file (still English, still Korean, or missing from the release), and format checks of the translations against KR: `{0}` placeholders, `[Keyword]` codes, TextMeshPro tags, leftover Hangul, and `[LLC]` imports. Each item links to its row.

How it is built (design: [`docs/superpowers/specs/2026-11-05-pages-viewer-design.md`](./docs/superpowers/specs/2026-11-05-pages-viewer-design.md)):

1. `pages.yml` runs when `release` or `release-with-importllc` ends green, when a release is published by hand, or by hand (`tag` input; empty is the latest release).
2. It downloads the release's `localize_files.zip` and checks out `vars.ASSETS_REPO` at the commit the release recorded (the release workflows add a hidden `<!-- assets-commit: … -->` line to the release notes; an older release without it uses the default branch, and the site says the texts may be newer than the release).
3. `./ParatranzUploader -site site/public/data -site-tw <unzipped release> -site-assets Assets -site-source <source.json>` writes the JSON of the site; `site/` (Preact + Vite) is built and deployed with `actions/deploy-pages`. The data is not committed to any branch.

One-time setup: Settings → Pages → Source: **GitHub Actions**. The workflow needs no secrets; it uses `vars.ASSETS_REPO` like the release workflows.

Local preview:

```sh
go build
mkdir -p release/tw && unzip -o localize_files.zip -d release/tw   # the release asset
./ParatranzUploader -site site/public/data -site-tw release/tw -site-assets Assets
cd site && npm ci && npm run build && npm run preview
```

Checks before committing: `go vet ./... && go test ./...`, and for `site/`: `cd site && npm ci && npm run typecheck && npm test && npm run build`. The site's tests read `site/fixtures/data`, which `go test` requires to be the output of `-site` for `site/fixtures/source` (the command to regenerate it is in `site_test.go`).

## License

1. All code in the main branch is licensed under the **GNU General Public License v3.0**. You can find the full license text [here](https://www.gnu.org/licenses/gpl-3.0.txt).

2. All release JSON content is licensed under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0)**. You can find the full license text [here](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode).

3. The font SarasaGothicTC-Bold.ttf is developed and distributed by [be5invis](https://github.com/be5invis/Sarasa-Gothic) under the SIL Open Font License.

## Acknowledgements

This project references and builds upon the translation work of [Localize Limbus Company (都市零协会汉化组)](https://github.com/LocalizeLimbusCompany) and [Limbus Traditional Mandarin (LTM繁體中文漢化組)](https://github.com/LimbusTraditionalMandarin). We sincerely thank both communities for their tremendous efforts in localizing Limbus Company, making the game accessible to a wider audience of Chinese-speaking players.

The translation viewer site (`site/`) is adapted from the GitHub Pages viewer of [tool-jx3/limbus-translate](https://github.com/tool-jx3/limbus-translate) (GPL-3.0): its TextMeshPro text rendering, full-text search worker, virtual scrolling and script layout.
