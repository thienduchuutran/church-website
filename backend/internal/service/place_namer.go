package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// Place resolution: turning the address an admin typed into a named venue.
//
// The Locations strip used to print one row per event with an address, so the
// church appeared once for every event held there. The fix is to treat a place
// as its own thing, and the modelling insight that makes it cheap is that a
// place name is a FUNCTION OF ITS ADDRESS - two different places cannot share
// one. So the model is asked "what is this place called?" exactly once, the
// first time an address appears, and every later event there reuses the answer.
//
// That gives the two properties this file exists to protect:
//   - A known address costs one indexed lookup and zero API calls.
//   - One address can only ever have one name, so the church cannot be "Church"
//     in May and "Church Renovation" in June.

const (
	// PlaceNamePromptKey is the system_prompts row holding the naming prompt.
	// Stored in the database rather than compiled in so it can be tuned in
	// Supabase without a redeploy - the prompt encodes local knowledge (which
	// address is the church building) that will change as the church adds venues.
	PlaceNamePromptKey = "place_name"

	// placeNameMaxTokens is generous for a one-to-four-word answer on purpose.
	// Gemini 2.5 thinks by default and its thinking tokens count against
	// maxOutputTokens, so a budget sized to the visible answer starves it: a
	// 64-token cap once left 1 answer token after 59 thinking tokens, which is
	// how "VBS T-Shirt!" became "Áo" in production. See
	// docs/agents/known-quirks.md. Do not "optimize" this down.
	placeNameMaxTokens = 2048

	// placeNameTimeout bounds the naming call. It runs detached from the admin's
	// save, so the only thing this protects is a goroutine leaking on a hung
	// connection.
	placeNameTimeout = 30 * time.Second

	// maxPlaceNameLen caps what may reach the page, in runes rather than bytes
	// so a Vietnamese name is not cut mid-character. Four words of headroom; the
	// prompt asks for one to four.
	maxPlaceNameLen = 40
)

// PlaceNamer is the slice of the translation engine this file needs: one
// prompted completion, no persistence. *translation.Translator satisfies it.
// An interface so the naming behaviour is testable without an API key.
type PlaceNamer interface {
	Complete(ctx context.Context, promptKey, userText string, maxTokens int) (string, error)
}

// placeStore is the slice of the calendar repository this file needs.
// *repository.CalendarRepository satisfies it; tests supply a fake, which is
// what lets "a known address makes no model call" be an assertion rather than
// a hope.
type placeStore interface {
	GetPlaceByKey(ctx context.Context, addressKey string) (*model.CalendarPlace, error)
	CreatePlaceIfAbsent(ctx context.Context, addressKey, address, name string) (*model.CalendarPlace, bool, error)
	UpdatePlaceNameFromAI(ctx context.Context, id, name string) error
	ListPlaceNames(ctx context.Context) ([]string, error)
}

// placeResolver owns everything about turning a typed address into a place row.
// Split out of CalendarService so its two expensive behaviours - never asking
// the model twice about one address, and never overwriting an admin's rename -
// can be tested without a database or an API key.
type placeResolver struct {
	store placeStore
	// namer is nil when no AI key is configured. Resolution still works; places
	// simply keep their provisional names. Same opt-in degradation as the
	// translation worker.
	namer PlaceNamer
}

// resolve maps a typed address to a venue.
//
// The place itself comes back rather than just its id because every path here
// already holds the row - returning it lets a create response carry its place
// without a second query.
//
// The bool reports whether the place was newly created and therefore still
// carries a provisional name. Callers use it to decide whether to spend a model
// call - it is the difference between the first event at an address and the
// tenth.
//
// A blank or unusable address is not an error: plenty of events have no
// location at all, and they simply get no place.
func (r *placeResolver) resolve(ctx context.Context, address *string, title string) (place *model.CalendarPlace, isNew bool, err error) {
	if address == nil {
		return nil, false, nil
	}
	trimmed := strings.TrimSpace(*address)
	if trimmed == "" {
		return nil, false, nil
	}
	key := model.NormalizeAddressKey(trimmed)
	if key == "" {
		// Punctuation-only input. Storing it would create a place that can never
		// be matched again, since every future lookup normalizes to "" too.
		return nil, false, nil
	}

	existing, err := r.store.GetPlaceByKey(ctx, key)
	if err == nil {
		return existing, false, nil
	}
	if !errors.Is(err, model.ErrNotFound) {
		return nil, false, fmt.Errorf("look up place: %w", err)
	}

	// New address. The provisional name is the event title, so the strip has
	// something printable from the very first render even if the naming call
	// never lands.
	created, ok, err := r.store.CreatePlaceIfAbsent(ctx, key, trimmed, provisionalPlaceName(title))
	if err != nil {
		return nil, false, fmt.Errorf("create place: %w", err)
	}
	if ok {
		return created, true, nil
	}

	// Lost the race to a concurrent save. Adopt the winner's place rather than
	// failing or creating a second row - and report isNew=false so we do not
	// duplicate the naming call it is already making.
	winner, err := r.store.GetPlaceByKey(ctx, key)
	if err != nil {
		return nil, false, fmt.Errorf("re-read place after conflict: %w", err)
	}
	return winner, false, nil
}

