package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

const (
	paratranzAPIRoot   = "https://paratranz.cn/api"
	ParatranzRetry     = "429 retry"
	ParatranzEmptySkip = "empty"
)

func NewParatranzHandler(id int, token string) *ParatranzHandler {
	return &ParatranzHandler{id: id, token: token, client: &http.Client{}}
}

type ParatranzHandler struct {
	id     int
	token  string
	client *http.Client
}

func (h *ParatranzHandler) GetFiles() (map[string]ParatranzFile, error) {
	urlpath, _ := url.JoinPath(paratranzAPIRoot, "projects", strconv.Itoa(h.id), "files")

	req, err := http.NewRequest("GET", urlpath, nil)
	if err != nil {
		fmt.Println("GetFiles NewRequest fail", urlpath, err)
		return nil, err
	}
	req.Header.Set("Authorization", h.token)
	resp, err := h.client.Do(req)
	if err != nil {
		fmt.Println("GetFiles Request fail", urlpath, err)
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		fmt.Println("GetFiles Request fail", urlpath, resp.StatusCode, string(body))
		return nil, fmt.Errorf("request StatusCode %d error: %s", resp.StatusCode, string(body))
	}

	files := []ParatranzFile{}
	err = json.NewDecoder(resp.Body).Decode(&files)
	if err != nil {
		fmt.Println("GetFiles Decode fail", urlpath, err)
		return nil, err
	}

	m := map[string]ParatranzFile{}

	for _, f := range files {
		m[f.Name] = f
	}

	return m, nil
}

