// gallery_test.go follows TDD (Test-Driven Development): we write the tests
// BEFORE writing the real handler. The tests define the contract — exactly what
// inputs the handler must accept and what HTTP status codes it must return.
// The code won't compile until we write the real handler (next step), and that
// is intentional and correct.
package handler

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

// mockGalleryService is a fake implementation of the GalleryService interface.
//
// Bigger picture: the real GalleryService talks to S3 and RDS. We never want
// unit tests to do that — they'd be slow, need real credentials, and could
// accidentally modify production data. Instead we define a fake that returns
// whatever we tell it to, so tests are fast, isolated, and fully predictable.
//
// The interface itself doesn't exist yet — it will be declared inside
// handler/gallery.go in the next step. Go interfaces are satisfied implicitly:
// as long as mockGalleryService has all the methods the interface requires,
// the compiler accepts it as a valid implementation.
type mockGalleryService struct {
	// image is what AddImageToPost returns on success.
	image *model.PostImage
	// err is what AddImageToPost returns when we want to simulate a failure.
	err error
}

// AddImageToPost is the only method the GalleryService interface needs.
// The _ prefix on each parameter means "I'm ignoring this value" — the mock
// doesn't actually process anything, it just returns the pre-set fields above.
func (m *mockGalleryService) AddImageToPost(_ context.Context, _ string, _ multipart.File, _ *multipart.FileHeader) (*model.PostImage, error) {
	return m.image, m.err
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// newImageUploadRequest builds a multipart/form-data HTTP request that mimics
// what a browser sends when a user picks a file in an <input type="file">.
//
// Why multipart/form-data?
// Binary files can't be sent as plain JSON. The HTTP standard for file uploads
// is multipart/form-data: the body is split into "parts", each with its own
// headers. One part carries the file bytes; another could carry text fields.
//
// Why set Content-Type on the part (not just the request)?
// The request's Content-Type header says "this body is multipart/form-data".
// But each individual part inside the body ALSO has headers, including its own
// Content-Type (e.g. "image/jpeg"). Our handler reads the part's Content-Type
// to validate that the upload is actually an image. That's why we use
// textproto.MIMEHeader to build the part manually instead of using the simpler
// w.CreateFormFile(), which always sets "application/octet-stream" on the part.
func newImageUploadRequest(t *testing.T, fileContentType string, content []byte) *http.Request {
	t.Helper() // marks this as a helper so test failures show the caller's line number

	body := &bytes.Buffer{}
	w := multipart.NewWriter(body) // writes the multipart boundary and parts into body

	// Build custom MIME headers for the file part.
	// Content-Disposition tells the server: "this part is a form field named
	// 'image', and the original filename was 'test.jpg'".
	// Content-Type tells the server what kind of file this is.
	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", `form-data; name="image"; filename="test.jpg"`)
	h.Set("Content-Type", fileContentType)

	part, err := w.CreatePart(h)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Fprint(part, string(content)) // write the fake file bytes into the part
	w.Close()                         // writes the final boundary marker — must be called before reading body

	req := httptest.NewRequest(http.MethodPost, "/api/v1/posts/abc123/images", body)
	// The request-level Content-Type must include the multipart boundary string
	// so the server knows where each part starts and ends.
	req.Header.Set("Content-Type", w.FormDataContentType())
	return req
}

// withIDParam injects a chi URL parameter named "id" into the request context.
//
// Why do we need this?
// In production, chi parses the URL (e.g. /posts/abc123/images) and stores
// "abc123" under the key "id" in the request context. In tests we bypass the
// router entirely and call the handler function directly, so chi never gets a
// chance to parse the URL. withIDParam simulates what chi would have done.
// Without it, chi.URLParam(r, "id") returns "" and the handler would fail.
func withIDParam(r *http.Request, id string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// TestGalleryHandler_UploadImage_success is the "golden path" test.
// A valid JPEG is uploaded, the service succeeds, and we expect HTTP 201 Created.
// 201 (not 200) because we created a new resource (a PostImage row in the DB).
func TestGalleryHandler_UploadImage_success(t *testing.T) {
	svc := &mockGalleryService{
		image: &model.PostImage{
			ID:         "img-1",
			PostID:     "abc123",
			StorageKey: "images/posts/abc123/1714000000-test.jpg",
		},
	}
	h := NewGalleryHandler(svc)

	req := newImageUploadRequest(t, "image/jpeg", []byte("fakeimagecontent"))
	req = withIDParam(req, "abc123")
	rec := httptest.NewRecorder() // captures what the handler writes (status, headers, body)

	h.UploadImage(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d body=%s", rec.Code, rec.Body)
	}
}

// TestGalleryHandler_UploadImage_missingFile tests the case where the request
// has no file attached at all. The handler must reject this with 400 Bad Request
// before ever calling the service — no point asking S3 to upload nothing.
func TestGalleryHandler_UploadImage_missingFile(t *testing.T) {
	h := NewGalleryHandler(&mockGalleryService{})

	// No body, no Content-Type — simulates a POST with no file selected.
	req := httptest.NewRequest(http.MethodPost, "/api/v1/posts/abc123/images", nil)
	req = withIDParam(req, "abc123")
	rec := httptest.NewRecorder()

	h.UploadImage(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

// TestGalleryHandler_UploadImage_invalidContentType tests that the handler
// rejects non-image files before uploading them to S3.
//
// Why validate content-type?
// Without this check, an attacker could upload a .php or .html file and
// potentially trick other parts of the system into executing it. We only
// allow image/* content types: jpeg, png, webp, gif.
// The handler must return 400 so the client knows the file type was wrong,
// not a server error.
func TestGalleryHandler_UploadImage_invalidContentType(t *testing.T) {
	h := NewGalleryHandler(&mockGalleryService{})

	req := newImageUploadRequest(t, "text/plain", []byte("notanimage"))
	req = withIDParam(req, "abc123")
	rec := httptest.NewRecorder()

	h.UploadImage(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

// TestGalleryHandler_UploadImage_serviceError tests the case where S3 or the DB
// fails after the handler has already validated the request.
//
// The handler must return 500 Internal Server Error and must NOT leak the
// internal error message to the client (the real handler will log it server-side
// and only send a generic "upload failed" message).
func TestGalleryHandler_UploadImage_serviceError(t *testing.T) {
	svc := &mockGalleryService{err: errors.New("s3 unavailable")}
	h := NewGalleryHandler(svc)

	req := newImageUploadRequest(t, "image/jpeg", []byte("fakeimagecontent"))
	req = withIDParam(req, "abc123")
	rec := httptest.NewRecorder()

	h.UploadImage(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}
