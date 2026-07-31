package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

// --- Fakes -----------------------------------------------------------------

// fakePlaceStore is an in-memory calendar_places. It enforces the one rule the
// real UPDATE enforces in SQL - a name written by the model never overwrites a
// name written by an admin - because that rule is the whole reason the column
// exists and a fake that ignored it would make the test below pass vacuously.
type fakePlaceStore struct {
	byKey   map[string]*model.CalendarPlace
	names   []string
	creates int
	updates int
	nextID  int
	failGet error
}

func newFakeStore() *fakePlaceStore {
	return &fakePlaceStore{byKey: map[string]*model.CalendarPlace{}}
}

func (f *fakePlaceStore) GetPlaceByKey(_ context.Context, key string) (*model.CalendarPlace, error) {
	if f.failGet != nil {
		return nil, f.failGet
	}
	if p, ok := f.byKey[key]; ok {
		return p, nil
	}
	return nil, model.ErrNotFound
}

func (f *fakePlaceStore) CreatePlaceIfAbsent(_ context.Context, key, address, name string) (*model.CalendarPlace, bool, error) {
	if p, ok := f.byKey[key]; ok {
		return p, false, nil // conflict: someone else owns this address
	}
	f.creates++
	f.nextID++
	p := &model.CalendarPlace{
		ID:         string(rune('a' + f.nextID - 1)),
		Address:    address,
		Name:       name,
		NameSource: model.PlaceNameSourceAI,
	}
	f.byKey[key] = p
	return p, true, nil
}

func (f *fakePlaceStore) UpdatePlaceNameFromAI(_ context.Context, id, name string) error {
	for _, p := range f.byKey {
		if p.ID != id {
			continue
		}
		// Mirrors `WHERE ... AND name_source = 'ai'`: a no-op, not an error.
		if p.NameSource != model.PlaceNameSourceAI {
			return nil
		}
		p.Name = name
		f.updates++
	}
	return nil
}

func (f *fakePlaceStore) ListPlaceNames(context.Context) ([]string, error) { return f.names, nil }

func (f *fakePlaceStore) placeNamed(id string) string {
	for _, p := range f.byKey {
		if p.ID == id {
			return p.Name
		}
	}
	return ""
}

// fakeNamer counts calls, which is what most of these tests actually assert on.
type fakeNamer struct {
	calls    int
	lastText string
	reply    string
	err      error
}

func (f *fakeNamer) Complete(_ context.Context, _, userText string, _ int) (string, error) {
	f.calls++
	f.lastText = userText
	return f.reply, f.err
}

func newResolver(store *fakePlaceStore, namer PlaceNamer) *placeResolver {
	return &placeResolver{store: store, namer: namer}
}

// --- The behaviour that costs money ----------------------------------------

// The economic premise of the whole feature: the model is asked about an
// address once, ever. If this regresses, every event at the church spends an
// API call and the church can end up named differently each time.
func TestPlaceResolver_KnownAddressIsNotResolvedTwice(t *testing.T) {
	store := newFakeStore()
	namer := &fakeNamer{reply: "Church"}
	r := newResolver(store, namer)
	ctx := context.Background()

	addr1 := "101 Main St, Saugus, MA 01906"
	id1, isNew, err := r.resolve(ctx, &addr1, "Saturday BBS Church 7pm")
	if err != nil {
		t.Fatalf("first resolve: %v", err)
	}
	if !isNew {
		t.Fatal("first sighting of an address should report isNew=true")
	}

	// A different event, a different wording of the same address.
	addr2 := "101 main street, saugus, massachusetts"
	id2, isNew, err := r.resolve(ctx, &addr2, "Church Clean up/renovation")
	if err != nil {
		t.Fatalf("second resolve: %v", err)
	}
	if isNew {
		t.Error("second event at a known address reported isNew=true - this is the wasted model call")
	}
	if *id1 != *id2 {
		t.Errorf("two spellings of one address produced places %q and %q", *id1, *id2)
	}
	if store.creates != 1 {
		t.Errorf("created %d place rows for one address, want 1", store.creates)
	}
}

// Only resolve() decides whether naming is warranted; it must never call the
// model itself, or the admin's save would block on Gemini.
func TestPlaceResolver_ResolveNeverCallsTheModel(t *testing.T) {
	store := newFakeStore()
	namer := &fakeNamer{reply: "Church"}
	r := newResolver(store, namer)

	addr := "101 Main St, Saugus MA"
	if _, _, err := r.resolve(context.Background(), &addr, "Church Service"); err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if namer.calls != 0 {
		t.Errorf("resolve made %d model calls, want 0 - saving an event must not wait on Gemini", namer.calls)
	}
}

