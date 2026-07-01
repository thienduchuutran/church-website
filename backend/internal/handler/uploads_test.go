package handler

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"
)

type fakeUploadService struct {
	url string
	err error
}

func (f *fakeUploadService) UploadEditorImage(_ context.Context, _ multipart.File, _ *multipart.FileHeader) (string, error) {
	return f.url, f.err
}

// imageUploadRequest builds a multipart POST. filename == "" omits the file part
// entirely (to test the missing-field path); contentType sets the part's own
// Content-Type header, which is what the handler validates.
func imageUploadRequest(t *testing.T, filename, contentType string) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	if filename != "" {
		h := textproto.MIMEHeader{}
		h.Set("Content-Disposition", `form-data; name="image"; filename="`+filename+`"`)
		if contentType != "" {
			h.Set("Content-Type", contentType)
		}
		part, err := mw.CreatePart(h)
		if err != nil {
			t.Fatal(err)
		}
		part.Write([]byte("imgdata"))
	}
	mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads/image", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	return req
}

func TestUploadHandler_success(t *testing.T) {
	h := NewUploadHandler(&fakeUploadService{url: "https://r2/pub/images/body/1.png"})
	rec := httptest.NewRecorder()
	h.UploadImage(rec, imageUploadRequest(t, "photo.png", "image/png"))

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"url":"https://r2/pub/images/body/1.png"`)) {
		t.Errorf("body = %s, want the public url", rec.Body.String())
	}
}

func TestUploadHandler_missingField(t *testing.T) {
	h := NewUploadHandler(&fakeUploadService{})
	rec := httptest.NewRecorder()
	h.UploadImage(rec, imageUploadRequest(t, "", ""))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 for missing image field", rec.Code)
	}
}

func TestUploadHandler_rejectsNonImage(t *testing.T) {
	h := NewUploadHandler(&fakeUploadService{})
	rec := httptest.NewRecorder()
	h.UploadImage(rec, imageUploadRequest(t, "evil.exe", "application/octet-stream"))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 for non-image content type", rec.Code)
	}
}
