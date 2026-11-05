package main

// The data of the pages site (docs/superpowers/specs/2026-11-05-pages-viewer-design.md):
// the TW files of a release (localize_files.zip, unzipped) next to the KR, JP
// and EN files of the assets repo, with what a reviewer has to look at.

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"go.uber.org/zap"
)

// The version of the layout and keys of the data; the page refuses another one.
const siteFormat = 1

// The statuses of a unit, in the order the page lists them.
const (
	statusTW      = "tw"      // translated
	statusEN      = "en"      // the release shows the EN text
	statusKR      = "kr"      // the release shows the KR text, which has Hangul
	statusSame    = "same"    // the release shows the KR text, which needs no translation
	statusMissing = "missing" // the release has no string for the key
)

// The check codes, in the order the review page lists them.
var siteCheckCodes = []string{"placeholder", "keyword", "tag", "hangul", "llc"}

var (
	sitePlaceholderRe = regexp.MustCompile(`\{\d+\}`)
	siteKeywordRe     = regexp.MustCompile(`\[[A-Za-z][A-Za-z0-9_]*\]`)
	// The TextMeshPro tags the game draws. After the name comes =value, a
	// space and attributes, or the end of the tag: <bold> is not <b>, and the
	// <…> that KR writes around plain words is not a tag.
	siteTagRe     = regexp.MustCompile(`(?i)<(/?)(align|allcaps|alpha|b|br|color|cspace|font|font-weight|gradient|i|indent|line-height|line-indent|link|lowercase|margin|mark|mspace|nobr|noparse|page|pos|rotate|s|size|smallcaps|space|sprite|strikethrough|style|sub|sup|u|uppercase|voffset|width|ruby)(?:[= ][^<>]*)?>`)
	siteHangulRe  = regexp.MustCompile(`[\x{1100}-\x{11FF}\x{3130}-\x{318F}\x{AC00}-\x{D7A3}]+`)
	siteLettersRe = regexp.MustCompile(`^[A-Za-z]+`)
)

// siteSource says where the data comes from; the workflow writes it.
type siteSource struct {
	Release *siteReleaseInfo `json:"release,omitempty"`
	Assets  *siteAssetsInfo  `json:"assets,omitempty"`
}

type siteReleaseInfo struct {
	Tag         string `json:"tag"`
	Name        string `json:"name"`
	URL         string `json:"url"`
	PublishedAt string `json:"published_at"`
}

type siteAssetsInfo struct {
	Repo   string `json:"repo"`
	Commit string `json:"commit"`
	// The commit is the one the release recorded, not the newest of the repo.
	Pinned bool `json:"pinned"`
}

type siteMeta struct {
	Format  int            `json:"format"`
	Source  siteSource     `json:"source"`
	Langs   []string       `json:"langs"`
	Files   int            `json:"files"`
	Units   int            `json:"units"`
	Status  map[string]int `json:"status"`
	Checks  map[string]int `json:"checks"`
	Absent  int            `json:"absent"`
	Orphans []string       `json:"orphans"`
}

type siteGroup struct {
	ID    string `json:"id"`
	Files []int  `json:"files"`
}

type siteMissing struct {
	EN int `json:"en"`
	JP int `json:"jp"`
}

type siteFileSummary struct {
	Path     string         `json:"path"`
	Group    string         `json:"group"`
	Label    string         `json:"label"`
	Speakers []string       `json:"speakers"`
	Units    int            `json:"units"`
	Status   map[string]int `json:"status"`
	Checks   int            `json:"checks"`
	Missing  siteMissing    `json:"missing"`
	Absent   bool           `json:"absent,omitempty"`
}

type siteIndex struct {
	Groups []siteGroup       `json:"groups"`
	Files  []siteFileSummary `json:"files"`
}

// siteUnit is one KR string with what the other languages and the release have for its key.
type siteUnit struct {
	P  string   `json:"p"`
	F  string   `json:"f"`
	I  int      `json:"i"`
	KR string   `json:"kr"`
	JP *string  `json:"jp,omitempty"`
	EN *string  `json:"en,omitempty"`
	ZH *string  `json:"zh,omitempty"`
	S  string   `json:"s"`
	W  []string `json:"w,omitempty"`
	// The model of the dataList element, where it has no teller: the game shows the model's name.
	M string `json:"m,omitempty"`
}

type siteFileData struct {
	Path  string     `json:"path"`
	Units []siteUnit `json:"units"`
}