// --- The behaviour that loses an admin's work ------------------------------

// An admin renamed the place. A naming call still in flight from another event
// must not undo that decision.
func TestPlaceResolver_AdminRenameSurvivesALaterModelCall(t *testing.T) {
	store := newFakeStore()
	namer := &fakeNamer{reply: "Main Street Building"}
	r := newResolver(store, namer)
	ctx := context.Background()

	addr := "101 Main St, Saugus MA"
	id, _, err := r.resolve(ctx, &addr, "Church Service")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}

	// The admin fixes the name.
	store.byKey[model.NormalizeAddressKey(addr)].Name = "Church"
	store.byKey[model.NormalizeAddressKey(addr)].NameSource = model.PlaceNameSourceAdmin

	if err := r.name(ctx, *id, addr, "Church Service"); err != nil {
		t.Fatalf("name: %v", err)
	}
	if got := store.placeNamed(*id); got != "Church" {
		t.Errorf("admin rename was overwritten: place is now %q, want %q", got, "Church")
	}
}

// --- Failure degrades to the provisional name ------------------------------

func TestPlaceResolver_FailedModelCallLeavesProvisionalName(t *testing.T) {
	store := newFakeStore()
	namer := &fakeNamer{err: errors.New("gemini 503")}
	r := newResolver(store, namer)
	ctx := context.Background()

	addr := "1414 Plank Road, Hooversville, PA 15936"
	id, _, err := r.resolve(ctx, &addr, "Youth Camp")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if got := store.placeNamed(*id); got != "Youth Camp" {
		t.Fatalf("provisional name = %q, want the event title", got)
	}

	if err := r.name(ctx, *id, addr, "Youth Camp"); err == nil {
		t.Error("name() swallowed a model failure; the caller needs it to log")
	}
	if got := store.placeNamed(*id); got != "Youth Camp" {
		t.Errorf("a failed naming call changed the name to %q; it must stay provisional", got)
	}
	if store.updates != 0 {
		t.Errorf("a failed naming call wrote %d updates, want 0", store.updates)
	}
}

// No API key configured: places still resolve and still dedupe.
func TestPlaceResolver_WithoutANamerPlacesStillDedupe(t *testing.T) {
	store := newFakeStore()
	r := newResolver(store, nil)
	ctx := context.Background()

	a, b := "45 Oak Ave, Lynn MA", "45 Oak Avenue, Lynn, Massachusetts"
	idA, _, err := r.resolve(ctx, &a, "Prayer Night")
	if err != nil {
		t.Fatalf("resolve a: %v", err)
	}
	idB, _, err := r.resolve(ctx, &b, "Bible Study")
	if err != nil {
		t.Fatalf("resolve b: %v", err)
	}
	if *idA != *idB {
		t.Error("dedupe stopped working when no namer was configured")
	}
	if err := r.name(ctx, *idA, a, "Prayer Night"); err != nil {
		t.Errorf("name() with a nil namer should no-op, got %v", err)
	}
}

// --- Addresses that are not addresses --------------------------------------

func TestPlaceResolver_NoAddressMeansNoPlace(t *testing.T) {
	store := newFakeStore()
	r := newResolver(store, &fakeNamer{reply: "Church"})
	ctx := context.Background()

	blank, punct := "   ", ",,, ..."
	for _, addr := range []*string{nil, &blank, &punct} {
		id, isNew, err := r.resolve(ctx, addr, "Girls' Day")
		if err != nil {
			t.Fatalf("resolve(%v): %v", addr, err)
		}
		if id != nil || isNew {
			t.Errorf("resolve(%v) produced a place; an event without a location should have none", addr)
		}
	}
	if store.creates != 0 {
		t.Errorf("created %d places from unusable addresses, want 0", store.creates)
	}
}

// A lookup failure must not be mistaken for "this address is new" - that would
// insert a duplicate place on every transient database error.
func TestPlaceResolver_LookupFailureIsNotTreatedAsNew(t *testing.T) {
	store := newFakeStore()
	store.failGet = errors.New("connection reset")
	r := newResolver(store, &fakeNamer{})

	addr := "101 Main St, Saugus MA"
	if _, _, err := r.resolve(context.Background(), &addr, "Church Service"); err == nil {
		t.Error("a store failure should surface as an error, not a silent new place")
	}
	if store.creates != 0 {
		t.Errorf("created %d places despite a failed lookup, want 0", store.creates)
	}
}

// --- Answer handling -------------------------------------------------------

