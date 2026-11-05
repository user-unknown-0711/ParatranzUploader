package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

func writeFixture(t *testing.T, root, rel, content string) {
	t.Helper()
	full := filepath.Join(root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// siteFixture is a small assets repo and release: a skill file whose EN and JP are in another
// order than KR, a story file the release does not have, and a release file with no KR.
func siteFixture(t *testing.T) (twRoot, assetsRoot string) {
	t.Helper()
	root := t.TempDir()
	assetsRoot = filepath.Join(root, "Assets")
	twRoot = filepath.Join(root, "tw")

	// KR keeps its key order: name before desc. The BOM is the one some assets have.
	writeFixture(t, assetsRoot, "kr/KR_Skills-2.json", "\xEF\xBB\xBF"+`{"dataList":[
		{"id":1,"name":"베기","desc":"[Burn] {0} 피해 <color=#ffffff>강함</color>"},
		{"id":2,"name":"찌르기","desc":"123","model":"모델"},
		{"id":3,"name":"막기","desc":"방어 {0}"}
	]}`)
	writeFixture(t, assetsRoot, "en/EN_Skills-2.json", `{"dataList":[
		{"id":3,"name":"Block","desc":"Block {0}"},
		{"id":1,"name":"Slash","desc":"[Burn] {0} damage <color=#ffffff>strong</color>"},
		{"id":2,"name":"Stab","desc":"123"}
	]}`)
	writeFixture(t, assetsRoot, "jp/JP_Skills-2.json", `{"dataList":[
		{"id":2,"name":"突き","desc":"123"},
		{"id":1,"name":"斬り","desc":"[Burn] {0} ダメージ <color=#ffffff>強い</color>"}
	]}`)
	writeFixture(t, assetsRoot, "kr/KR_Skills-10.json", `{"dataList":[{"id":1,"name":"열"}]}`)
	writeFixture(t, assetsRoot, "kr/StoryData/KR_S1.json", `{"dataList":[
		{"id":0,"place":"4구","content":"안녕"},
		{"id":1,"model":"단테","teller":"단테","content":"째깍"}
	]}`)

	// The release: sorted keys, as the export writes them, and the elements in KR's order.
	writeFixture(t, twRoot, "Skills-2.json", `{"dataList":[
		{"desc":"[Burn] 造成傷害 <color=#ffffff>強</color>","id":1,"name":"斬擊"},
		{"desc":"123","id":2,"model":"모델","name":"Stab"},
		{"desc":"防禦 {0}","id":3,"name":"막기"}
	]}`)
	writeFixture(t, twRoot, "Skills-10.json", `{"dataList":[{"id":1,"name":"十"}]}`)
	writeFixture(t, twRoot, "Old.json", `{"dataList":[]}`)
	return twRoot, assetsRoot
}

func readJSON(t *testing.T, file string, v any) {
	t.Helper()
	b, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, v); err != nil {
		t.Fatalf("%s: %v", file, err)
	}
}

func TestBuildSite(t *testing.T) {
	twRoot, assetsRoot := siteFixture(t)
	out := filepath.Join(t.TempDir(), "data")
	source := filepath.Join(t.TempDir(), "source.json")
	writeFixture(t, filepath.Dir(source), "source.json", `{"release":{"tag":"123","name":"Release","url":"https://example.com/r/123","published_at":"2026-11-05T00:00:00Z"},"assets":{"repo":"o/Assets","commit":"abc","pinned":true}}`)

	// A file left from an older build is gone afterwards.
	writeFixture(t, out, "files/Stale.json", "{}")

	if err := buildSite(out, twRoot, assetsRoot, source); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(out, "files/Stale.json")); !os.IsNotExist(err) {
		t.Errorf("stale file kept: %v", err)
	}

	var meta siteMeta
	readJSON(t, filepath.Join(out, "meta.json"), &meta)
	if meta.Format != siteFormat || meta.Files != 3 || meta.Units != 11 || meta.Absent != 1 {
		t.Errorf("meta = %+v", meta)
	}
	if meta.Source.Release == nil || meta.Source.Release.Tag != "123" || meta.Source.Assets == nil || !meta.Source.Assets.Pinned {
		t.Errorf("meta.source = %+v", meta.Source)
	}
	// Skills-2: three translated, one EN, one KR, one the same; Skills-10: one translated;
	// S1 (not in the release): place, teller and two contents, the model left out.
	wantStatus := map[string]int{"tw": 4, "en": 1, "kr": 1, "same": 1, "missing": 4}
	if !reflect.DeepEqual(meta.Status, wantStatus) {
		t.Errorf("status = %v, want %v", meta.Status, wantStatus)
	}
	if !reflect.DeepEqual(meta.Orphans, []string{"Old.json"}) {
		t.Errorf("orphans = %v", meta.Orphans)
	}

	var index siteIndex
	readJSON(t, filepath.Join(out, "index.json"), &index)
	paths := []string{}
	for _, f := range index.Files {
		paths = append(paths, f.Path)
	}
	// Groups by name, files by natural order: Skills-2 before Skills-10.
	if want := []string{"Skills-2.json", "Skills-10.json", "StoryData/S1.json"}; !reflect.DeepEqual(paths, want) {
		t.Errorf("files = %v, want %v", paths, want)
	}
	if want := []siteGroup{{ID: "Skills", Files: []int{0, 1}}, {ID: "StoryData", Files: []int{2}}}; !reflect.DeepEqual(index.Groups, want) {
		t.Errorf("groups = %v, want %v", index.Groups, want)
	}
	story := index.Files[2]
	if !story.Absent || story.Label != "4구" || !reflect.DeepEqual(story.Speakers, []string{"단테"}) || story.Missing.EN != 4 {
		t.Errorf("story summary = %+v", story)
	}
	if skills := index.Files[0]; skills.Missing.JP != 2 || skills.Checks != 1 {
		t.Errorf("skills summary = %+v", skills)
	}

	var file siteFileData
	readJSON(t, filepath.Join(out, "files/Skills-2.json"), &file)
	got := []string{}
	for _, u := range file.Units {
		got = append(got, u.P+"="+u.S)
	}
	want := []string{
		"dataList->0->name=tw",
		"dataList->0->desc=tw",
		"dataList->1->name=en",
		"dataList->1->desc=same",
		"dataList->2->name=kr",
		"dataList->2->desc=tw",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("units = %v, want %v", got, want)
	}
	desc := file.Units[1]
	if desc.F != "desc" || desc.I != 0 || deref(desc.EN) != "[Burn] {0} damage <color=#ffffff>strong</color>" || deref(desc.JP) != "[Burn] {0} ダメージ <color=#ffffff>強い</color>" {
		t.Errorf("EN and JP are not aligned by id: %+v", desc)
	}
	if file.Units[4].JP != nil {
		t.Errorf("JP has no id 3, got %q", deref(file.Units[4].JP))
	}
	if len(desc.W) != 1 || desc.W[0][:len("placeholder/")] != "placeholder/" {
		t.Errorf("desc checks = %v", desc.W)
	}

	var checks struct{ Items []siteCheck }
	readJSON(t, filepath.Join(out, "review/checks.json"), &checks)
	if len(checks.Items) != 1 {
		t.Fatalf("checks = %+v", checks.Items)
	}
	if c := checks.Items[0]; c.Code != "placeholder" || !reflect.DeepEqual(c.Miss, []string{"{0}"}) || !reflect.DeepEqual(c.Keys, []string{"Skills-2.json|dataList->0->desc"}) || c.ID != desc.W[0] {
		t.Errorf("check = %+v", c)
	}

	var keys [][2]any
	readJSON(t, filepath.Join(out, "search/keys.json"), &keys)
	for _, lang := range []string{"kr", "jp", "en", "zh"} {
		var texts []string
		readJSON(t, filepath.Join(out, "search", lang+".json"), &texts)
		if len(texts) != len(keys) {
			t.Errorf("search/%s.json has %d strings, keys.json %d", lang, len(texts), len(keys))
		}
	}
	// The "same" unit is not searched.
	if len(keys) != meta.Units-meta.Status["same"] {
		t.Errorf("keys = %d", len(keys))
	}
}