// siteCheck is one check finding: a code about one KR text and its translation, with every unit that has the pair.
type siteCheck struct {
	ID    string   `json:"id"`
	Code  string   `json:"code"`
	KR    string   `json:"kr"`
	ZH    string   `json:"zh"`
	Miss  []string `json:"miss"`
	Extra []string `json:"extra"`
	Keys  []string `json:"keys"`
}

type siteFinding struct {
	code  string
	miss  []string
	extra []string
}

type siteString struct {
	key string
	val string
}

// buildSite writes the data of the site into out, which it empties first.
func buildSite(out, twRoot, assetsRoot, sourcePath string) error {
	zap.S().Infoln("Start build site data", out, "tw:", twRoot, "assets:", assetsRoot)

	if err := checkSiteOut(out); err != nil {
		return err
	}
	if st, err := os.Stat(twRoot); err != nil || !st.IsDir() {
		return fmt.Errorf("release TW directory %q is missing", twRoot)
	}
	krRoot := filepath.Join(assetsRoot, "kr")
	if st, err := os.Stat(krRoot); err != nil || !st.IsDir() {
		return fmt.Errorf("assets KR directory %q is missing", krRoot)
	}

	source := siteSource{}
	if sourcePath != "" {
		b, err := os.ReadFile(sourcePath)
		if err != nil {
			return fmt.Errorf("read %s: %w", sourcePath, err)
		}
		if err := json.Unmarshal(b, &source); err != nil {
			return fmt.Errorf("parse %s: %w", sourcePath, err)
		}
	}

	paths, err := siteKRPaths(krRoot)
	if err != nil {
		return err
	}

	type built struct {
		summary siteFileSummary
		data    siteFileData
	}
	files := []built{}
	checks := map[string]*siteCheck{}
	known := map[string]bool{}

	for _, p := range paths {
		known[p] = true
		data, summary, err := siteFile(p, twRoot, assetsRoot, checks)
		if err != nil {
			zap.S().Warnln("skip file for site", p, err)
			continue
		}
		files = append(files, built{summary, data})
	}

	sort.SliceStable(files, func(a, b int) bool {
		ga, gb := strings.ToLower(files[a].summary.Group), strings.ToLower(files[b].summary.Group)
		if ga != gb {
			return ga < gb
		}
		return naturalLess(files[a].summary.Path, files[b].summary.Path)
	})

	orphans, err := siteOrphans(twRoot, known)
	if err != nil {
		return err
	}

	meta := siteMeta{
		Format:  siteFormat,
		Source:  source,
		Langs:   []string{"kr", "jp", "en", "zh"},
		Status:  map[string]int{},
		Checks:  map[string]int{},
		Orphans: orphans,
	}
	for _, c := range siteCheckCodes {
		meta.Checks[c] = 0
	}

	index := siteIndex{Groups: []siteGroup{}, Files: []siteFileSummary{}}
	searchKeys := [][2]any{}
	corpus := map[string][]string{"kr": {}, "jp": {}, "en": {}, "zh": {}}

	for n, f := range files {
		index.Files = append(index.Files, f.summary)
		if g := len(index.Groups); g == 0 || index.Groups[g-1].ID != f.summary.Group {
			index.Groups = append(index.Groups, siteGroup{ID: f.summary.Group, Files: []int{}})
		}
		g := &index.Groups[len(index.Groups)-1]
		g.Files = append(g.Files, n)

		meta.Units += f.summary.Units
		if f.summary.Absent {
			meta.Absent++
		}
		for s, c := range f.summary.Status {
			meta.Status[s] += c
		}
		for _, u := range f.data.Units {
			if u.S == statusSame {
				continue
			}
			searchKeys = append(searchKeys, [2]any{n, u.P})
			corpus["kr"] = append(corpus["kr"], u.KR)
			corpus["jp"] = append(corpus["jp"], deref(u.JP))
			corpus["en"] = append(corpus["en"], deref(u.EN))
			corpus["zh"] = append(corpus["zh"], deref(u.ZH))
		}
	}
	meta.Files = len(index.Files)

	items := []*siteCheck{}
	for _, c := range checks {
		items = append(items, c)
	}
	order := map[string]int{}
	for i, c := range siteCheckCodes {
		order[c] = i
	}
	// The place of each unit in the order of the index, so that findings follow the files.
	position := map[string]int{}
	for _, f := range files {
		for _, u := range f.data.Units {
			position[f.summary.Path+"|"+u.P] = len(position)
		}
	}
	sort.Slice(items, func(a, b int) bool {
		if items[a].Code != items[b].Code {
			return order[items[a].Code] < order[items[b].Code]
		}
		pa, pb := position[items[a].Keys[0]], position[items[b].Keys[0]]
		if pa != pb {
			return pa < pb
		}
		return items[a].ID < items[b].ID
	})
	for _, c := range items {
		meta.Checks[c.Code]++
	}

	if err := os.RemoveAll(out); err != nil {
		return err
	}
	write := func(rel string, v any) error {
		full := filepath.Join(out, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(full), os.ModePerm); err != nil {
			return err
		}
		b, err := JSONMarshal(v)
		if err != nil {
			return err
		}
		return os.WriteFile(full, b, 0o644)
	}

	if err := write("meta.json", meta); err != nil {
		return err
	}
	if err := write("index.json", index); err != nil {
		return err
	}
	for _, f := range files {
		if err := write("files/"+f.data.Path, f.data); err != nil {
			return err
		}
	}
	if err := write("search/keys.json", searchKeys); err != nil {
		return err
	}
	for lang, texts := range corpus {
		if err := write("search/"+lang+".json", texts); err != nil {
			return err
		}
	}
	if err := write("review/checks.json", map[string]any{"items": items}); err != nil {
		return err
	}
	if err := write("models.json", siteModels(twRoot, assetsRoot)); err != nil {
		return err
	}

	zap.S().Infow("site data written", "files", meta.Files, "units", meta.Units, "status", meta.Status, "checks", meta.Checks, "absent", meta.Absent, "orphans", len(meta.Orphans))
	return nil
}

