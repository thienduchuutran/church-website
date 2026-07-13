package discord

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// Discord globally rate-limits by SOURCE IP, and shared cloud-host egress IPs
// (Render's free tier) get blocked collectively. When DISCORD_PROXY_BASE is set,
// every webhook request is routed through that base (a Cloudflare Worker with a
// clean egress IP) as a transparent same-path forward instead of hitting
// discord.com directly. DISCORD_PROXY_SECRET is a shared key the proxy checks so
// it can't be used as an open Discord relay. Both unset in local dev, where the
// home IP talks to Discord directly.
const (
	proxyBaseEnv = "DISCORD_PROXY_BASE"
	proxyKeyEnv  = "DISCORD_PROXY_SECRET"
)

// proxied rewrites a discord.com webhook URL to go through DISCORD_PROXY_BASE,
// preserving the path so the proxy is a transparent forwarder (callers still
// append "?wait=true" or "/messages/{id}" afterwards). Returns the URL unchanged
// when no proxy is configured.
func proxied(webhookURL string) (string, error) {
	base := strings.TrimRight(os.Getenv(proxyBaseEnv), "/")
	if base == "" {
		return webhookURL, nil
	}
	u, err := url.Parse(webhookURL)
	if err != nil {
		return "", fmt.Errorf("parse webhook url: %w", err)
	}
	return base + u.RequestURI(), nil
}

// setProxyAuth attaches the shared secret the proxy validates. No-op when no
// secret is configured, so a direct-to-Discord request stays clean.
func setProxyAuth(req *http.Request) {
	if key := os.Getenv(proxyKeyEnv); key != "" {
		req.Header.Set("X-Webhook-Proxy-Key", key)
	}
}

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

	target, err := proxied(webhookURL)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequest(http.MethodPost, target+"?wait=true", body)
	if err != nil {
		return "", fmt.Errorf("build send request: %w", err)
	}
	req.Header.Set("Content-Type", contentType)
	setProxyAuth(req)

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

	target, err := proxied(webhookURL)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPatch, target+"/messages/"+messageID, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build edit request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	setProxyAuth(req)

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
	target, err := proxied(webhookURL)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodDelete, target+"/messages/"+messageID, nil)
	if err != nil {
		return fmt.Errorf("build delete request: %w", err)
	}
	setProxyAuth(req)

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