// name asks the model what a place is called and stores the answer.
//
// Synchronous, and returns its error, so a test can drive it directly; in
// production CalendarService calls it from a goroutine because an admin saving
// an event must never wait on Gemini, and a Gemini outage must never fail a
// save.
//
// Every failure path leaves the provisional name in place. That is the point of
// seeding one: a bad or missing answer degrades to the event title, never to a
// blank row in the exported calendar.
func (r *placeResolver) name(ctx context.Context, placeID, address, title string) error {
	if r.namer == nil {
		return nil
	}

	// Existing names are context, not a requirement - a failure to read them
	// costs consistency, not the naming call.
	known, err := r.store.ListPlaceNames(ctx)
	if err != nil {
		log.Printf("place naming: could not load existing names (continuing): %v", err)
		known = nil
	}

	raw, err := r.namer.Complete(ctx, PlaceNamePromptKey, buildPlaceNamePrompt(title, address, known), placeNameMaxTokens)
	if err != nil {
		return fmt.Errorf("place naming call: %w", err)
	}
	clean, ok := sanitizePlaceName(raw)
	if !ok {
		return fmt.Errorf("place naming: unusable answer %q", truncateForLog(raw))
	}
	if err := r.store.UpdatePlaceNameFromAI(ctx, placeID, clean); err != nil {
		return fmt.Errorf("store place name: %w", err)
	}
	log.Printf("place_named id=%s name=%q from_title=%q", placeID, clean, title)
	return nil
}

// buildPlaceNamePrompt renders the user half of the naming call. The system
// half lives in system_prompts and carries the rules and examples.
//
// Known names are included so a second venue is named in the vocabulary the
// congregation already reads, and so a re-worded address for a place that
// somehow escaped normalization still lands on the existing label.
func buildPlaceNamePrompt(title, address string, known []string) string {
	var b strings.Builder
	if len(known) > 0 {
		// Bounded: this is context, and a church with fifty venues does not need
		// to send all fifty on every call.
		if len(known) > 12 {
			known = known[:12]
		}
		b.WriteString("Places already in use: ")
		b.WriteString(strings.Join(known, ", "))
		b.WriteString("\n\n")
	}
	b.WriteString("Title: ")
	b.WriteString(strings.TrimSpace(title))
	b.WriteString(" | Address: ")
	b.WriteString(strings.TrimSpace(address))
	return b.String()
}

// sanitizePlaceName reduces a model answer to something safe to print, or
// reports that it is unusable.
//
// This runs because the answer lands on a public page and inside the PNG shared
// to Discord. callGemini already guarantees the text is complete rather than
// truncated; it guarantees nothing about it being sensible. A model that
// explains itself, answers in a sentence, or wraps the name in quotes must not
// put any of that on the calendar.
func sanitizePlaceName(raw string) (string, bool) {
	// First non-empty line only - a chatty answer puts its explanation on the
	// lines after the name.
	name := ""
	for _, line := range strings.Split(raw, "\n") {
		if s := strings.TrimSpace(line); s != "" {
			name = s
			break
		}
	}

	name = strings.Trim(name, `"'“”‘’ `)
	// Collapse internal whitespace so a stray tab or double space cannot make
	// two answers for one place look different.
	name = strings.Join(strings.Fields(name), " ")
	// A trailing period reads as prose, not a label. Other punctuation is left
	// alone - "Chris & Sebs" and "MST's House" are correct as written.
	name = strings.TrimRight(name, ".:;,")

	if name == "" {
		return "", false
	}
	if len([]rune(name)) > maxPlaceNameLen {
		return "", false
	}
	return name, true
}

// provisionalPlaceName is what a place is called between being created and
// being named by the model - the event title, trimmed to the same ceiling.
// Deliberately not a placeholder like "Unnamed": if the model never answers,
// this is what the congregation reads, and an event title is a fair guess at
// where the event is.
func provisionalPlaceName(title string) string {
	name := strings.Join(strings.Fields(title), " ")
	if name == "" {
		return "Location"
	}
	if r := []rune(name); len(r) > maxPlaceNameLen {
		return strings.TrimSpace(string(r[:maxPlaceNameLen]))
	}
	return name
}

// truncateForLog keeps a rejected model answer out of the logs at full length.
func truncateForLog(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > 80 {
		return string(r[:80]) + "..."
	}
	return s
}