// The tests of site/ read site/fixtures/data; it must be what -site makes of site/fixtures/source.
// After a change to the data, regenerate it with:
//
//	go run . -site site/fixtures/data -site-tw site/fixtures/source/tw -site-assets site/fixtures/source/Assets -site-source site/fixtures/source/source.json
func TestSiteFixturesUpToDate(t *testing.T) {
	src := filepath.Join("site", "fixtures", "source")
	out := filepath.Join(t.TempDir(), "data")
	if err := buildSite(out, filepath.Join(src, "tw"), filepath.Join(src, "Assets"), filepath.Join(src, "source.json")); err != nil {
		t.Fatal(err)
	}
	want := filepath.Join("site", "fixtures", "data")
	seen := map[string]bool{}
	filepath.Walk(out, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(out, p)
		seen[rel] = true
		got, _ := os.ReadFile(p)
		committed, err := os.ReadFile(filepath.Join(want, rel))
		if err != nil || !bytes.Equal(got, committed) {
			t.Errorf("site/fixtures/data/%s is not what -site makes; regenerate it", filepath.ToSlash(rel))
		}
		return nil
	})
	filepath.Walk(want, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(want, p)
		if !seen[rel] {
			t.Errorf("site/fixtures/data/%s is not made by -site any more; remove it", filepath.ToSlash(rel))
		}
		return nil
	})
}