// checkSiteOut refuses an output directory whose removal would take more than the data with it.
func checkSiteOut(out string) error {
	clean := filepath.Clean(out)
	if out == "" || clean == "." || clean == ".." || clean == string(filepath.Separator) || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return fmt.Errorf("refuse to use %q as the site output directory", out)
	}
	if _, err := os.Stat(filepath.Join(clean, ".git")); err == nil {
		return fmt.Errorf("refuse to use %q as the site output directory: it holds .git", out)
	}
	return nil
}

// siteKRPaths lists the KR files of the assets repo as the paths of the release ("StoryData/S101A.json").
func siteKRPaths(krRoot string) ([]string, error) {
	paths := []string{}
	err := filepath.WalkDir(krRoot, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		base := d.Name()
		if !strings.HasPrefix(base, "KR_") || !strings.HasSuffix(base, ".json") {
			return nil
		}
		rel, err := filepath.Rel(krRoot, filepath.Dir(p))
		if err != nil {
			return err
		}
		paths = append(paths, path.Join(filepath.ToSlash(rel), strings.TrimPrefix(base, "KR_")))
		return nil
	})
	return paths, err
}

// siteOrphans lists the release files that have no KR file.
func siteOrphans(twRoot string, known map[string]bool) ([]string, error) {
	orphans := []string{}
	err := filepath.WalkDir(twRoot, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(d.Name(), ".json") {
			return nil
		}
		rel, err := filepath.Rel(twRoot, p)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if !known[rel] {
			orphans = append(orphans, rel)
		}
		return nil
	})
	sort.Slice(orphans, func(a, b int) bool { return naturalLess(orphans[a], orphans[b]) })
	return orphans, err
}

