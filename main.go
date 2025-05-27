package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"html"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap"
)

const (
	exportRoot = "export/LimbusCompany_Data/Lang/TW"
)

var (
	token  = ""
	paraid = 0

	assetsUpdate        = false
	assetsContextUpdate = false

	syncid = 0

	exportFromAssets   = ""
	exportWithArtifact = false
	replacefile        = ""

	reseteol = false
)

func init() {
	flag.IntVar(&paraid, "id", 0, "paratranz repo id")
	flag.StringVar(&token, "token", "", "paratranz token")

	flag.BoolVar(&assetsUpdate, "update", false, "update from assets")
	flag.BoolVar(&assetsContextUpdate, "update-context", false, "update context from assets")
	flag.IntVar(&syncid, "sync-from", 0, "sync project's translation from this id")

	flag.StringVar(&exportFromAssets, "export", "", "export assets from kr or en or jp")
	flag.BoolVar(&exportWithArtifact, "from-artifact", false, "export use downloaded artifact")
	flag.StringVar(&replacefile, "replace", "", "replace translation from file")
	flag.BoolVar(&reseteol, "reset-eol", false, "reset end of line from files")

	flag.Parse()
}

func main() {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	zap.ReplaceGlobals(logger)

	if assetsUpdate {
		updateFromAssets()
	}

	// if syncid != 0 {
	// 	syncTran()
	// }

	if exportFromAssets != "" {
		fromLang := strings.ToLower(exportFromAssets)
		if exportWithArtifact {
			exportAssetsWithArtifact(fromLang)
		} else {
			exportAssets(fromLang)
		}
	}

	if replacefile != "" {
		replaceFromFile(replacefile)
	}

	// if reseteol {
	// 	resetEOL()
	// }
}

func resetEOL() {
	zap.S().Infoln("Start reset end of line")

	artifactRoot := "download/raw/"

	b, err := os.ReadFile(filepath.Join("dump/space_files.txt"))
	if err != nil {
		zap.S().Fatalln("read replace file error", replacefile, err)
	}

	list := strings.Split(string(b), "\n")

	h := NewParatranzHandler(paraid, token)

	m, err := h.GetFiles()
	if err != nil {
		zap.S().Fatalln("GetFiles error", paraid, err)
	}

	for _, name := range list {
		paraname := strings.TrimSuffix(strings.TrimPrefix(name, artifactRoot), ".json")

		if para, has := m[paraname]; has {
			fmt.Println(name, para.ID, para.Folder, para.Name)
			bfile, err := os.ReadFile(name)
			if err != nil {
				zap.S().Fatalln("GetFiles error", paraid, err)
			}

			err = retryWithBackoff(func() error {
				return h.UpdateFile(para.ID, bfile, para.Folder, para.Name, true)
			})

			if err != nil {
				zap.S().Fatalln("UpdateFile error", para.Name, err)
			}

			err = retryWithBackoff(func() error {
				return h.UpdateTranslation(para.ID, bfile, para.Name, true, false)
			})

			if err != nil {
				zap.S().Fatalln("UpdateTranslation error", para.Name, err)
			}

		}
	}

}

func replaceFromFile(replacefile string) {
	zap.S().Infoln("Start replace translation from file:", replacefile)

	b, err := os.ReadFile(replacefile)
	if err != nil {
		zap.S().Fatalln("read replace file error", replacefile, err)
	}

	rmap := map[string]string{}
	list := strings.Split(string(b), "\n")
	for _, row := range list {
		before, after, found := strings.Cut(row, "|")
		if !found {
			zap.S().Fatalln("replace file parser error", row, err)
		}
		rmap[before] = after
	}

	h := NewParatranzHandler(paraid, token)

	m, err := h.GetFiles()
	if err != nil {
		zap.S().Fatalln("GetFiles error", paraid, err)
	}

	for _, f := range m {
		var paraTrans []ParatranzTranslation
		err := retryWithBackoff(func() error {
			trans, err := h.GetTranslation(f.ID)
			paraTrans = trans
			return err
		})

		if err != nil {
			zap.S().Fatalln("GetTranslation", err)
		}

		changeset := map[int]bool{}
		for i, t := range paraTrans {
			for from, to := range rmap {
				if strings.Contains(t.Translation, from) {
					changeset[i] = true
					paraTrans[i].Translation = strings.ReplaceAll(paraTrans[i].Translation, from, to)
				}
			}
		}

		if len(changeset) > 0 {
			zap.S().Infoln("change translation", f.Name, len(changeset))

			updateTrans := []ParatranzTranslation{}
			for i := range changeset {
				updateTrans = append(updateTrans, paraTrans[i])
			}

			b, err := JSONMarshal(updateTrans)
			if err != nil {
				zap.S().Fatalln("JSONMarshal", err)
			}

			err = retryWithBackoff(func() error {
				return h.UpdateTranslation(f.ID, b, f.Name, true, false)
			})

			if err != nil {
				zap.S().Fatalln("UpdateTranslation", err)
			}
		}
	}
}

