package service

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/thienduchuutran/church-website/backend/internal/model"
	"github.com/thienduchuutran/church-website/backend/internal/repository"
)

// AssistantService orchestrates the RAG pipeline: retrieve church content from
// the database, build a prompt with context, and call the LLM for synthesis.
// This is the brain of the chatbot — analogous to ask_agent() + stream_synthesis()
// from the LLM-Project's agent.py.
type AssistantService struct {
	repo  *repository.AssistantRepository
	groq  *GroqClient

	// Simple per-IP rate limiter: maps IP → last request timestamps.
	// Protects against abuse and Groq API exhaustion.
	rateMu    sync.Mutex
	rateMap   map[string][]time.Time
	rateLimit int           // max requests per window
	rateWindow time.Duration // rolling window
}

// NewAssistantService creates a new assistant service wired to the database and Groq.
func NewAssistantService(repo *repository.AssistantRepository, groq *GroqClient) *AssistantService {
	return &AssistantService{
		repo:       repo,
		groq:       groq,
		rateMap:    make(map[string][]time.Time),
		rateLimit:  10,
		rateWindow: 1 * time.Minute,
	}
}

// Chat processes a visitor's question through the RAG pipeline:
// 1. Extract keywords from the question
// 2. Search posts, calendar events, and page content
// 3. Also fetch upcoming events and recent announcements for general context
// 4. Build a system prompt with all retrieved context
// 5. Call Groq with the system prompt, conversation history, and user message
// 6. Return the answer with source references
func (s *AssistantService) Chat(ctx context.Context, req model.AssistantChatRequest) (model.AssistantChatResponse, error) {
	// Extract keywords for searching.
	keywords := extractKeywords(req.Message)

	// Gather context from all sources in parallel-ish fashion.
	var allSources []model.AssistantSource
	var allContext []string

	// Always fetch some upcoming events and recent announcements for general context.
	upcomingSources, upcomingCtx, err := s.repo.GetUpcomingEvents(ctx, 5)
	if err != nil {
		log.Printf("assistant: error fetching upcoming events: %v", err)
	} else {
		allSources = append(allSources, upcomingSources...)
		allContext = append(allContext, upcomingCtx...)
	}

	upcomingCalSources, upcomingCalCtx, err := s.repo.GetUpcomingCalendarEvents(ctx, 5)
	if err != nil {
		log.Printf("assistant: error fetching upcoming calendar events: %v", err)
	} else {
		allSources = append(allSources, upcomingCalSources...)
		allContext = append(allContext, upcomingCalCtx...)
	}

	announceSources, announceCtx, err := s.repo.GetRecentAnnouncements(ctx, 3)
	if err != nil {
		log.Printf("assistant: error fetching announcements: %v", err)
	} else {
		allSources = append(allSources, announceSources...)
		allContext = append(allContext, announceCtx...)
	}

	// Keyword-based search across all content types.
	if len(keywords) > 0 {
		postSources, postCtx, err := s.repo.SearchPosts(ctx, keywords, 5)
		if err != nil {
			log.Printf("assistant: error searching posts: %v", err)
		} else {
			allSources = append(allSources, postSources...)
			allContext = append(allContext, postCtx...)
		}

		calSources, calCtx, err := s.repo.SearchCalendarEvents(ctx, keywords, 5)
		if err != nil {
			log.Printf("assistant: error searching calendar: %v", err)
		} else {
			allSources = append(allSources, calSources...)
			allContext = append(allContext, calCtx...)
		}

		pageSources, pageCtx, err := s.repo.SearchPageContent(ctx, keywords, 3)
		if err != nil {
			log.Printf("assistant: error searching pages: %v", err)
		} else {
			allSources = append(allSources, pageSources...)
			allContext = append(allContext, pageCtx...)
		}
	}

	// Deduplicate sources by ID.
	allSources = deduplicateSources(allSources)

	// Build the system prompt with retrieved context.
	systemPrompt := buildSystemPrompt(allContext)

	// Build the messages array for the LLM.
	messages := []groqMessage{
		{Role: "system", Content: systemPrompt},
	}

	// Add conversation history (last 6 turns max to stay within context window).
	historyLimit := 6
	if len(req.History) > historyLimit {
		req.History = req.History[len(req.History)-historyLimit:]
	}
	for _, h := range req.History {
		messages = append(messages, groqMessage{Role: h.Role, Content: h.Content})
	}

	// Add the current user message.
	messages = append(messages, groqMessage{Role: "user", Content: req.Message})

	// Call the LLM.
	answer, err := s.groq.ChatCompletion(ctx, messages, 0.3)
	if err != nil {
		return model.AssistantChatResponse{}, fmt.Errorf("groq completion: %w", err)
	}

	return model.AssistantChatResponse{
		Answer:  answer,
		Sources: allSources,
	}, nil
}

