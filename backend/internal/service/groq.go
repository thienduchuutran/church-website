package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// groqMessage is the message format for the Groq chat completion API.
type groqMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// groqChatRequest is the request body for Groq's chat completions endpoint.
type groqChatRequest struct {
	Model       string         `json:"model"`
	Messages    []groqMessage  `json:"messages"`
	Temperature float64        `json:"temperature"`
	MaxTokens   int            `json:"max_tokens"`
}

// groqChoice is a single completion choice in the API response.
type groqChoice struct {
	Message groqMessage `json:"message"`
}

// groqChatResponse is the response from Groq's chat completions endpoint.
type groqChatResponse struct {
	Choices []groqChoice `json:"choices"`
	Error   *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// GroqClient is a thin HTTP wrapper around Groq's OpenAI-compatible chat API.
// It keeps the LLM call isolated from business logic so the service layer
// can focus on RAG orchestration without caring about HTTP details.
type GroqClient struct {
	apiKey     string
	model      string
	httpClient *http.Client
}

// NewGroqClient creates a client that talks to Groq's inference API.
// The model defaults to llama-3.3-70b-versatile if empty.
func NewGroqClient(apiKey string) *GroqClient {
	return &GroqClient{
		apiKey: apiKey,
		model:  "llama-3.3-70b-versatile",
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// ChatCompletion sends a chat completion request to Groq and returns the
// assistant's response text. Temperature controls creativity (0.0–1.0).
func (c *GroqClient) ChatCompletion(ctx context.Context, messages []groqMessage, temperature float64) (string, error) {
	reqBody := groqChatRequest{
		Model:       c.model,
		Messages:    messages,
		Temperature: temperature,
		MaxTokens:   1024,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal groq request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.groq.com/openai/v1/chat/completions",
		bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("create groq request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("groq api call: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read groq response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("groq api error (status %d): %s", resp.StatusCode, string(respBytes))
	}

	var groqResp groqChatResponse
	if err := json.Unmarshal(respBytes, &groqResp); err != nil {
		return "", fmt.Errorf("unmarshal groq response: %w", err)
	}

	if groqResp.Error != nil {
		return "", fmt.Errorf("groq api error: %s", groqResp.Error.Message)
	}

	if len(groqResp.Choices) == 0 {
		return "", fmt.Errorf("groq returned no choices")
	}

	return groqResp.Choices[0].Message.Content, nil
}