func exportAssetsWithArtifact(langType string) {
	zap.S().Infoln("Start use artifact export translation assets from lang:", langType)

	os.MkdirAll(exportRoot, os.ModePerm)

	artifactRoot := "download/raw"

	raws, err := os.ReadDir(artifactRoot)

	if err != nil {
		zap.S().Fatalln("read fail", artifactRoot, err)
	}

	process := func(folder, name string) {
		assetsname := strings.TrimSuffix(name, ".json")
		zap.S().Infoln("Start export", folder, assetsname)

		artifactfilepath := filepath.Join(artifactRoot, folder, name)
		krfilepath := filepath.Join("Assets", "kr", folder, "KR_"+assetsname)
		enfilepath := filepath.Join("Assets", langType, folder, strings.ToUpper(langType)+"_"+assetsname)

		if folder != "" {
			os.MkdirAll(filepath.Join(exportRoot, folder), os.ModePerm)
		}

		_, krPMData, krerr := getPMData(krfilepath)

		if krerr != nil {
			zap.S().Errorw("missing assets file", "path", krfilepath)
			return
		}

		_, enPMData, enerr := getPMData(enfilepath)

		// setup lang
		if enerr == nil {
			enm := enPMData.getTranMap()
			krPMData.setFromTranMap(enm)
		}

		// setup para
		b, err := os.ReadFile(artifactfilepath)
		if err != nil {
			zap.S().Fatalln("export read artifact file fail", artifactfilepath, err)
		}

		fromTrans := []ParatranzTranslation{}

		err = json.Unmarshal(b, &fromTrans)
		if err != nil {
			zap.S().Fatalln("export Unmarshal artifact fail", artifactfilepath, err)
		}

		m := map[string]string{}

		for _, t := range fromTrans {
			m[t.Key] = strings.ReplaceAll(html.UnescapeString(t.Translation), "\\n", "\n")
		}

		krPMData.setFromTranMap(m)

		b, err = JSONMarshal(krPMData)
		if err != nil {
			zap.S().Fatalln("JSONMarshal", err)
		}

		err = os.WriteFile(filepath.Join(exportRoot, folder, assetsname), b, os.ModePerm)
		if err != nil {
			zap.S().Fatalln("export WriteFile fail", artifactfilepath, err)
		}
	}

	for _, raw := range raws {
		if raw.IsDir() {
			folder := raw.Name()
			subraws, err := os.ReadDir(filepath.Join(artifactRoot, folder))
			if err != nil {
				zap.S().Fatalln("read fail", artifactRoot, folder, err)
			}
			for _, subraw := range subraws {
				process(folder, subraw.Name())
			}
			continue
		}
		process("", raw.Name())
	}

	filelistpath := filepath.Join("dump", langType+"_files.txt")

	b, err := os.ReadFile(filelistpath)
	if err != nil {
		zap.S().Fatalln("read fail", filelistpath, err)
	}

	lines := strings.Split(string(b), "\n")

	for _, line := range lines {
		if len(line) == 0 {
			continue
		}
		sp := strings.Split(line, "\t")
		if len(sp) < 2 {
			zap.S().Fatalln("files.txt split error:", line)
		}

		tranfolder, tranname := getLangTranPath(sp[1], langType)

		artifactfilepath := filepath.Join(artifactRoot, tranfolder, tranname) + ".json"

		assetsPath := filepath.Join("Assets", langType, tranfolder, strings.ToUpper(langType)+"_"+tranname)
		assetsRawData, _, _ := getPMData(assetsPath)

		os.MkdirAll(filepath.Join(exportRoot, tranfolder), os.ModePerm)

		if _, err := os.Stat(artifactfilepath); errors.Is(err, os.ErrNotExist) {
			zap.S().Infoln("Start export from", langType, tranfolder, tranname)
			err := os.WriteFile(filepath.Join(exportRoot, tranfolder, tranname), assetsRawData, os.ModePerm)
			if err != nil {
				zap.S().Fatalln("export WriteFile fail", assetsPath, err)
			}
		}

	}
}

