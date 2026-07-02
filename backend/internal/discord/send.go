package discord

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
)

// OutboundMessage is everything needed to post (or edit) one webhook message:
// the rendered content plus the per-message identity, mention policy, and any
// image attachments (rendered by Discord after the text - option a).
type OutboundMessage struct {
	Content         string
	Username        string
	AvatarURL       string
	AllowedMentions AllowedMentions
	Files           []FileAttachment
}

// FileAttachment is one file (an inline post image) sent with a message.
type FileAttachment struct {
	Filename    string
	ContentType string
	Data        []byte
}

// sendPayload is the JSON body for a webhook POST. allowed_mentions is always
// present (never omitempty) so the empty-array default reliably suppresses
// pings; username/avatar are omitempty because edits must not send them.
type sendPayload struct {
	Content         string          `json:"content"`
	Username        string          `json:"username,omitempty"`
	AvatarURL       string          `json:"avatar_url,omitempty"`
	AllowedMentions AllowedMentions `json:"allowed_mentions"`
}

// editPayload omits identity entirely: Discord ignores username/avatar on an
// edit (identity is fixed at send time), so sending them would be misleading.
type editPayload struct {
	Content         string          `json:"content"`
	AllowedMentions AllowedMentions `json:"allowed_mentions"`
}

// sentMessage is the slice of Discord's send response we keep: the message id,
// stored on the post so a later edit/delete can target this exact message.
type sentMessage struct {
	ID string `json:"id"`
}

// Send posts a new message through the webhook and returns Discord's message id.
//
// The "?wait=true" query is required: without it Discord answers 204 with no
// body, so we would never learn the message id and could never edit or delete
// the message afterwards.
func Send(webhookURL string, msg OutboundMessage) (string, error) {
	body, contentType, err := buildSendBody(msg)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest(http.MethodPost, webhookURL+"?wait=true", body)
	if err != nil {
		return "", fmt.Errorf("build send request: %w", err)
	}
	req.Header.Set("Content-Type", contentType)

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("send webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", statusError("send", resp)
	}

	var sent sentMessage
	if err := json.NewDecoder(resp.Body).Decode(&sent); err != nil {
		return "", fmt.Errorf("decode send response: %w", err)
	}
	if sent.ID == "" {
		return "", fmt.Errorf("discord send returned no message id (was ?wait=true honored?)")
	}
	return sent.ID, nil
}

// buildSendBody produces the request body + Content-Type for a send: a plain
// JSON body when there are no files, or multipart/form-data (payload_json plus
// files[n]) when the message carries image attachments.
func buildSendBody(msg OutboundMessage) (io.Reader, string, error) {
	if len(msg.Files) == 0 {
		b, err := json.Marshal(sendPayload{
			Content:         msg.Content,
			Username:        msg.Username,
			AvatarURL:       msg.AvatarURL,
			AllowedMentions: normalizeMentions(msg.AllowedMentions),
		})
		if err != nil {
			return nil, "", fmt.Errorf("marshal send payload: %w", err)
		}
		return bytes.NewReader(b), "application/json", nil
	}
	return buildMultipart(msg)
}

// buildMultipart assembles a multipart body: a payload_json part carrying the
// message fields plus an attachments manifest, and one files[i] part per image.
// Discord matches each manifest entry's id to the files[i] index.
func buildMultipart(msg OutboundMessage) (io.Reader, string, error) {
	type attachmentMeta struct {
		ID       int    `json:"id"`
		Filename string `json:"filename"`
	}
	payload := struct {
		Content         string           `json:"content"`
		Username        string           `json:"username,omitempty"`
		AvatarURL       string           `json:"avatar_url,omitempty"`
		AllowedMentions AllowedMentions  `json:"allowed_mentions"`
		Attachments     []attachmentMeta `json:"attachments"`
	}{
		Content:         msg.Content,
		Username:        msg.Username,
		AvatarURL:       msg.AvatarURL,
		AllowedMentions: normalizeMentions(msg.AllowedMentions),
	}
	for i, f := range msg.Files {
		payload.Attachments = append(payload.Attachments, attachmentMeta{ID: i, Filename: f.Filename})
	}
	pj, err := json.Marshal(payload)
	if err != nil {
		return nil, "", fmt.Errorf("marshal payload_json: %w", err)
	}

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	if err := mw.WriteField("payload_json", string(pj)); err != nil {
		return nil, "", err
	}
	for i, f := range msg.Files {
		part, err := mw.CreateFormFile(fmt.Sprintf("files[%d]", i), f.Filename)
		if err != nil {
			return nil, "", err
		}
		if _, err := part.Write(f.Data); err != nil {
			return nil, "", err
		}
	}
	if err := mw.Close(); err != nil {
		return nil, "", err
	}
	return &buf, mw.FormDataContentType(), nil
}

// Edit updates the content of a message previously sent through this webhook.
// Only content + allowed_mentions can change; identity stays as originally sent.
func Edit(webhookURL, messageID string, msg OutboundMessage) error {
	body, err := json.Marshal(editPayload{
		Content:         msg.Content,
		AllowedMentions: normalizeMentions(msg.AllowedMentions),
	})
	if err != nil {
		return fmt.Errorf("marshal edit payload: %w", err)
	}

	req, err := http.NewRequest(http.MethodPatch, webhookURL+"/messages/"+messageID, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build edit request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("edit webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return statusError("edit", resp)
	}
	return nil
}

// Delete removes a message previously sent through this webhook. A 404 is
// treated as success: the message is already gone, which is the desired end
// state, so re-deleting (or deleting a manually-removed message) is a no-op.
func Delete(webhookURL, messageID string) error {
	req, err := http.NewRequest(http.MethodDelete, webhookURL+"/messages/"+messageID, nil)
	if err != nil {
		return fmt.Errorf("build delete request: %w", err)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("delete webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return statusError("delete", resp)
	}
	return nil
}

// statusError builds the error for a non-2xx webhook response, reading a capped
// slice of the body plus the Retry-After header. Discord's 429 comes in two very
// different shapes and the status code alone can't tell them apart: a transient
// per-route bucket limit (JSON body, tiny retry_after, worth retrying) versus a
// Cloudflare IP-level block (HTML "error 1015" body, large Retry-After, a retry
// won't help). Capturing the body + header is what makes that distinction - and
// diagnosing prod-only 429s - possible. The body is capped so a huge HTML error
// page can't bloat the log line.
func statusError(action string, resp *http.Response) error {
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	snippet := strings.Join(strings.Fields(string(body)), " ")
	return fmt.Errorf("discord %s returned status %d (retry_after=%q body=%q)",
		action, resp.StatusCode, resp.Header.Get("Retry-After"), snippet)
}

// normalizeMentions guards against a nil Parse slice marshaling to JSON null
// (which Discord reads as "ping by default"). Callers should use NoMentions(),
// but a zero-value AllowedMentions{} passed by mistake is corrected here.
func normalizeMentions(am AllowedMentions) AllowedMentions {
	if am.Parse == nil {
		am.Parse = []string{}
	}
	return am
}