func (h *ParatranzHandler) UploadFile(data []byte, folder, name string) (*ParatranzFile, error) {
	urlpath, _ := url.JoinPath(paratranzAPIRoot, "projects", strconv.Itoa(h.id), "files")

	form := new(bytes.Buffer)
	writer := multipart.NewWriter(form)
	fw, _ := writer.CreateFormFile("file", name)
	fw.Write(data)
	if folder != "." {
		writer.WriteField("path", folder)
	}
	err := writer.Close()
	if err != nil {
		fmt.Println(err)
		return nil, err
	}

	req, err := http.NewRequest("POST", urlpath, form)
	if err != nil {
		fmt.Println("UploadFile NewRequest fail", urlpath, err)
		return nil, err
	}

	req.Header.Set("Authorization", h.token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	resp, err := h.client.Do(req)
	if err != nil {
		fmt.Println("UploadFile Request fail", urlpath, err)
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == 429 {
		return nil, errors.New(ParatranzRetry)
	}

	if resp.StatusCode != 200 {
		fmt.Println("UploadFile Request fail", urlpath, resp.StatusCode, string(body))
		return nil, fmt.Errorf("request StatusCode %d error: %s", resp.StatusCode, string(body))
	}

	respfile := struct {
		File     ParatranzFile `json:"file"`
		Revision any           `json:"revision"`
		Status   string        `json:"status"`
	}{}

	err = json.Unmarshal(body, &respfile)
	if err != nil {
		fmt.Println("GetFiles Decode fail", urlpath, err)
		return nil, err
	}

	if respfile.Status == ParatranzEmptySkip {
		return nil, errors.New(ParatranzEmptySkip)
	}

	return &respfile.File, nil
}

func (h *ParatranzHandler) DeleteFile(id int) error {
	urlpath, _ := url.JoinPath(paratranzAPIRoot, "projects", strconv.Itoa(h.id), "files", strconv.Itoa(id))

	req, err := http.NewRequest("DELETE", urlpath, nil)
	if err != nil {
		fmt.Println("GetFiles NewRequest fail", urlpath, err)
		return err
	}
	req.Header.Set("Authorization", h.token)
	resp, err := h.client.Do(req)
	if err != nil {
		fmt.Println("GetFiles Request fail", urlpath, err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 429 {
		return errors.New(ParatranzRetry)
	}

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		fmt.Println("DeleteFile Request fail", urlpath, resp.StatusCode, string(body))
		return fmt.Errorf("request StatusCode %d error: %s", resp.StatusCode, string(body))
	}

	return nil
}

func (h *ParatranzHandler) UpdateFile(id int, data []byte, folder, name string, isRawFormat bool) error {
	urlpath, _ := url.JoinPath(paratranzAPIRoot, "projects", strconv.Itoa(h.id), "files", strconv.Itoa(id))

	form := new(bytes.Buffer)
	writer := multipart.NewWriter(form)
	if isRawFormat {
		name = name + ".json"
	}
	fw, _ := writer.CreateFormFile("file", name)
	fw.Write(data)

	err := writer.Close()
	if err != nil {
		fmt.Println(err)
		return err
	}

	req, err := http.NewRequest("POST", urlpath, form)
	if err != nil {
		fmt.Println("UploadFile NewRequest fail", urlpath, err)
		return err
	}

	req.Header.Set("Authorization", h.token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	resp, err := h.client.Do(req)
	if err != nil {
		fmt.Println("UploadFile Request fail", urlpath, err)
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == 429 {
		return errors.New(ParatranzRetry)
	}

	if resp.StatusCode != 200 {
		fmt.Println("UploadFile Request fail", urlpath, resp.StatusCode, string(body))
		return fmt.Errorf("request StatusCode %d error: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (h *ParatranzHandler) GetTranslation(id int) ([]ParatranzTranslation, error) {
	urlpath, _ := url.JoinPath(paratranzAPIRoot, "projects", strconv.Itoa(h.id), "files", strconv.Itoa(id), "translation")

	req, err := http.NewRequest("GET", urlpath, nil)
	if err != nil {
		fmt.Println("GetTranslation NewRequest fail", urlpath, err)
		return nil, err
	}
	req.Header.Set("Authorization", h.token)
	resp, err := h.client.Do(req)
	if err != nil {
		fmt.Println("GetTranslation Request fail", urlpath, err)
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 429 {
		return nil, errors.New(ParatranzRetry)
	}

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		fmt.Println("GetTranslation Request fail", urlpath, resp.StatusCode, string(body))
		return nil, fmt.Errorf("request StatusCode %d error: %s", resp.StatusCode, string(body))
	}

	trans := []ParatranzTranslation{}
	err = json.Unmarshal(body, &trans)
	if err != nil {
		fmt.Println("GetTranslation Decode fail", urlpath, err)
		return nil, err
	}

	return trans, nil
}

func (h *ParatranzHandler) UpdateTranslation(id int, data []byte, name string, isRawFormat, isForce bool) error {
	urlpath, _ := url.JoinPath(paratranzAPIRoot, "projects", strconv.Itoa(h.id), "files", strconv.Itoa(id), "translation")

	form := new(bytes.Buffer)
	writer := multipart.NewWriter(form)
	if isRawFormat {
		name = name + ".json"
	}
	fw, _ := writer.CreateFormFile("file", name)
	fw.Write(data)
	if isForce {
		writer.WriteField("force", "true")
	}
	err := writer.Close()
	if err != nil {
		fmt.Println(err)
		return err
	}

	req, err := http.NewRequest("POST", urlpath, form)
	if err != nil {
		fmt.Println("UploadFile NewRequest fail", urlpath, err)
		return err
	}

	req.Header.Set("Authorization", h.token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	resp, err := h.client.Do(req)
	if err != nil {
		fmt.Println("UploadFile Request fail", urlpath, err)
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == 429 {
		return errors.New(ParatranzRetry)
	}

	if resp.StatusCode != 200 {
		fmt.Println("UploadFile Request fail", urlpath, resp.StatusCode, string(body))
		return fmt.Errorf("request StatusCode %d error: %s", resp.StatusCode, string(body))
	}

	return nil
}

type ParatranzFile struct {
	ID         int       `json:"id"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
	ModifiedAt time.Time `json:"modifiedAt"`
	Name       string    `json:"name"`
	Project    int       `json:"project"`
	Format     string    `json:"format"`
	Total      int       `json:"total"`
	Translated int       `json:"translated"`
	Disputed   int       `json:"disputed"`
	Checked    int       `json:"checked"`
	Reviewed   int       `json:"reviewed"`
	Hidden     int       `json:"hidden"`
	Locked     int       `json:"locked"`
	Words      int       `json:"words"`
	Hash       string    `json:"hash"`
	Folder     string    `json:"folder"`
}

type ParatranzTranslation struct {
	ID          int    `json:"id"`
	Key         string `json:"key"`
	Original    string `json:"original"`
	Translation string `json:"translation"`
	Stage       int    `json:"stage"`
	Context     string `json:"context,omitempty"`
}

type ParatranzString struct {
	ID          *int    `json:"id,omitempty"`
	Key         string  `json:"key"`
	Original    *string `json:"original,omitempty"`
	Translation *string `json:"translation,omitempty"`
	Stage       *int    `json:"stage,omitempty"`
	Context     *string `json:"context,omitempty"`
}
