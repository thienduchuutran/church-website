package discord

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFilesFromURLs_downloadsAndSkipsFailures(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/a.png":
			w.Header().Set("Content-Type", "image/png")
			w.Write([]byte("PNGDATA"))
		case "/b.jpg":
			w.Header().Set("Content-Type", "image/jpeg")
			w.Write([]byte("JPEGDATA"))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	// The middle URL 404s and must be skipped, not fatal.
	files := FilesFromURLs([]string{srv.URL + "/a.png", srv.URL + "/missing.png", srv.URL + "/b.jpg"})
	if len(files) != 2 {
		t.Fatalf("got %d files, want 2 (the 404 should be skipped)", len(files))
	}
	if files[0].Filename != "a.png" || string(files[0].Data) != "PNGDATA" || files[0].ContentType != "image/png" {
		t.Errorf("file0 = %+v", files[0])
	}
	if files[1].Filename != "b.jpg" || string(files[1].Data) != "JPEGDATA" {
		t.Errorf("file1 = %+v", files[1])
	}
}

func TestFilesFromURLs_capsAtMaxAttachments(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("x"))
	}))
	defer srv.Close()

	var urls []string
	for i := 0; i < MaxAttachments+5; i++ {
		urls = append(urls, srv.URL+"/img.png")
	}
	if got := len(FilesFromURLs(urls)); got != MaxAttachments {
		t.Errorf("got %d files, want cap of %d", got, MaxAttachments)
	}
}

func TestFilenameFromURL(t *testing.T) {
	cases := map[string]string{
		"https://r2.example/pub/images/body/123.png": "123.png",
		"https://r2.example/":                        "image",
	}
	for in, want := range cases {
		if got := filenameFromURL(in); got != want {
			t.Errorf("filenameFromURL(%q) = %q, want %q", in, got, want)
		}
	}
}
