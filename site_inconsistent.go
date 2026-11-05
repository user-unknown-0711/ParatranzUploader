package main

// Inconsistent translations: one KR text of one group of files and one field that the
// release translates in more than one way. As on the review page of tool-jx3/limbus-translate,
// each way lists its units by their JP and EN, since KR is often vaguer than JP and EN and a
// difference may be right ("중지 작은 아우": JP/EN "Brother" or "Sister").

import (
	"fmt"
	"hash/fnv"
	"sort"
)

// Whether JP and EN tell the translations of a group apart.
const (
	jpenSame      = "same"      // every unit has the same JP and EN: the group really is inconsistent
	jpenExplained = "explained" // more than one JP/EN pair, each with one translation
	jpenPartial   = "partial"   // some JP/EN pair has two translations or more
)

type siteInconsistent struct {
	ID    string `json:"id"`
	Group string `json:"group"`
	Field string `json:"field"`
	KR    string `json:"kr"`
	// The JP and EN of the first unit of the most used translation.
	JP       *string       `json:"jp,omitempty"`
	EN       *string       `json:"en,omitempty"`
	Units    int           `json:"units"`
	Variants []siteVariant `json:"variants"`
	Class    string        `json:"jpen_class"`
}

// siteVariant is one translation of an inconsistent text, with every unit that has it.
type siteVariant struct {
	ZH    string `json:"zh"`
	Count int    `json:"count"`
	// Unit keys ("<file path>|<key>"), in the order of the index.
	Keys []string `json:"keys"`
	// The units by their JP and EN, the most first.
	JPEN []siteJPENGroup `json:"jpen"`
}

// siteJPENGroup is the units of a translation with one JP and one EN; a language the units have no string in is left out.
type siteJPENGroup struct {
	JP    *string  `json:"jp,omitempty"`
	EN    *string  `json:"en,omitempty"`
	Count int      `json:"count"`
	Keys  []string `json:"keys"`
}

// siteFindInconsistent groups the translated units by group, field and KR text, and gives the
// groups that have more than one translation, the most units first. It marks their units (V)
// and counts them in the summaries of their files.
func siteFindInconsistent(files []siteBuilt) []*siteInconsistent {
	type ref struct{ file, unit int }
	type group struct {
		group, field, kr string
		order            []string // the translations, first seen first
		refs             map[string][]ref
	}
	groups := map[string]*group{}
	order := []string{}
	for n := range files {
		f := &files[n]
		for k := range f.data.Units {
			u := &f.data.Units[k]
			if u.S != statusTW {
				continue
			}
			key := f.summary.Group + "\x00" + u.F + "\x00" + u.KR
			g := groups[key]
			if g == nil {
				g = &group{group: f.summary.Group, field: u.F, kr: u.KR, refs: map[string][]ref{}}
				groups[key] = g
				order = append(order, key)
			}
			zh := *u.ZH
			if _, has := g.refs[zh]; !has {
				g.order = append(g.order, zh)
			}
			g.refs[zh] = append(g.refs[zh], ref{n, k})
		}
	}

	items := []*siteInconsistent{}
	for _, key := range order {
		g := groups[key]
		if len(g.order) < 2 {
			continue
		}
		item := &siteInconsistent{ID: inconsistentID(g.group, g.field, g.kr), Group: g.group, Field: g.field, KR: g.kr, Variants: []siteVariant{}}
		for _, zh := range g.order {
			v := siteVariant{ZH: zh, Keys: []string{}, JPEN: []siteJPENGroup{}}
			at := map[string]int{}
			for _, r := range g.refs[zh] {
				f := &files[r.file]
				u := &f.data.Units[r.unit]
				u.V = item.ID
				f.summary.Inconsistent++
				unitKey := f.summary.Path + "|" + u.P
				v.Count++
				v.Keys = append(v.Keys, unitKey)
				pair := jpenPair(u.JP, u.EN)
				i, has := at[pair]
				if !has {
					i = len(v.JPEN)
					at[pair] = i
					v.JPEN = append(v.JPEN, siteJPENGroup{JP: u.JP, EN: u.EN, Keys: []string{}})
				}
				v.JPEN[i].Count++
				v.JPEN[i].Keys = append(v.JPEN[i].Keys, unitKey)
			}
			sort.SliceStable(v.JPEN, func(a, b int) bool { return v.JPEN[a].Count > v.JPEN[b].Count })
			item.Units += v.Count
			item.Variants = append(item.Variants, v)
		}
		sort.SliceStable(item.Variants, func(a, b int) bool { return item.Variants[a].Count > item.Variants[b].Count })
		if first := g.refs[item.Variants[0].ZH][0]; true {
			u := files[first.file].data.Units[first.unit]
			item.JP, item.EN = u.JP, u.EN
		}
		item.Class = jpenClass(item.Variants)
		items = append(items, item)
	}
	sort.SliceStable(items, func(a, b int) bool {
		x, y := items[a], items[b]
		if x.Units != y.Units {
			return x.Units > y.Units
		}
		if x.Group != y.Group {
			return x.Group < y.Group
		}
		if x.Field != y.Field {
			return x.Field < y.Field
		}
		return x.KR < y.KR
	})
	return items
}

// jpenPair is a JP/EN pair as a map key; a missing language is a value of its own, apart from "".
func jpenPair(jp, en *string) string {
	part := func(p *string) string {
		if p == nil {
			return "-"
		}
		return "+" + *p
	}
	return part(jp) + "\x00" + part(en)
}

// jpenClass says whether JP and EN tell the translations apart: same when every unit has one
// JP/EN pair, explained when each pair has one translation, partial otherwise.
func jpenClass(variants []siteVariant) string {
	trans := map[string]map[string]bool{} // JP/EN pair -> its translations
	for _, v := range variants {
		for _, j := range v.JPEN {
			p := jpenPair(j.JP, j.EN)
			if trans[p] == nil {
				trans[p] = map[string]bool{}
			}
			trans[p][v.ZH] = true
		}
	}
	if len(trans) <= 1 {
		return jpenSame
	}
	for _, zh := range trans {
		if len(zh) > 1 {
			return jpenPartial
		}
	}
	return jpenExplained
}

// inconsistentID names a group by its group, field and KR text, so that it is the same from one release to the next.
func inconsistentID(group, field, kr string) string {
	h := fnv.New64a()
	h.Write([]byte(group))
	h.Write([]byte{0})
	h.Write([]byte(field))
	h.Write([]byte{0})
	h.Write([]byte(kr))
	return fmt.Sprintf("inconsistent/%012x", h.Sum64()&0xffffffffffff)
}
