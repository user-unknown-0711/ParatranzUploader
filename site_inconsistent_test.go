package main

import (
	"reflect"
	"testing"
)

func TestSiteFindInconsistent(t *testing.T) {
	s := func(v string) *string { return &v }
	unit := func(p, f, kr string, jp, en *string, zh string) siteUnit {
		return siteUnit{P: p, F: f, KR: kr, JP: jp, EN: en, ZH: s(zh), S: statusTW}
	}
	files := []siteBuilt{
		{
			summary: siteFileSummary{Path: "Skills-1.json", Group: "Skills"},
			data: siteFileData{Units: []siteUnit{
				unit("a", "desc", "방어", s("防御"), s("Guard"), "防禦"),
				unit("b", "desc", "방어", s("防御"), s("Guard"), "防禦"),
				unit("c", "name", "방어", s("防御"), s("Guard"), "格擋"),         // another field
				{P: "d", F: "desc", KR: "방어", ZH: s("Guard"), S: statusEN}, // not a translation
			}},
		},
		{
			summary: siteFileSummary{Path: "Skills-2.json", Group: "Skills"},
			data: siteFileData{Units: []siteUnit{
				unit("a", "desc", "방어", s("防御"), s("Guard"), "防禦 "),
				unit("b", "desc", "아우", s("弟"), s("Brother"), "弟弟"),
				unit("c", "desc", "아우", s("妹"), s("Sister"), "妹妹"),
			}},
		},
		{
			summary: siteFileSummary{Path: "Story.json", Group: "StoryData"},
			data: siteFileData{Units: []siteUnit{
				unit("a", "desc", "아우", nil, s("Brother"), "兄弟"), // another group
				unit("b", "content", "그", s("彼"), s("He"), "他"),
				unit("c", "content", "그", s("彼"), s("He"), "祂"),
				unit("d", "content", "그", s("彼女"), s("She"), "她"),
				unit("e", "content", "그", s("彼女"), s("She"), "他"),
			}},
		},
	}
	items := siteFindInconsistent(files)

	got := []string{}
	for _, it := range items {
		got = append(got, it.Group+"/"+it.Field+"/"+it.KR+"="+it.Class)
	}
	// The most units first.
	want := []string{"StoryData/content/그=partial", "Skills/desc/방어=same", "Skills/desc/아우=explained"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("groups = %v, want %v", got, want)
	}

	guard := items[1]
	if guard.Units != 3 || len(guard.Variants) != 2 || guard.Variants[0].ZH != "防禦" || guard.Variants[0].Count != 2 {
		t.Errorf("guard = %+v", guard)
	}
	if !reflect.DeepEqual(guard.Variants[0].Keys, []string{"Skills-1.json|a", "Skills-1.json|b"}) || deref(guard.JP) != "防御" || deref(guard.EN) != "Guard" {
		t.Errorf("guard keys = %v, jp %q, en %q", guard.Variants[0].Keys, deref(guard.JP), deref(guard.EN))
	}

	he := items[0]
	if he.Variants[0].ZH != "他" || len(he.Variants[0].JPEN) != 2 || he.Variants[0].JPEN[0].Count != 1 {
		t.Errorf("he = %+v", he.Variants)
	}

	// The units are marked, and counted in their files.
	if files[0].data.Units[0].V != guard.ID || files[0].data.Units[2].V != "" || files[0].data.Units[3].V != "" {
		t.Errorf("marks = %q %q %q", files[0].data.Units[0].V, files[0].data.Units[2].V, files[0].data.Units[3].V)
	}
	if files[0].summary.Inconsistent != 2 || files[1].summary.Inconsistent != 3 || files[2].summary.Inconsistent != 4 {
		t.Errorf("counts = %d %d %d", files[0].summary.Inconsistent, files[1].summary.Inconsistent, files[2].summary.Inconsistent)
	}
	if inconsistentID("Skills", "desc", "방어") != guard.ID || inconsistentID("Skills", "name", "방어") == guard.ID {
		t.Errorf("IDs are not by group, field and KR")
	}
}

func TestJPENClassMissingLanguage(t *testing.T) {
	s := func(v string) *string { return &v }
	// A missing JP is a value of its own, apart from an empty one.
	vs := []siteVariant{
		{ZH: "甲", JPEN: []siteJPENGroup{{EN: s("A")}}},
		{ZH: "乙", JPEN: []siteJPENGroup{{JP: s(""), EN: s("A")}}},
	}
	if got := jpenClass(vs); got != jpenExplained {
		t.Errorf("jpenClass = %s, want %s", got, jpenExplained)
	}
}