func exportAssets(langType string) {
	zap.S().Infoln("Start export translation assets from lang:", langType)

	os.MkdirAll(exportRoot, os.ModePerm)

	h := NewParatranzHandler(paraid, token)

	m, err := h.GetFiles()
	if err != nil {
		zap.S().Fatalln("GetFiles error", paraid, err)
	}

	filelistpath := filepath.Join("dump", langType+"_files.txt")

	b, err := os.ReadFile(filelistpath)
	if err != nil {
		zap.S().Fatalln("read fail", filelistpath, err)
	}

	lines := strings.Split(string(b), "\n")

	for _, line := range lines {
		if len(line) == 0 {
			continue
		}
		sp := strings.Split(line, "\t")
		if len(sp) < 2 {
			zap.S().Fatalln("files.txt split error:", line)
		}

		tranpath, tranname := getLangTranPath(sp[1], langType)
		fulltranpath := filepath.Join(tranpath, tranname)
		if f, has := m[fulltranpath]; has {
			export(h, langType, tranpath, tranname, &f)
		} else {
			export(h, langType, tranpath, tranname, nil)
		}
	}
}

func export(h *ParatranzHandler, langType, tranfolder, tranname string, paraFile *ParatranzFile) {
	zap.S().Infoln("Start export", tranfolder, tranname)

	assetsPath := filepath.Join("Assets", langType, tranfolder, strings.ToUpper(langType)+"_"+tranname)
	assetsRawData, assetsPMData, _ := getPMData(assetsPath)

	os.MkdirAll(filepath.Join(exportRoot, tranfolder), os.ModePerm)

	if paraFile == nil {
		zap.S().Warnln("paratranz missing file", tranfolder, tranname)
		err := os.WriteFile(filepath.Join(exportRoot, tranfolder, tranname), assetsRawData, os.ModePerm)
		if err != nil {
			zap.S().Fatalln("export WriteFile fail", assetsPath, err)
		}
		return
	}

	var fromTrans []ParatranzTranslation

	err := retryWithBackoff(func() error {
		trans, err := h.GetTranslation(paraFile.ID)
		fromTrans = trans
		return err
	})
	if err != nil {
		zap.S().Fatalln("GetTranslation", err)
	}

	m := map[string]string{}

	for _, t := range fromTrans {
		m[t.Key] = strings.ReplaceAll(t.Translation, "\\n", "\n")
	}

	assetsPMData.setFromTranMap(m)

	b, err := JSONMarshal(assetsPMData)
	if err != nil {
		zap.S().Fatalln("JSONMarshal", err)
	}

	err = os.WriteFile(filepath.Join(exportRoot, tranfolder, tranname), b, os.ModePerm)
	if err != nil {
		zap.S().Fatalln("export WriteFile fail", assetsPath, err)
	}
}

func syncTran() {
	zap.S().Infoln("Start sync translation from other project")

	h := NewParatranzHandler(paraid, token)
	m, err := h.GetFiles()
	if err != nil {
		zap.S().Fatalln("GetFiles error", paraid, err)
	}

	sourceh := NewParatranzHandler(syncid, token)
	sourcem, err := sourceh.GetFiles()
	if err != nil {
		zap.S().Fatalln("GetFiles error", syncid, err)
	}

	for k, v := range m {
		if v.Total == v.Translated {
			// skip all translated file
			continue
		}
		if sourcev, has := sourcem[k]; has {
			updateTran(sourceh, h, sourcev, v)
		}
	}
}