// The answer lands on a public page and in the exported PNG, so a chatty or
// malformed one must not reach either.
func TestSanitizePlaceName(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want string
		ok   bool
	}{
		{"plain", "Church", "Church", true},
		{"surrounding whitespace", "  Chris & Sebs  ", "Chris & Sebs", true},
		{"quoted", `"Church"`, "Church", true},
		{"smart quoted", "“MST House”", "MST House", true},
		{"trailing period", "Youth Camp.", "Youth Camp", true},
		{"internal whitespace collapses", "Chris   &\tSebs", "Chris & Sebs", true},
		{"explanation on later lines", "Church\n\nThis is the church building.", "Church", true},
		{"leading blank line", "\n\nChurch", "Church", true},
		{"apostrophe survives", "MST's House", "MST's House", true},
		{"vietnamese survives", "Nhà Anh Chị Hùng", "Nhà Anh Chị Hùng", true},

		{"empty", "", "", false},
		{"whitespace only", "   \n\t ", "", false},
		{"punctuation only", `"."`, "", false},
		{"a sentence is not a label", "The place is the church building on Main Street in Saugus.", "", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, ok := sanitizePlaceName(c.raw)
			if ok != c.ok {
				t.Fatalf("sanitizePlaceName(%q) ok = %v, want %v (got %q)", c.raw, ok, c.ok, got)
			}
			if ok && got != c.want {
				t.Errorf("sanitizePlaceName(%q) = %q, want %q", c.raw, got, c.want)
			}
		})
	}
}

// The rune cap must not cut a Vietnamese name mid-character.
func TestProvisionalPlaceName(t *testing.T) {
	if got := provisionalPlaceName("  Youth   Camp  "); got != "Youth Camp" {
		t.Errorf("provisionalPlaceName = %q, want %q", got, "Youth Camp")
	}
	if got := provisionalPlaceName(""); got != "Location" {
		t.Errorf("empty title should fall back to a printable label, got %q", got)
	}
	long := provisionalPlaceName(strings.Repeat("Đêm ", 40))
	if n := len([]rune(long)); n > maxPlaceNameLen {
		t.Errorf("provisional name is %d runes, want <= %d", n, maxPlaceNameLen)
	}
	if !strings.HasPrefix(long, "Đêm") {
		t.Errorf("truncation mangled the Vietnamese text: %q", long)
	}
}

// The known-names list is context for consistency; the prompt has to actually
// carry it, and it must stay bounded.
func TestBuildPlaceNamePrompt(t *testing.T) {
	got := buildPlaceNamePrompt("Saturday BBS Church 7pm", "101 Main St, Saugus MA", []string{"Church", "Chris & Sebs"})
	for _, want := range []string{"Saturday BBS Church 7pm", "101 Main St, Saugus MA", "Church", "Chris & Sebs"} {
		if !strings.Contains(got, want) {
			t.Errorf("prompt is missing %q:\n%s", want, got)
		}
	}

	many := make([]string, 30)
	for i := range many {
		many[i] = "Venue" + string(rune('A'+i%26))
	}
	bounded := buildPlaceNamePrompt("T", "A", many)
	// Count the list entries, not the word "Place" - the header says "Places
	// already in use:" and would inflate a naive substring count by one.
	if n := strings.Count(bounded, "Venue"); n > 12 {
		t.Errorf("prompt carried %d known names, want at most 12", n)
	}

	// No known names yet - the prompt must not lead with an empty list.
	first := buildPlaceNamePrompt("Youth Camp", "1414 Plank Road", nil)
	if strings.Contains(first, "already in use") {
		t.Errorf("first-ever place got an empty known-names header:\n%s", first)
	}
}

// name() sends both halves of the question. Getting this wrong is invisible in
// production - the model just answers worse.
func TestPlaceResolver_NamePromptCarriesTitleAndAddress(t *testing.T) {
	store := newFakeStore()
	namer := &fakeNamer{reply: "Chris & Sebs"}
	r := newResolver(store, namer)
	ctx := context.Background()

	addr := "39 Bridle Ridge Dr, North Grafton, MA 01536"
	id, _, err := r.resolve(ctx, &addr, "Friday BBS Chris & Sebs")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if err := r.name(ctx, *id, addr, "Friday BBS Chris & Sebs"); err != nil {
		t.Fatalf("name: %v", err)
	}
	if namer.calls != 1 {
		t.Fatalf("made %d model calls, want 1", namer.calls)
	}
	if !strings.Contains(namer.lastText, "Friday BBS Chris & Sebs") || !strings.Contains(namer.lastText, addr) {
		t.Errorf("prompt did not carry both title and address:\n%s", namer.lastText)
	}
	if got := store.placeNamed(*id); got != "Chris & Sebs" {
		t.Errorf("place name = %q, want %q", got, "Chris & Sebs")
	}
}