// CheckRateLimit returns true if the given IP has exceeded the rate limit.
func (s *AssistantService) CheckRateLimit(ip string) bool {
	s.rateMu.Lock()
	defer s.rateMu.Unlock()

	now := time.Now()
	cutoff := now.Add(-s.rateWindow)

	// Prune expired entries.
	timestamps := s.rateMap[ip]
	valid := timestamps[:0]
	for _, t := range timestamps {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}

	if len(valid) >= s.rateLimit {
		s.rateMap[ip] = valid
		return true // rate limited
	}

	s.rateMap[ip] = append(valid, now)
	return false
}

func buildSystemPrompt(contextSnippets []string) string {
	contextBlock := "No specific church information was found for this query."
	if len(contextSnippets) > 0 {
		contextBlock = strings.Join(contextSnippets, "\n")
	}

	return fmt.Sprintf(`You are the VGOMNE Helper, a friendly and warm AI assistant for the Vietnamese Gospel Outreach Ministry New England (VGOMNE), a Christian & Missionary Alliance church in Saugus, MA.

Your purpose is to help visitors find information about the church: upcoming events, announcements, service times, Bible studies, location, contact information, and general questions about the church community.

Here is the current church information retrieved from the database to help answer the user's query:

%s

INSTRUCTIONS:
- Answer questions warmly and helpfully using ONLY the information provided above.
- If the information needed to answer the question is not in the context above, politely say you don't have that specific information and suggest the visitor contact the church directly or check the website.
- Keep answers concise but informative (2-4 sentences for simple questions, more for complex ones).
- Use a welcoming, community-oriented tone appropriate for a church website.
- You may format your response with simple markdown (bold, bullet points) for readability.
- Do NOT make up information. Do NOT invent events, dates, or details not present in the context.
- Do NOT answer questions unrelated to the church. Politely redirect to church-related topics.
- When listing events or announcements, include dates if available.
- IMPORTANT: Do NOT explain your internal retrieval mechanism, mention the database, or say "I only have access to the specific information retrieved." You represent the church website, which has a wide variety of posts, calendar events, pages, and announcements. If you don't know the answer, just say you couldn't find that specific information on the website.`, contextBlock)
}

// extractKeywords pulls meaningful search terms from a user question.
// Strips common stop words and returns lowercased unique keywords.
func extractKeywords(question string) []string {
	stopWords := map[string]bool{
		"a": true, "an": true, "the": true, "is": true, "are": true,
		"was": true, "were": true, "be": true, "been": true, "being": true,
		"have": true, "has": true, "had": true, "do": true, "does": true,
		"did": true, "will": true, "would": true, "could": true, "should": true,
		"may": true, "might": true, "can": true, "shall": true,
		"i": true, "you": true, "he": true, "she": true, "it": true,
		"we": true, "they": true, "me": true, "him": true, "her": true,
		"us": true, "them": true, "my": true, "your": true, "his": true,
		"its": true, "our": true, "their": true,
		"this": true, "that": true, "these": true, "those": true,
		"what": true, "when": true, "where": true, "which": true, "who": true,
		"whom": true, "how": true, "why": true,
		"and": true, "or": true, "but": true, "not": true, "no": true,
		"if": true, "then": true, "than": true, "so": true, "as": true,
		"of": true, "in": true, "on": true, "at": true, "to": true,
		"for": true, "with": true, "from": true, "by": true, "about": true,
		"up": true, "out": true, "into": true, "through": true,
		"tell": true, "please": true, "thanks": true,
		"hi": true, "hello": true, "hey": true,
	}

	words := strings.Fields(strings.ToLower(question))
	seen := make(map[string]bool)
	var keywords []string
	for _, w := range words {
		// Strip common punctuation.
		w = strings.Trim(w, ".,?!;:\"'()[]{}–—")
		if w == "" || len(w) < 2 || stopWords[w] || seen[w] {
			continue
		}
		seen[w] = true
		keywords = append(keywords, w)
	}
	return keywords
}

// deduplicateSources removes duplicate sources by ID.
func deduplicateSources(sources []model.AssistantSource) []model.AssistantSource {
	seen := make(map[string]bool)
	var unique []model.AssistantSource
	for _, s := range sources {
		if !seen[s.ID] {
			seen[s.ID] = true
			unique = append(unique, s)
		}
	}
	return unique
}