func updateTran(from, to *ParatranzHandler, fromFile, toFile ParatranzFile) {
	zap.S().Infoln("updateTran", toFile.Name)
	var fromTrans, toTrans []ParatranzTranslation

	err := retryWithBackoff(func() error {
		trans, err := from.GetTranslation(fromFile.ID)
		fromTrans = trans
		return err
	})

	if err != nil {
		zap.S().Fatalln("GetTranslation", err)
	}

	err = retryWithBackoff(func() error {
		trans, err := to.GetTranslation(toFile.ID)
		toTrans = trans
		return err
	})

	if err != nil {
		zap.S().Fatalln("GetTranslation", err)
	}

	m := map[string]ParatranzTranslation{}

	for _, t := range fromTrans {
		m[t.Key] = t
	}

	for i, t := range toTrans {
		if ft, has := m[t.Key]; has {
			if ft.Translation != "" {
				toTrans[i].Translation = ft.Translation
				toTrans[i].Stage = ft.Stage
				if ft.Stage == -1 {
					toTrans[i].Stage = 1
				}
			} else if strings.HasSuffix(t.Key, "->id") || strings.HasSuffix(t.Key, "->model") {
				toTrans[i].Translation = ft.Original
				toTrans[i].Stage = 1
			} else {
				toTrans[i].Translation = ""
				toTrans[i].Stage = 0
			}
		}
	}

	d, err := JSONMarshal(toTrans)
	if err != nil {
		zap.S().Fatalln("JSONMarshal", err)
	}

	err = retryWithBackoff(func() error {
		return to.UpdateTranslation(toFile.ID, d, filepath.Base(toFile.Name), true, true)
	})

	if err != nil {
		zap.S().Fatalln("UpdateTranslation", err)
	}

}

func updateFromAssets() {
	zap.S().Infoln("Start update from assets")

	h := NewParatranzHandler(paraid, token)
	m, err := h.GetFiles()
	if err != nil {
		zap.S().Fatalln("GetFiles error", err)
	}

	b, err := os.ReadFile("dump/kr_files.txt")
	if err != nil {
		zap.S().Fatalln("read dump/kr_files.txt fail", err)
	}

	lines := strings.Split(string(b), "\n")

	updated := map[string]bool{}

	for _, line := range lines {
		if len(line) == 0 {
			continue
		}
		sp := strings.Split(line, "\t")
		if len(sp) < 2 {
			zap.S().Fatalln("files.txt split error:", line)
		}

		filetype := sp[0]
		tranpath, tranname := getTranPath(sp[1])
		fulltranpath := filepath.Join(tranpath, tranname)
		updated[fulltranpath] = true

		switch filetype {
		case "A":
			if _, has := m[fulltranpath]; !has {
				create(h, tranpath, tranname)
			}
		case "M":
			if f, has := m[fulltranpath]; !has {
				create(h, tranpath, tranname)
			} else {
				update(h, f, tranpath, tranname)
			}
		case "D":
			if f, has := m[fulltranpath]; has {
				delete(h, f)
			}
		default:
			zap.S().Errorln("error filetype", filetype, tranpath, tranname)
		}
	}

	if !assetsContextUpdate {
		return
	}

	enb, err := os.ReadFile("dump/en_files.txt")
	if err != nil {
		zap.S().Fatalln("read dump/en_files.txt fail", err)
	}

	enlines := strings.Split(string(enb), "\n")

	for _, line := range enlines {
		if len(line) == 0 {
			continue
		}
		sp := strings.Split(line, "\t")
		if len(sp) < 2 {
			zap.S().Fatalln("files.txt split error:", line)
		}

		filetype := sp[0]
		tranpath, tranname := getLangTranPath(sp[1], "en")
		fulltranpath := filepath.Join(tranpath, tranname)
		if _, has := updated[fulltranpath]; has {
			continue
		}
		updated[fulltranpath] = true

		switch filetype {
		case "A":
		case "M":
			if f, has := m[fulltranpath]; has {
				updateContext(h, f, tranpath, tranname)
			}
		case "D":
		default:
			zap.S().Errorln("error filetype", filetype, tranpath, tranname)
		}
	}

	jpb, err := os.ReadFile("dump/en_files.txt")
	if err != nil {
		zap.S().Fatalln("read dump/en_files.txt fail", err)
	}

	jplines := strings.Split(string(jpb), "\n")

	for _, line := range jplines {
		if len(line) == 0 {
			continue
		}
		sp := strings.Split(line, "\t")
		if len(sp) < 2 {
			zap.S().Fatalln("files.txt split error:", line)
		}

		filetype := sp[0]
		tranpath, tranname := getLangTranPath(sp[1], "jp")
		fulltranpath := filepath.Join(tranpath, tranname)
		if _, has := updated[fulltranpath]; has {
			continue
		}
		updated[fulltranpath] = true

		switch filetype {
		case "A":
		case "M":
			if f, has := m[fulltranpath]; has {
				updateContext(h, f, tranpath, tranname)
			}
		case "D":
		default:
			zap.S().Errorln("error filetype", filetype, tranpath, tranname)
		}
	}
}