// siteFile builds one file: its units in the order of the KR file, and its summary for the index.
func siteFile(p, twRoot, assetsRoot string, checks map[string]*siteCheck) (siteFileData, siteFileSummary, error) {
	dir, name := path.Split(p)
	krRaw, err := os.ReadFile(filepath.Join(assetsRoot, "kr", filepath.FromSlash(dir), "KR_"+name))
	if err != nil {
		return siteFileData{}, siteFileSummary{}, err
	}
	krPM, err := parsePMData(krRaw)
	if err != nil {
		return siteFileData{}, siteFileSummary{}, fmt.Errorf("KR: %w", err)
	}
	strs, err := orderedStrings(krRaw)
	if err != nil {
		return siteFileData{}, siteFileSummary{}, fmt.Errorf("KR: %w", err)
	}

	other := func(file string) (map[string]string, bool) {
		raw, err := os.ReadFile(file)
		if err != nil {
			if !errors.Is(err, os.ErrNotExist) {
				zap.S().Warnln("read fail", file, err)
			}
			return nil, false
		}
		pm, err := parsePMData(raw)
		if err != nil {
			zap.S().Warnln("parse fail", file, err)
			return nil, false
		}
		alignOrderByID(krPM, pm, file)
		return pm.getTranMap(), true
	}

	enMap, _ := other(filepath.Join(assetsRoot, "en", filepath.FromSlash(dir), "EN_"+name))
	jpMap, _ := other(filepath.Join(assetsRoot, "jp", filepath.FromSlash(dir), "JP_"+name))
	twMap, hasTW := other(filepath.Join(twRoot, filepath.FromSlash(dir), name))

	data := siteFileData{Path: p, Units: []siteUnit{}}
	summary := siteFileSummary{
		Path:     p,
		Group:    siteGroupOf(p),
		Speakers: []string{},
		Status:   map[string]int{},
		Absent:   !hasTW,
	}
	story := strings.HasPrefix(p, "StoryData/")
	speakers := map[string]bool{}

	// The elements that name a model and no teller.
	models := map[int]string{}
	for i, item := range krPM.DataList {
		model, _ := item["model"].(string)
		teller, _ := item["teller"].(string)
		if strings.TrimSpace(model) != "" && strings.TrimSpace(teller) == "" {
			models[i] = model
		}
	}

	for _, s := range strs {
		segs := strings.Split(s.key, "->")
		if len(segs) < 2 || segs[0] != "dataList" || strings.TrimSpace(s.val) == "" || siteSkipKey(segs[2:]) {
			continue
		}
		u := siteUnit{P: s.key, F: siteField(segs), I: -1, KR: s.val}
		if i, err := strconv.Atoi(segs[1]); err == nil {
			u.I = i
			u.M = models[i]
		}
		if v, has := enMap[s.key]; has {
			u.EN = ptr(v)
		} else {
			summary.Missing.EN++
		}
		if v, has := jpMap[s.key]; has {
			u.JP = ptr(v)
		} else {
			summary.Missing.JP++
		}
		if v, has := twMap[s.key]; has {
			u.ZH = ptr(v)
		}
		u.S = siteStatus(u.KR, u.EN, u.ZH)
		if u.S == statusTW {
			for _, f := range siteChecks(u.KR, *u.ZH) {
				id := siteCheckID(f.code, u.KR, *u.ZH)
				c, has := checks[id]
				if !has {
					c = &siteCheck{ID: id, Code: f.code, KR: u.KR, ZH: *u.ZH, Miss: f.miss, Extra: f.extra, Keys: []string{}}
					checks[id] = c
				}
				c.Keys = append(c.Keys, p+"|"+u.P)
				u.W = append(u.W, id)
			}
		}
		if len(u.W) > 0 {
			summary.Checks++
		}
		summary.Status[u.S]++

		shown := u.KR
		if u.ZH != nil && *u.ZH != "" {
			shown = *u.ZH
		}
		if story && u.F == "place" && summary.Label == "" {
			summary.Label = shown
		}
		if story && u.F == "teller" && !speakers[shown] && len(summary.Speakers) < 20 {
			speakers[shown] = true
			summary.Speakers = append(summary.Speakers, shown)
		}
		data.Units = append(data.Units, u)
	}
	summary.Units = len(data.Units)
	return data, summary, nil
}

// siteModelFile is the table of the names the game shows for the model of a story line.
const siteModelFile = "ScenarioModelCodes-AutoCreated.json"

// siteModels gives the name of each model in each language: the speaker of a story line that has no teller.
func siteModels(twRoot, assetsRoot string) map[string]map[string]string {
	out := map[string]map[string]string{}
	files := map[string]string{
		"kr": filepath.Join(assetsRoot, "kr", "KR_"+siteModelFile),
		"jp": filepath.Join(assetsRoot, "jp", "JP_"+siteModelFile),
		"en": filepath.Join(assetsRoot, "en", "EN_"+siteModelFile),
		"zh": filepath.Join(twRoot, siteModelFile),
	}
	for lang, file := range files {
		raw, err := os.ReadFile(file)
		if err != nil {
			continue
		}
		pm, err := parsePMData(raw)
		if err != nil {
			zap.S().Warnln("parse fail", file, err)
			continue
		}
		for _, item := range pm.DataList {
			id, _ := item["id"].(string)
			name, _ := item["name"].(string)
			if id == "" || name == "" {
				continue
			}
			if out[id] == nil {
				out[id] = map[string]string{}
			}
			out[id][lang] = name
		}
	}
	return out
}

