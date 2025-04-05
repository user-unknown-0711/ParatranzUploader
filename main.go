package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap"
)

var (
	token  = ""
	paraid = 0

	assetsUpdate = false
	syncid       = 0
)

func init() {
	flag.IntVar(&paraid, "id", 0, "paratranz repo id")
	flag.StringVar(&token, "token", "", "paratranz token")

	flag.BoolVar(&assetsUpdate, "update", false, "update from assets")
	flag.IntVar(&syncid, "sync-from", 0, "sync project's translation from this id")

	flag.Parse()
}

func main() {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	zap.ReplaceGlobals(logger)

	if assetsUpdate {
		updateFromAssets()
	}

	if syncid != 0 {
		syncTran()
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
		if sourcev, has := sourcem[k]; has {
			updateTran(sourceh, h, sourcev, v)
		}
	}
}

func updateTran(from, to *ParatranzHandler, fromFile, toFile ParatranzFile) {
	zap.S().Infoln("updateTran", toFile.Name)
	var fromTrans, toTrans []ParatranzTranslation

	for {
		trans, err := from.GetTranslation(fromFile.ID)
		if err != nil {
			if err.Error() == ParatranzRetry {
				zap.S().Errorln("GetTranslation retry", err)
				time.Sleep(time.Second * 30)
				continue
			}
			zap.S().Fatalln("GetTranslation", err)
		}
		fromTrans = trans
		break
	}

	for {
		trans, err := to.GetTranslation(toFile.ID)
		if err != nil {
			if err.Error() == ParatranzRetry {
				zap.S().Errorln("GetTranslation retry", err)
				time.Sleep(time.Second * 30)
				continue
			}
			zap.S().Fatalln("GetTranslation", err)
		}
		toTrans = trans
		break
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
			} else {
				toTrans[i].Translation = ft.Original
				toTrans[i].Stage = 1
			}

		}
	}

	d, err := JSONMarshal(toTrans)
	if err != nil {
		zap.S().Fatalln("JSONMarshal", err)
	}

	for {
		err := to.UpdateTranslation(toFile.ID, d, filepath.Base(toFile.Name), true, true)
		if err != nil {
			if err.Error() == ParatranzRetry {
				zap.S().Errorln("UpdateTranslation retry", err)
				time.Sleep(time.Second * 30)
				continue
			}
			zap.S().Fatalln("UpdateTranslation", err)
		}
		break
	}
}