type PMData struct {
	DataList []map[string]any `json:"dataList"`
}

func recursionGetPMData(v any, keys []string, m map[string]string) {
	switch vt := v.(type) {
	case string:
		m[strings.Join(keys, "->")] = vt
	case []map[string]any:
		for i, mapv := range vt {
			for k, subv := range mapv {
				recursionGetPMData(subv, append(keys, strconv.Itoa(i), k), m)
			}
		}
	case map[string]any:
		for k, subv := range vt {
			recursionGetPMData(subv, append(keys, k), m)
		}
	case []any:
		for i, subv := range vt {
			recursionGetPMData(subv, append(keys, strconv.Itoa(i)), m)
		}
	default:
		// do nothing
	}
}

func (pm *PMData) getTranMap() map[string]string {
	m := map[string]string{}
	keys := []string{"dataList"}
	recursionGetPMData(pm.DataList, keys, m)
	return m
}

func recursionSetPMData(v any, keys []string, m map[string]string) (string, bool) {
	switch vt := v.(type) {
	case string:
		return m[strings.Join(keys, "->")], m[strings.Join(keys, "->")] != ""
	case []map[string]any:
		for i, mapv := range vt {
			for k, subv := range mapv {
				if k == "id" || k == "model" {
					continue
				}
				if setv, ok := recursionSetPMData(subv, append(keys, strconv.Itoa(i), k), m); ok {
					vt[i][k] = setv
				}
			}
		}
	case map[string]any:
		for k, subv := range vt {
			if k == "id" || k == "model" {
				continue
			}
			if setv, ok := recursionSetPMData(subv, append(keys, k), m); ok {
				vt[k] = setv
			}
		}
	case []any:
		for i, subv := range vt {
			if setv, ok := recursionSetPMData(subv, append(keys, strconv.Itoa(i)), m); ok {
				vt[i] = setv
			}
		}
	default:
	}
	return "", false
}

func (pm *PMData) setFromTranMap(m map[string]string) {
	keys := []string{"dataList"}
	recursionSetPMData(pm.DataList, keys, m)
}

func getPMData(filepath string) ([]byte, *PMData, error) {
	RawData, err := os.ReadFile(filepath)
	if err != nil {
		zap.S().Errorln("ReadFile error", filepath, err)
		return nil, nil, err
	}

	pm := PMData{}
	err = json.Unmarshal(RawData, &pm)
	if err != nil {
		zap.S().Fatalln("Unmarshal error", filepath, err)
	}
	return RawData, &pm, nil
}

func create(h *ParatranzHandler, tranfolder, tranname string) {
	zap.S().Infoln("create", tranfolder, tranname)
	krPath := filepath.Join("Assets/kr", tranfolder, "KR_"+tranname)

	krRawData, krPMData, _ := getPMData(krPath)

	if len(krPMData.DataList) == 0 {
		zap.S().Errorln("skip empty file", krPath)
		return
	}

	var parafile *ParatranzFile

	// upload new file
	err := retryWithBackoff(func() error {
		f, err := h.UploadFile(krRawData, tranfolder, tranname)
		parafile = f
		return err
	})

	if err != nil {
		if err.Error() == ParatranzEmptySkip {
			zap.S().Warnln("UploadFile empty skip", krPath, err)
			return
		}
		zap.S().Fatalln("UploadFile fial", krPath, err)
	}

	// update context
	updateContext(h, *parafile, tranfolder, tranname)
}

func delete(h *ParatranzHandler, pf ParatranzFile) {
	zap.S().Infoln("delete", pf.Name, pf.ID)

	err := retryWithBackoff(func() error {
		return h.DeleteFile(pf.ID)
	})
	if err != nil {
		zap.S().Fatalln("upload DeleteFile fial", pf.ID, err)
	}
}

func update(h *ParatranzHandler, pf ParatranzFile, tranfolder, tranname string) {
	zap.S().Infoln("update", pf.ID, tranfolder, tranname)

	krPath := filepath.Join("Assets/kr", tranfolder, "KR_"+tranname)

	krRawData, krPMData, _ := getPMData(krPath)

	if len(krPMData.DataList) == 0 {
		zap.S().Errorln("skip empty file", krPath)
		return
	}

	// upload new file
	err := retryWithBackoff(func() error {
		err := h.UpdateFile(pf.ID, krRawData, tranfolder, tranname, false)
		return err
	})

	if err != nil {
		if err.Error() == ParatranzEmptySkip {
			zap.S().Errorln("UpdateFile empty skip", krPath, err)
			return
		}
		zap.S().Fatalln("UpdateFile fial", krPath, err)
	}

	updateContext(h, pf, tranfolder, tranname)
}