// parsePMData reads a game file; unlike getPMData, a file that is not valid is an error, not the end of the run.
func parsePMData(raw []byte) (*PMData, error) {
	pm := PMData{}
	if err := json.Unmarshal(bytes.TrimPrefix(raw, []byte{0xEF, 0xBB, 0xBF}), &pm); err != nil {
		return nil, err
	}
	return &pm, nil
}

// orderedStrings gives every string of a game file with its key ("dataList->0->content"), in the order of the file.
func orderedStrings(raw []byte) ([]siteString, error) {
	dec := json.NewDecoder(bytes.NewReader(bytes.TrimPrefix(raw, []byte{0xEF, 0xBB, 0xBF})))
	dec.UseNumber()
	out := []siteString{}
	var walk func(keys []string) error
	walk = func(keys []string) error {
		tok, err := dec.Token()
		if err != nil {
			return err
		}
		switch t := tok.(type) {
		case json.Delim:
			switch t {
			case '{':
				for dec.More() {
					kt, err := dec.Token()
					if err != nil {
						return err
					}
					k, ok := kt.(string)
					if !ok {
						return fmt.Errorf("object key is %v", kt)
					}
					if err := walk(append(keys, k)); err != nil {
						return err
					}
				}
			case '[':
				for i := 0; dec.More(); i++ {
					if err := walk(append(keys, strconv.Itoa(i))); err != nil {
						return err
					}
				}
			}
			_, err := dec.Token() // the closing delimiter
			return err
		case string:
			if len(keys) > 0 {
				out = append(out, siteString{key: strings.Join(keys, "->"), val: t})
			}
		}
		return nil
	}
	if err := walk(nil); err != nil {
		return nil, err
	}
	return out, nil
}

// siteSkipKey says whether a key is one that the export never translates: an id or a model, at any depth.
func siteSkipKey(segs []string) bool {
	for _, s := range segs {
		if s == "id" || s == "model" {
			return true
		}
	}
	return false
}

// siteField is the name of the field of a key: its last segment that is not a number.
func siteField(segs []string) string {
	for i := len(segs) - 1; i >= 2; i-- {
		if _, err := strconv.Atoi(segs[i]); err != nil {
			return segs[i]
		}
	}
	return segs[len(segs)-1]
}

// siteGroupOf is the directory of a file, or for a file at the top the letters its name starts with.
func siteGroupOf(p string) string {
	if dir := path.Dir(p); dir != "." {
		return dir
	}
	name := strings.TrimSuffix(p, ".json")
	if m := siteLettersRe.FindString(name); m != "" {
		return m
	}
	return name
}

func siteStatus(kr string, en, zh *string) string {
	if zh == nil || *zh == "" {
		return statusMissing
	}
	z := *zh
	if en != nil && z == *en && *en != kr && hasLatin(*en) {
		return statusEN
	}
	if z == kr {
		if siteHangulRe.MatchString(kr) {
			return statusKR
		}
		return statusSame
	}
	return statusTW
}

// siteChecks finds what in a translation does not match its KR text.
func siteChecks(kr, zh string) []siteFinding {
	out := []siteFinding{}
	if miss, extra := setDiff(sitePlaceholderRe.FindAllString(kr, -1), sitePlaceholderRe.FindAllString(zh, -1)); len(miss)+len(extra) > 0 {
		out = append(out, siteFinding{"placeholder", miss, extra})
	}
	if miss, extra := setDiff(siteKeywords(kr), siteKeywords(zh)); len(miss)+len(extra) > 0 {
		out = append(out, siteFinding{"keyword", miss, extra})
	}
	if miss, extra := tagDiff(kr, zh); len(miss)+len(extra) > 0 {
		out = append(out, siteFinding{"tag", miss, extra})
	}
	if found := siteHangulRe.FindAllString(stripSiteTags(zh), -1); len(found) > 0 {
		_, extra := setDiff(nil, found)
		if len(extra) > 5 {
			extra = extra[:5]
		}
		out = append(out, siteFinding{"hangul", []string{}, extra})
	}
	if strings.HasPrefix(zh, "[LLC]") {
		out = append(out, siteFinding{"llc", []string{}, []string{"[LLC]"}})
	}
	return out
}

func siteKeywords(s string) []string {
	out := []string{}
	for _, k := range siteKeywordRe.FindAllString(s, -1) {
		if k != "[LLC]" {
			out = append(out, k)
		}
	}
	return out
}

