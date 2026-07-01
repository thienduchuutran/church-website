package discord

import (
	"fmt"
	"io"
	"net/url"
	"path"
)

// MaxAttachments is Discord's hard limit on files in a single message.
const MaxAttachments = 10

// maxAttachmentBytes bounds each downloaded image so one huge file can't blow up
// memory. Comfortably above the editor upload cap (10 MB).
const maxAttachmentBytes = 10 << 20

// FilesFromURLs downloads images from their public URLs into attachments ready
// to send with a webhook message. This is how a post's inline body images reach
// Discord: option (a) - they render after the text, since Discord cannot
// interleave images between paragraphs like the website does.
//
// Capped at MaxAttachments (extra images are dropped - the website keeps them
// all). Best-effort per URL: an image that fails to download is skipped rather
// than failing the whole post's delivery.
func FilesFromURLs(urls []string) []FileAttachment {
	if len(urls) > MaxAttachments {
		urls = urls[:MaxAttachments]
	}
	var files []FileAttachment
	for _, u := range urls {
		f, err := downloadAttachment(u)
		if err != nil {
			continue
		}
		files = append(files, f)
	}
	return files
}

func downloadAttachment(rawURL string) (FileAttachment, error) {
	resp, err := httpClient.Get(rawURL)
	if err != nil {
		return FileAttachment{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return FileAttachment{}, fmt.Errorf("download %s: status %d", rawURL, resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxAttachmentBytes))
	if err != nil {
		return FileAttachment{}, fmt.Errorf("read %s: %w", rawURL, err)
	}
	return FileAttachment{
		Filename:    filenameFromURL(rawURL),
		ContentType: resp.Header.Get("Content-Type"),
		Data:        data,
	}, nil
}

// filenameFromURL derives a display filename from the URL path. Discord needs a
// filename per attachment; the exact value is cosmetic, so a safe fallback is
// fine when the URL has no usable basename.
func filenameFromURL(rawURL string) string {
	if parsed, err := url.Parse(rawURL); err == nil {
		if base := path.Base(parsed.Path); base != "" && base != "/" && base != "." {
			return base
		}
	}
	return "image"
}