func updateContext(h *ParatranzHandler, pf ParatranzFile, tranfolder, tranname string) {
	zap.S().Infoln("updateContext", pf.ID, tranfolder, tranname)

	krPath := filepath.Join("Assets/kr", tranfolder, "KR_"+tranname)
	enPath := filepath.Join("Assets/en", tranfolder, "EN_"+tranname)
	jpPath := filepath.Join("Assets/jp", tranfolder, "JP_"+tranname)

	var filetrans []ParatranzTranslation

	err := retryWithBackoff(func() error {
		trans, err := h.GetTranslation(pf.ID)
		filetrans = trans
		return err
	})

	if err != nil {
		zap.S().Fatalln("GetTranslation", pf.Name, pf.ID, err)
	}

	_, enPMData, enerr := getPMData(enPath)
	_, jpPMData, jperr := getPMData(jpPath)

	enTran := map[string]string{}
	if enerr == nil {
		enTran = enPMData.getTranMap()
	}
	jpTran := map[string]string{}
	if jperr == nil {
		jpTran = jpPMData.getTranMap()
	}

	forces := []ParatranzTranslation{}
	for i, tran := range filetrans {
		enContext := enTran[tran.Key]
		jpContext := jpTran[tran.Key]

		// id and model skip context
		if strings.HasSuffix(tran.Key, "->id") || strings.HasSuffix(tran.Key, "->model") {
			continue
		}
		filetrans[i].Context = fmt.Sprintf("EN:\n%s\n\nJP:\n%s", enContext, jpContext)
	}

	finaltrans := []ParatranzTranslation{}

	for _, tran := range filetrans {
		if tran.Original != "" {
			finaltrans = append(finaltrans, tran)
			if tran.Stage == -1 {
				forces = append(forces, tran)
			} else if strings.HasSuffix(tran.Key, "->id") || strings.HasSuffix(tran.Key, "->model") {
				tran.Translation = tran.Original
				forces = append(forces, tran)
			}
		}
	}

	tranb, err := JSONMarshal(finaltrans)
	if err != nil {
		zap.S().Fatalln("JSONMarshal", pf.Name, pf.ID, filetrans, err)
	}

	err = retryWithBackoff(func() error {
		return h.UpdateFile(pf.ID, tranb, tranfolder, tranname, true)
	})

	if err != nil {
		zap.S().Fatalln("UpdateFile fial", krPath, err)
	}

	// fix forces
	if len(forces) != 0 {
		zap.S().Infoln("fix forces count", len(forces))

		for i, tran := range forces {
			forces[i].Stage = 0
			if tran.Translation != "" {
				forces[i].Stage = 1
			}
		}

		hidetranb, err := JSONMarshal(forces)
		if err != nil {
			zap.S().Fatalln("JSONMarshal", pf.Name, pf.ID, forces, err)
		}

		err = retryWithBackoff(func() error {
			return h.UpdateTranslation(pf.ID, hidetranb, pf.Name, true, true)
		})
		if err != nil {
			zap.S().Fatalln("UpdateTranslation fial", krPath, err)
		}
	}

}

func getTranPath(krpath string) (filder string, name string) {
	return getLangTranPath(krpath, "kr")
}

func getLangTranPath(assetspath string, langType string) (filder string, name string) {
	assetspath = assetspath[3:]
	filder = filepath.Dir(assetspath)
	name = strings.TrimPrefix(filepath.Base(assetspath), strings.ToUpper(langType)+"_")
	return filder, name
}

func JSONMarshal(t interface{}) ([]byte, error) {
	buffer := &bytes.Buffer{}
	encoder := json.NewEncoder(buffer)
	encoder.SetEscapeHTML(false)
	err := encoder.Encode(t)
	return buffer.Bytes(), err
}

func retryWithBackoff(fn func() error) error {
	for {
		err := fn()
		if err == nil || err.Error() != ParatranzRetry {
			return err
		}
		zap.S().Warnln("retrying after error:", err)
		time.Sleep(30 * time.Second)
	}
}
