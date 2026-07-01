package discord

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSend_returnsMessageIDAndSendsIdentity(t *testing.T) {
	var gotPath, gotQuery, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotQuery = r.URL.RawQuery
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.WriteHeader(http.StatusOK)
		io.WriteString(w, `{"id":"123456789","channel_id":"c"}`)
	}))
	defer srv.Close()

	id, err := Send(srv.URL, OutboundMessage{
		Content:         "hello",
		Username:        "pastorminh",
		AvatarURL:       "https://cdn/avatar.png",
		AllowedMentions: NoMentions(),
	})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if id != "123456789" {
		t.Errorf("id = %q, want 123456789", id)
	}
	if gotQuery != "wait=true" {
		t.Errorf("query = %q, want wait=true (needed for Discord to return the id)", gotQuery)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(gotBody), &payload); err != nil {
		t.Fatalf("body not json: %v (%s)", err, gotBody)
	}
	if payload["username"] != "pastorminh" {
		t.Errorf("username = %v, want pastorminh", payload["username"])
	}
	if payload["avatar_url"] != "https://cdn/avatar.png" {
		t.Errorf("avatar_url = %v", payload["avatar_url"])
	}
	_ = gotPath
}

func TestSend_errorOnNon2xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer srv.Close()

	if _, err := Send(srv.URL, OutboundMessage{Content: "x", AllowedMentions: NoMentions()}); err == nil {
		t.Error("expected error on 400, got nil")
	}
}

func TestEdit_patchesMessageByID(t *testing.T) {
	var gotMethod, gotPath, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.WriteHeader(http.StatusOK)
		io.WriteString(w, `{"id":"123"}`)
	}))
	defer srv.Close()

	err := Edit(srv.URL, "123", OutboundMessage{
		Content:         "edited",
		Username:        "ignored-on-edit",
		AllowedMentions: NoMentions(),
	})
	if err != nil {
		t.Fatalf("Edit: %v", err)
	}
	if gotMethod != http.MethodPatch {
		t.Errorf("method = %s, want PATCH", gotMethod)
	}
	if !strings.HasSuffix(gotPath, "/messages/123") {
		t.Errorf("path = %s, want .../messages/123", gotPath)
	}
	if strings.Contains(gotBody, "username") {
		t.Errorf("edit body must not include username (Discord ignores it): %s", gotBody)
	}
}

func TestDelete_treats404AsSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			t.Errorf("method = %s, want DELETE", r.Method)
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	if err := Delete(srv.URL, "gone"); err != nil {
		t.Errorf("Delete on 404 should be nil (already gone), got %v", err)
	}
}

func TestDelete_successOn204(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	if err := Delete(srv.URL, "123"); err != nil {
		t.Errorf("Delete on 204 = %v, want nil", err)
	}
}

func TestSend_withFilesUsesMultipart(t *testing.T) {
	var gotContentType, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotContentType = r.Header.Get("Content-Type")
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.WriteHeader(http.StatusOK)
		io.WriteString(w, `{"id":"999"}`)
	}))
	defer srv.Close()

	id, err := Send(srv.URL, OutboundMessage{
		Content:         "hello",
		Username:        "pastorminh",
		AllowedMentions: NoMentions(),
		Files:           []FileAttachment{{Filename: "a.png", ContentType: "image/png", Data: []byte("PNGDATA")}},
	})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if id != "999" {
		t.Errorf("id = %q, want 999", id)
	}
	if !strings.HasPrefix(gotContentType, "multipart/form-data") {
		t.Errorf("content-type = %q, want multipart/form-data", gotContentType)
	}
	for _, want := range []string{"payload_json", `"filename":"a.png"`, "PNGDATA", "hello"} {
		if !strings.Contains(gotBody, want) {
			t.Errorf("multipart body missing %q; body=%s", want, gotBody)
		}
	}
}