func TestBuildSiteIsDeterministic(t *testing.T) {
	twRoot, assetsRoot := siteFixture(t)
	dump := func() map[string][]byte {
		out := filepath.Join(t.TempDir(), "data")
		if err := buildSite(out, twRoot, assetsRoot, ""); err != nil {
			t.Fatal(err)
		}
		m := map[string][]byte{}
		filepath.Walk(out, func(p string, info os.FileInfo, err error) error {
			if err == nil && !info.IsDir() {
				rel, _ := filepath.Rel(out, p)
				m[rel], _ = os.ReadFile(p)
			}
			return nil
		})
		return m
	}
	a, b := dump(), dump()
	if len(a) == 0 || len(a) != len(b) {
		t.Fatalf("outputs differ in files: %d, %d", len(a), len(b))
	}
	names := []string{}
	for k := range a {
		names = append(names, k)
	}
	sort.Strings(names)
	for _, k := range names {
		if !bytes.Equal(a[k], b[k]) {
			t.Errorf("%s differs between two builds", k)
		}
	}
}

func TestCheckSiteOut(t *testing.T) {
	repo := t.TempDir()
	os.Mkdir(filepath.Join(repo, ".git"), 0o755)
	for _, bad := range []string{"", ".", "..", "/", "../x", repo} {
		if err := checkSiteOut(bad); err == nil {
			t.Errorf("checkSiteOut(%q) accepted", bad)
		}
	}
	if err := checkSiteOut("site/public/data"); err != nil {
		t.Errorf("checkSiteOut(site/public/data) = %v", err)
	}
}

func TestSiteChecks(t *testing.T) {
	codes := func(kr, zh string) []string {
		out := []string{}
		for _, f := range siteChecks(kr, zh) {
			out = append(out, f.code)
		}
		return out
	}
	cases := []struct {
		kr, zh string
		want   []string
	}{
		{"{0} 피해", "造成{0}傷害", []string{}},
		{"{0} 피해 {0}", "造成{0}傷害", []string{}},
		{"{0} 피해", "造成傷害", []string{"placeholder"}},
		{"[Burn] 부여", "施加燒傷", []string{"keyword"}},
		{"[Burn] 위력, [Burn] 횟수", "[Burn] 強度", []string{}},
		{"<color=#fff>강</color>", "強", []string{"tag"}},
		{"<color=#fff>강</color>", "<color=#fff>強", []string{"tag"}},
		{"<color=#fff>강", "<color=#fff>強", []string{}},
		{"<color=#a>[{0}]<color=#a> 감소</color>", "<color=#a>[{0}] 減少</color>", []string{}},
		{"<b>강</b>", "強</b>", []string{"tag"}},
		{"<혈귀> 등장", "<血鬼> 登場", []string{}},
		{"리우", "<ruby=劉>柳</ruby>", []string{}},
		{"하나 협회", "하나協會", []string{"hangul"}},
		{"번역", "[LLC]翻譯", []string{"llc"}},
	}
	for _, c := range cases {
		if got := codes(c.kr, c.zh); !reflect.DeepEqual(got, c.want) {
			t.Errorf("siteChecks(%q, %q) = %v, want %v", c.kr, c.zh, got, c.want)
		}
	}
}

func TestSiteStatus(t *testing.T) {
	s := func(v string) *string { return &v }
	cases := []struct {
		kr     string
		en, zh *string
		want   string
	}{
		{"안녕", s("Hello"), s("你好"), statusTW},
		{"안녕", s("Hello"), s("Hello"), statusEN},
		{"안녕", nil, s("안녕"), statusKR},
		{"123", s("123"), s("123"), statusSame},
		{"...", s("..."), s("..."), statusSame},
		{"안녕", s("Hello"), nil, statusMissing},
		{"안녕", s("Hello"), s(""), statusMissing},
	}
	for _, c := range cases {
		if got := siteStatus(c.kr, c.en, c.zh); got != c.want {
			t.Errorf("siteStatus(%q, %v, %v) = %s, want %s", c.kr, deref(c.en), deref(c.zh), got, c.want)
		}
	}
}

func TestNaturalLess(t *testing.T) {
	names := []string{"S10.json", "S2.json", "s1.json", "A.json", "S02.json"}
	sort.Slice(names, func(a, b int) bool { return naturalLess(names[a], names[b]) })
	want := []string{"A.json", "s1.json", "S2.json", "S02.json", "S10.json"}
	if !reflect.DeepEqual(names, want) {
		t.Errorf("sorted = %v, want %v", names, want)
	}
}

func TestOrderedStrings(t *testing.T) {
	got, err := orderedStrings([]byte(`{"dataList":[{"z":"1","a":{"k":["x",2,"y"]},"n":3}]}`))
	if err != nil {
		t.Fatal(err)
	}
	want := []siteString{{"dataList->0->z", "1"}, {"dataList->0->a->k->0", "x"}, {"dataList->0->a->k->2", "y"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("orderedStrings = %v, want %v", got, want)
	}
}
