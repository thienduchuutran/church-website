package discord

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

// OutboundMessage is everything needed to post (or edit) one webhook message:
// the rendered content plus the per-message identity and mention policy.
type OutboundMessage struct {
	Content         string
	Username        string
	AvatarURL       string
	AllowedMentions AllowedMentions
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
	body, err := json.Marshal(sendPayload{
		Content:         msg.Content,
		Username:        msg.Username,
		AvatarURL:       msg.AvatarURL,
		AllowedMentions: normalizeMentions(msg.AllowedMentions),
	})
	if err != nil {
		return "", fmt.Errorf("marshal send payload: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, webhookURL+"?wait=true", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("build send request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("send webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("discord send returned status %d", resp.StatusCode)
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
		return fmt.Errorf("discord edit returned status %d", resp.StatusCode)
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
		return fmt.Errorf("discord delete returned status %d", resp.StatusCode)
	}
	return nil
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