func updateFromAssets() {
	zap.S().Infoln("Start update from assets")

	h := NewParatranzHandler(paraid, token)
	m, err := h.GetFiles()
	if err != nil {
		zap.S().Fatalln("GetFiles error", err)
	}

	b, err := os.ReadFile("dump/files.txt")
	if err != nil {
		zap.S().Fatalln("read dump/files.txt fail", err)
	}

	lines := strings.Split(string(b), "\n")

	for _, line := range lines {
		if len(line) == 0 {
			continue
		}
		sp := strings.Split(line, "\t")
		if len(sp) < 2 {
			zap.S().Fatalln("files.txt splie error:", line)
		}

		filetype := sp[0]
		tranpath, tranname := getTranPath(sp[1])
		fulltranpath := filepath.Join(tranpath, tranname)

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
}

type PMData struct {
	DataList []map[string]any `json:"dataList"`
}

func recursionPMData(v any, keys []string, m map[string]string) {
	switch vt := v.(type) {
	case string:
		m[strings.Join(keys, "->")] = vt
	case []map[string]any:
		for i, mapv := range vt {
			for k, subv := range mapv {
				recursionPMData(subv, append(keys, strconv.Itoa(i), k), m)
			}
		}
	case map[string]any:
		for k, subv := range vt {
			recursionPMData(subv, append(keys, k), m)
		}
	case []any:
		for i, subv := range vt {
			recursionPMData(subv, append(keys, strconv.Itoa(i)), m)
		}
	default:
		// do nothing
	}
}

func (pm *PMData) getTranMap() map[string]string {
	m := map[string]string{}
	keys := []string{"dataList"}
	recursionPMData(pm.DataList, keys, m)
	return m
}

func getPMData(filepath string) ([]byte, *PMData) {
	RawData, _ := os.ReadFile(filepath)
	pm := PMData{}
	err := json.Unmarshal(RawData, &pm)
	if err != nil {
		zap.S().Fatalln("Unmarshal error", filepath, err)
	}
	return RawData, &pm
}

func create(h *ParatranzHandler, tranfolder, tranname string) {
	zap.S().Infoln("create", tranfolder, tranname)
	krPath := filepath.Join("Assets/kr", tranfolder, "KR_"+tranname)

	krRawData, krPMData := getPMData(krPath)

	if len(krPMData.DataList) == 0 {
		zap.S().Errorln("skip empty file", krPath)
		return
	}

	var parafile *ParatranzFile

	// upload new file
	for {
		f, err := h.UploadFile(krRawData, tranfolder, tranname)

		if err != nil {
			if err.Error() == ParatranzRetry {
				zap.S().Errorln("UploadFile retry", krPath, err)
				time.Sleep(time.Second * 30)
				continue
			} else if err.Error() == ParatranzEmptySkip {
				zap.S().Errorln("UploadFile empty skip", krPath, err)
				return
			}

			zap.S().Fatalln("UploadFile fial", krPath, err)
		}

		parafile = f
		break
	}

	// update context
	updateContext(h, *parafile, tranfolder, tranname)
}

func delete(h *ParatranzHandler, pf ParatranzFile) {
	zap.S().Infoln("delete", pf.Name, pf.ID)

	for {
		err := h.DeleteFile(pf.ID)
		if err != nil {
			if err.Error() == ParatranzRetry {
				zap.S().Errorln("delete DeleteFile retry", pf.Name, pf.ID, err)
				time.Sleep(time.Second * 30)
				continue
			}

			zap.S().Fatalln("upload DeleteFile fial", pf.ID, err)
		}
		break
	}

}

func update(h *ParatranzHandler, pf ParatranzFile, tranfolder, tranname string) {
	zap.S().Infoln("update", pf.ID, tranfolder, tranname)

	krPath := filepath.Join("Assets/kr", tranfolder, "KR_"+tranname)

	krRawData, krPMData := getPMData(krPath)

	if len(krPMData.DataList) == 0 {
		zap.S().Errorln("skip empty file", krPath)
		return
	}

	// upload new file
	for {
		err := h.UpdateFile(pf.ID, krRawData, tranfolder, tranname, false)

		if err != nil {
			if err.Error() == ParatranzRetry {
				zap.S().Errorln("UpdateFile retry", krPath, err)
				time.Sleep(time.Second * 30)
				continue
			} else if err.Error() == ParatranzEmptySkip {
				zap.S().Errorln("UpdateFile empty skip", krPath, err)
				return
			}

			zap.S().Fatalln("UpdateFile fial", krPath, err)
		}

		break
	}

	updateContext(h, pf, tranfolder, tranname)
}

func updateContext(h *ParatranzHandler, pf ParatranzFile, tranfolder, tranname string) {
	zap.S().Infoln("updateContext", pf.ID, tranfolder, tranname)

	krPath := filepath.Join("Assets/kr", tranfolder, "KR_"+tranname)
	enPath := filepath.Join("Assets/en", tranfolder, "EN_"+tranname)
	jpPath := filepath.Join("Assets/jp", tranfolder, "JP_"+tranname)

	var filetrans []ParatranzTranslation

	for {
		trans, err := h.GetTranslation(pf.ID)
		if err != nil {
			if err.Error() == ParatranzRetry {
				zap.S().Errorln("GetTranslation retry", krPath, err)
				time.Sleep(time.Second * 30)
				continue
			}
			zap.S().Fatalln("GetTranslation", pf.Name, pf.ID, err)
		}
		filetrans = trans
		break
	}

	_, enPMData := getPMData(enPath)
	_, jpPMData := getPMData(jpPath)

	enTran := enPMData.getTranMap()
	jpTran := jpPMData.getTranMap()

	for i, tran := range filetrans {
		enContext := enTran[tran.Key]
		jpContext := jpTran[tran.Key]

		if tran.Original == enContext {
			continue
		}
		filetrans[i].Context = fmt.Sprintf("EN:%s\n\nJP:%s", enContext, jpContext)
	}

	tranb, err := JSONMarshal(filetrans)
	if err != nil {
		zap.S().Fatalln("JSONMarshal", pf.Name, pf.ID, filetrans, err)
	}

	for {
		err := h.UpdateFile(pf.ID, tranb, tranfolder, tranname, true)
		if err != nil {
			if err.Error() == ParatranzRetry {
				zap.S().Errorln("UpdateFile retry", krPath, err)
				time.Sleep(time.Second * 30)
				continue
			}
			zap.S().Fatalln("UpdateFile fial", krPath, err)
		}
		break
	}

}

func getTranPath(krpath string) (filder string, name string) {
	krpath = krpath[3:]
	filder = filepath.Dir(krpath)
	name = strings.TrimPrefix(filepath.Base(krpath), "KR_")
	return filder, name
}

func JSONMarshal(t interface{}) ([]byte, error) {
	buffer := &bytes.Buffer{}
	encoder := json.NewEncoder(buffer)
	encoder.SetEscapeHTML(false)
	err := encoder.Encode(t)
	return buffer.Bytes(), err
}