// stripSiteTags removes the tags, so that a <ruby=…> or an attribute is not read as text.
func stripSiteTags(s string) string {
	return siteTagRe.ReplaceAllString(s, "")
}

// tagDiff compares the tags of two strings: the names each uses, and for each name the
// opening tags left unclosed. miss and extra are what the translation lacks and has more of.
// A <ruby> reading and a <br> are the translator's to add or leave out.
func tagDiff(kr, zh string) (miss, extra []string) {
	type count struct{ open, close int }
	tally := func(s string) map[string]*count {
		m := map[string]*count{}
		for _, g := range siteTagRe.FindAllStringSubmatch(s, -1) {
			name := strings.ToLower(g[2])
			if name == "ruby" || name == "br" {
				continue
			}
			c := m[name]
			if c == nil {
				c = &count{}
				m[name] = c
			}
			if g[1] == "/" {
				c.close++
			} else {
				c.open++
			}
		}
		return m
	}
	a, b := tally(kr), tally(zh)
	miss, extra = []string{}, []string{}
	names := map[string]bool{}
	for n := range a {
		names[n] = true
	}
	for n := range b {
		names[n] = true
	}
	sorted := make([]string, 0, len(names))
	for n := range names {
		sorted = append(sorted, n)
	}
	sort.Strings(sorted)
	for _, n := range sorted {
		ca, cb := a[n], b[n]
		switch {
		case cb == nil:
			miss = append(miss, "<"+n+">")
		case ca == nil:
			extra = append(extra, "<"+n+">")
		default:
			// A translation that closes what KR leaves open is not at fault: only an
			// opening tag left unclosed, or a closing tag with nothing to close, is.
			left := cb.open - cb.close
			d := left - (ca.open - ca.close)
			if d > 0 && left > 0 {
				miss = append(miss, "</"+n+">")
			} else if d < 0 && left < 0 {
				extra = append(extra, "</"+n+">")
			}
		}
	}
	return miss, extra
}

// setDiff gives the distinct items of a not in b, and of b not in a, each in the order first seen.
func setDiff(a, b []string) (onlyA, onlyB []string) {
	inA, inB := map[string]bool{}, map[string]bool{}
	for _, x := range a {
		inA[x] = true
	}
	for _, x := range b {
		inB[x] = true
	}
	onlyA, onlyB = []string{}, []string{}
	seen := map[string]bool{}
	for _, x := range a {
		if !inB[x] && !seen[x] {
			seen[x] = true
			onlyA = append(onlyA, x)
		}
	}
	for _, x := range b {
		if !inA[x] && !seen[x] {
			seen[x] = true
			onlyB = append(onlyB, x)
		}
	}
	return onlyA, onlyB
}

// siteCheckID names a finding by its code and its pair of texts, so that it is the same from one build to the next.
func siteCheckID(code, kr, zh string) string {
	h := fnv.New64a()
	h.Write([]byte(kr))
	h.Write([]byte{0})
	h.Write([]byte(zh))
	return fmt.Sprintf("%s/%012x", code, h.Sum64()&0xffffffffffff)
}

func hasLatin(s string) bool {
	for _, r := range s {
		if r < unicode.MaxASCII && unicode.IsLetter(r) {
			return true
		}
	}
	return false
}

// naturalLess orders names with the numbers in them by value: S2 before S10.
func naturalLess(a, b string) bool {
	ca, cb := naturalChunks(strings.ToLower(a)), naturalChunks(strings.ToLower(b))
	for i := 0; i < len(ca) && i < len(cb); i++ {
		x, y := ca[i], cb[i]
		if x == y {
			continue
		}
		dx, dy := x[0] >= '0' && x[0] <= '9', y[0] >= '0' && y[0] <= '9'
		if dx && dy {
			tx, ty := strings.TrimLeft(x, "0"), strings.TrimLeft(y, "0")
			if len(tx) != len(ty) {
				return len(tx) < len(ty)
			}
			if tx != ty {
				return tx < ty
			}
			return len(x) < len(y)
		}
		return x < y
	}
	if len(ca) != len(cb) {
		return len(ca) < len(cb)
	}
	return a < b
}

func naturalChunks(s string) []string {
	out := []string{}
	start := 0
	for i := 1; i <= len(s); i++ {
		if i == len(s) || isDigit(s[i]) != isDigit(s[start]) {
			out = append(out, s[start:i])
			start = i
		}
	}
	return out
}

func isDigit(c byte) bool { return c >= '0' && c <= '9' }

func ptr(s string) *string { return &s }

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
