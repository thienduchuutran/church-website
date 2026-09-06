# Go primer, anchored to this codebase

A reference for the Go language, where every concept points at a real line in
`backend/`. Read a section when [README.md](README.md) tells you to, or look
things up here as you read.

This is deliberately **not** a tutorial. It is the set of things that are
confusing coming from TypeScript/Python, explained against code you wrote.

**Convention:** file references are relative to the repo root. Line numbers were
accurate at the time of writing; if one drifts, search for the quoted snippet.

---

## Table of contents

1. [Packages, imports, and the two folder rules](#1-packages-imports-and-the-two-folder-rules)
2. [Zero values - the idea that explains half of Go](#2-zero-values---the-idea-that-explains-half-of-go)
3. [Structs, methods, and pointer receivers](#3-structs-methods-and-pointer-receivers)
4. [Errors are values](#4-errors-are-values)
5. [Interfaces are satisfied implicitly](#5-interfaces-are-satisfied-implicitly)
6. [The typed-nil interface trap](#6-the-typed-nil-interface-trap)
7. [Slices, maps, and their nil behaviour](#7-slices-maps-and-their-nil-behaviour)
8. [Pointers for "nullable"](#8-pointers-for-nullable)
9. [Named types](#9-named-types)
10. [JSON struct tags](#10-json-struct-tags)
11. [defer](#11-defer)
12. [Functions are values](#12-functions-are-values)
13. [context.Context](#13-contextcontext)
14. [Goroutines](#14-goroutines)
15. [Channels and select](#15-channels-and-select)
16. [Mutexes](#16-mutexes)
17. [The net/http contract](#17-the-nethttp-contract)
18. [Middleware](#18-middleware)
19. [Talking to Postgres with pgx](#19-talking-to-postgres-with-pgx)
20. [Testing](#20-testing)
21. [Runes vs bytes](#21-runes-vs-bytes)
22. [Compiler directives and blank imports](#22-compiler-directives-and-blank-imports)
23. [Go idioms cheat sheet](#23-go-idioms-cheat-sheet)

---

## 1. Packages, imports, and the two folder rules

Every `.go` file starts with `package <name>`. The package name is **the folder
name**, not the file name, and all files in a folder share one namespace. That
is why `handler/reactions.go` can call `writeError` even though it is defined in
`handler/posts.go` - same package, no import needed.

```go
package handler   // backend/internal/handler/reactions.go:1
```

**Rule 1: capitalisation is access control.** An identifier starting with a
capital letter is exported (visible to other packages); lowercase is private to
the package. There is no `public`/`private` keyword.

```go
type ReactionHandler struct { ... }   // usable from main.go
type reactionService interface { ... } // handler package only
func writeError(...)                   // handler package only
```

Rename `NewHealthHandler` to `newHealthHandler` and `main.go` stops compiling.
That is the whole mechanism.

**Rule 2: `internal/` is enforced by the compiler.** Any package under a folder
named `internal/` can only be imported by code rooted at `internal/`'s parent.
This is a real language rule, not a convention. It is why your project has:

- `backend/internal/...` - church-specific, cannot be imported by anyone else
- `backend/pkg/database` - generic connection-pool helper, deliberately outside

**Import paths are module-rooted.** Your `go.mod` declares
`module github.com/thienduchuutran/church-website/backend`, so:

```go
"github.com/thienduchuutran/church-website/backend/internal/model"
```

resolves to `backend/internal/model` on disk. Nothing is fetched from GitHub.

**Import aliases.** When two packages share a name, alias one:

```go
chiMiddleware "github.com/go-chi/chi/v5/middleware"       // main.go:16
appMiddleware ".../backend/internal/middleware"           // main.go:23
```

---

## 2. Zero values - the idea that explains half of Go

Every type has a **zero value**, and a declared variable always has it. Go has
no `undefined`, and reading an uninitialised variable is never an error.

| Type | Zero value |
|---|---|
| `int`, `float64` | `0` |
| `string` | `""` |
| `bool` | `false` |
| pointer, slice, map, func, interface, channel | `nil` |
| struct | a struct with every field at *its* zero value |

This is why the emoji check works:

```go
// backend/internal/handler/reactions.go:26-31, 63
var allowedEmojis = map[string]bool{"👍": true, "❤️": true, "🙏": true, "😂": true}
...
if !allowedEmojis[req.Emoji] {   // missing key returns false, no panic
```

In TypeScript that lookup returns `undefined` and you need `?? false`. In Go
the zero value *is* the answer. Once you internalise this, a lot of Go code
that looks like it's missing a check turns out not to be.

It also explains why `struct{}` types with no fields are useful, why
`var x sync.Mutex` is immediately usable without a constructor, and why
`err != nil` is the universal error test - the zero value of an interface is nil.

---

## 3. Structs, methods, and pointer receivers

A struct is a plain data container. A method is a function with a **receiver**
declared before the name:

```go
// backend/internal/handler/reactions.go:34-40
type ReactionHandler struct {
	svc reactionService
}

func NewReactionHandler(svc reactionService) *ReactionHandler {
	return &ReactionHandler{svc: svc}
}

// h is the receiver - the "this" of Go, but explicitly named
func (h *ReactionHandler) Upsert(w http.ResponseWriter, r *http.Request) { ... }
```

There are no classes and no constructors. `NewXxx` returning `*Xxx` is a naming
convention the whole ecosystem follows, nothing more. Your codebase has ~30 of
them, all identical in shape.

**Value receiver `(h Handler)` vs pointer receiver `(h *Handler)`:**

- Value receiver gets a **copy**. Mutations do not stick.
- Pointer receiver gets the address. Mutations stick, and no copy is made.

**Practical rule, which your code follows:** if any method on a type needs a
pointer receiver, give *all* of them pointer receivers for consistency. Handlers,
services, and repositories are all pointer receivers because they are meant to
be single shared instances, not copied per request.

**Composition, not inheritance.** Go has no `extends`. You get behaviour by
embedding a struct or, far more often here, by holding a dependency as a field
and delegating - exactly what `ReactionService` does with `repo`.

---

## 4. Errors are values

`error` is an ordinary interface:

```go
type error interface { Error() string }
```

There is no `throw`, no `try`, no stack unwinding. A function that can fail
returns an error as its **last** return value, and the caller checks it:

```go
// backend/internal/handler/reactions.go:67-70
if err := h.svc.UpsertReaction(r.Context(), req.PostID, req.Emoji, req.Fingerprint); err != nil {
	writeError(w, http.StatusInternalServerError, "failed to save reaction")
	return
}
```

Note the `if err := ...; err != nil` form: it declares `err` scoped to the `if`
so it cannot leak into the rest of the function. This is the most common line
shape in all of Go and it is everywhere in your repo.

**Wrapping with `%w`.** `fmt.Errorf` with `%w` keeps the original error
reachable so callers can inspect it:

```go
// backend/cmd/server/main.go:45
return fmt.Errorf("create migration source: %w", err)
```

Read the resulting message as a breadcrumb trail:
`init migrator: create migration source: file not found`.

**Checking for a specific error.** Use `errors.Is` (or a plain `==` for
sentinel values, as `main.go:52` does with `migrate.ErrNoChange`), never string
matching:

```go
if err != nil && err != migrate.ErrNoChange {   // "no change" is success here
```

`pgx.ErrNoRows` is the one you will meet constantly in `repository/` - it means
"the query ran fine and matched nothing", which is usually a 404, not a 500.
AGENTS.md step 3 requires repositories to translate it rather than leak it.

**`panic` is not an exception.** It is for programmer bugs (nil dereference,
index out of range) and it kills the process. Your only defence against a
handler panic taking down the server is `chiMiddleware.Recoverer`
(`main.go:159`), which catches it and returns a 500.

---

## 5. Interfaces are satisfied implicitly

**This is the biggest conceptual difference from TypeScript/Java.** A type
satisfies an interface by having the right methods. It never declares that it
does. There is no `implements`.

```go
// backend/internal/handler/reactions.go:17-23
type reactionService interface {
	UpsertReaction(ctx context.Context, postID, emoji, fingerprint string) error
	DeleteReaction(ctx context.Context, postID, fingerprint string) error
	GetCounts(ctx context.Context, postID string) ([]model.ReactionCount, error)
	GetMyReaction(ctx context.Context, postID, fingerprint string) (*string, error)
}
```

`*service.ReactionService` satisfies this and **the service package does not
know the interface exists**. `backend/internal/service/reactions.go` has no
reference to it. The dependency arrow only points one way.

Three consequences that shape your whole codebase:

**a) Interfaces are declared by the consumer, next to where they're used.**
Not in a shared `interfaces.go`. That's why every handler file starts with a
small private interface rather than importing one.

**b) Interfaces are small.** `reactionService` has 4 methods because the handler
uses 4 methods - not because `ReactionService` has 4. Go's proverb is "the
bigger the interface, the weaker the abstraction."

**c) Testing needs no mocking library.** A test defines its own struct with
those 4 methods and passes it in. That is all `mockReactionService` in
`handler/reactions_test.go` is. No `jest.mock`, no `gomock`, no codegen.

Your codebase uses this same seam for third-party code: `service.URLPresigner`
and `service.PublicURLBuilder` are your interfaces, satisfied by
`*storage.S3Client`, which is why no service imports the AWS SDK.

**Dependency injection without a framework.** Pass dependencies into `NewXxx`.
That's it. There is no container, no decorator, no annotation. `main.go` is the
one place that knows the concrete wiring - see
[Module 13](README.md#module-13---final-boss-maingo).

---

## 6. The typed-nil interface trap

**The most notorious Go gotcha, and your codebase hit it for real.**

An interface value is a *pair*: `(type, value)`. It is nil only when **both**
halves are nil. Assign a nil `*Translator` into an interface variable and the
type half is `*Translator` - non-nil - so the interface is not nil:

```go
var t *translation.Translator   // nil pointer
var namer service.PlaceNamer = t
namer == nil                    // FALSE. The trap.
namer.SomeMethod()              // panics
```

Your `main.go:100-112` documents exactly this, and the fix: declare the
interface variable up front and only assign into it inside the branch where a
real value exists.

```go
var placeNamer service.PlaceNamer      // truly nil
if geminiKey != "" {
	translator := translation.NewTranslator(...)
	placeNamer = translator             // assigned only when real
}
...
if placeNamer != nil {                  // now this check means what it says
	calendarSvc.SetPlaceNamer(placeNamer)
}
```

The same reasoning appears again at `main.go:206-220` for `presigner` and
`publicURLs`. Two independent instances of one hazard - worth reading both.

**Corollary:** never write `func f() error { var e *MyError; ...; return e }`.
Return a literal `nil` on the success path.

---

## 7. Slices, maps, and their nil behaviour

A slice is a view over an array: pointer, length, capacity.

```go
var s []string          // nil slice: len 0, safe to append and range over
s = append(s, "a")      // append returns a NEW slice - always reassign
```

**The nil-vs-empty distinction is a real API bug source**, and your code guards
it explicitly:

```go
// backend/internal/handler/reactions.go:109-112
// Return [] not null so the frontend can iterate without a nil check.
if counts == nil {
	counts = []model.ReactionCount{}
}
```

A nil slice marshals to JSON `null`; an empty slice marshals to `[]`. Your
frontend calling `.map()` on `null` crashes. Same runtime behaviour in Go,
different contract at the boundary - so the boundary is where you fix it.

**Maps** must be made before writing (`make(map[string]int)` or a literal), but
reading a nil map is safe and returns the zero value. The comma-ok form
distinguishes "absent" from "present but zero":

```go
v, ok := m["key"]   // ok is false if the key is absent
```

**Map iteration order is randomised on purpose.** If you need stable output,
collect the keys and `sort` them. Relevant anywhere your code builds a response
or a prompt from a map.

---

## 8. Pointers for "nullable"

Go has no `null`, so a nullable database column becomes a **pointer**:

```go
// docs/agents/backend.md, model/types.go
type Post struct {
	Body      *string    `json:"body"`        // NULL-able TEXT
	EventDate *time.Time `json:"event_date"`  // NULL-able TIMESTAMPTZ
	Title     string     `json:"title"`       // NOT NULL
}
```

Read the struct definition as a schema: `*T` means the column is nullable, `T`
means it is not. `nil` marshals to JSON `null`.

```go
// backend/internal/handler/reactions.go:22
GetMyReaction(...) (*string, error)   // nil = "this visitor hasn't reacted"
```

If this returned `string`, `""` would have to mean both "no reaction" and "empty
reaction" - the pointer removes the ambiguity. Always dereference behind a nil
check.

---

## 9. Named types

```go
type PostType string

const (
	PostTypeEvent        PostType = "event"
	PostTypeAnnouncement PostType = "announcement"
	PostTypeBibleStudy   PostType = "bible_study"
	PostTypePlaylist     PostType = "playlist"
	PostTypeGalleryAlbum PostType = "gallery_album"
)
```

`PostType` is a distinct type with `string` as its underlying type. You cannot
pass a `PostType` where a `string` is wanted without an explicit conversion, so
the compiler catches argument-order mistakes that a bare `string` would not.

This is Go's substitute for enums - there is no `enum` keyword, and the compiler
will **not** stop you writing `PostType("nonsense")`. Validation still has to be
explicit, which is why `AllowedBlockTypes` exists as a map in `types.go` and why
`allowedEmojis` exists in the reactions handler.

---

## 10. JSON struct tags

The backtick string after a field controls encoding:

```go
type PostImage struct {
	StorageKey   string `json:"storage_key"`
	DisplayOrder int    `json:"display_order"`
	StorageURL   string `json:"storage_url,omitempty"`
}
```

- Field names must be **exported** (capitalised) or `encoding/json` cannot see
  them. A lowercase field is silently omitted - a classic silent bug.
- `omitempty` drops the field when it holds its zero value.
- Decoding is case-insensitive and ignores unknown fields by default, which is
  why a request body with extra keys does not error.

```go
// backend/internal/handler/reactions.go:54-58
var req upsertReactionRequest
if err := json.NewDecoder(r.Body).Decode(&req); err != nil { ... }
```

`Decode(&req)` takes the **address** so it can fill the struct in place. Missing
JSON fields leave their Go zero values - which is exactly why the very next
lines check `req.PostID == ""` manually. `encoding/json` has no concept of
"required".

---

## 11. defer

`defer` schedules a call to run when the surrounding **function** returns - not
at end of block, not at end of loop iteration.

```go
// backend/cmd/server/main.go:51
defer m.Close()
```

Two rules that matter:

**a) Defers run last-in-first-out.** This is load-bearing in your `main.go`:

```go
defer dbPool.Close()              // main.go:83   registered first
...
defer translationWorker.Stop()    // main.go:139  registered second
```

On shutdown, `Stop()` runs **first**, then `Close()`. Stop taking new translate
work, *then* tear down the pool it depends on. The comment at `main.go:97-99`
states this is deliberate. Swap the registration order and shutdown would close
the pool out from under an in-flight job.

**b) Arguments are evaluated at `defer` time, the call happens later.**

The idiom you will see most is transactional cleanup:

```go
tx, err := pool.Begin(ctx)
if err != nil { return err }
defer tx.Rollback(ctx)   // no-op if we already committed
... 
return tx.Commit(ctx)
```

Rolling back a committed transaction is a harmless error that you ignore, so
this one line makes *every* early-return path correct without a `finally`.
`repository/pages.go` and `repository/calendar.go` both rely on it.

Also: `defer rows.Close()` after every `Query`, and `defer cancel()` after
every `context.WithTimeout` - forgetting the second leaks a goroutine and a
timer every call.

---

## 12. Functions are values

Functions are first-class: assign them, pass them, store them in struct fields,
and give them names with `type`.

```go
// backend/internal/translation/queue.go
type EnqueueFn func(job TranslationJob)
```

This is why `PostService` depends on a **function**, not on a database pool or
a translation package. `main.go:114-122` builds the closure:

```go
enqueueTranslation = func(job translation.TranslationJob) {
	go func() {
		bg, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := translation.EnqueueTranslation(bg, dbPool, job); err != nil { ... }
	}()
}
```

The closure **captures** `dbPool` from the enclosing scope - that is what a
closure is, and it is how the function type stays a single argument while still
having database access. `service/posts.go` can then be tested by passing a
closure that appends to a slice.

Two gotchas:

- **Loop variable capture.** Fixed in Go 1.22+ (each iteration gets a fresh
  variable), and your `go.mod` says 1.25.3, so you are safe. Older Go tutorials
  will tell you to write `i := i` - you no longer need to.
- A `nil` function value panics when called. Hence the `if enqueueTranslation != nil`
  guards throughout `main.go`.

---

## 13. context.Context

A `Context` carries three things across API boundaries: **cancellation**,
**deadlines**, and **request-scoped values**. By convention it is always the
first parameter and always named `ctx`.

```go
func (s *ReactionService) GetCounts(ctx context.Context, postID string) ([]model.ReactionCount, error)
```

**Where contexts come from in your code:**

| Source | Meaning | Used where |
|---|---|---|
| `r.Context()` | dies when the HTTP request ends | handlers, and everything they call synchronously |
| `context.Background()` | never cancelled; the root | `main.go:78`, and every fire-and-forget goroutine |
| `context.WithTimeout(parent, d)` | cancelled after `d` | `main.go:116`, `main.go:494` |

**The single most important context idea in this repo:** background work must
**not** use the request context.

```go
// main.go:116 - a fresh background context, NOT r.Context()
bg, cancel := context.WithTimeout(context.Background(), 10*time.Second)
```

If the enqueue used `r.Context()`, then the moment the HTTP response was written
the context would be cancelled and the job insert would be killed mid-flight -
intermittently, under load, and impossible to reproduce locally. The same
reasoning governs the Discord send in `service/posts.go`.

The mirror-image rule: anything the request *waits on* should use `r.Context()`,
so that a visitor closing the tab cancels the database query instead of leaving
it running.

`middleware/context.go` covers the third use, values - see
[section 18](#18-middleware).

---

## 14. Goroutines

`go f()` runs `f` concurrently. It costs a few KB, not a thread. Starting
thousands is normal.

```go
// backend/cmd/server/main.go:483-488
go func() {
	log.Printf("backend listening on :%s", port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server failed: %v", err)
	}
}()
```

The HTTP server runs in a goroutine so `main` can continue to line 492 and block
waiting for a shutdown signal. If `ListenAndServe` ran on the main goroutine,
there would be nothing left to notice SIGTERM.

**Three rules you must hold:**

1. **Nobody waits for a goroutine unless you make them.** When `main` returns,
   every goroutine dies instantly, mid-work, no cleanup. That is exactly why
   graceful shutdown exists at `main.go:490-499`.
2. **A goroutine cannot return a value or an error to its starter.** It must
   log, or send on a channel, or write to shared state under a lock. Your
   fire-and-forget goroutines log - see `main.go:119`.
3. **A panic in a goroutine kills the whole process**, and `Recoverer` cannot
   help because it is on a different goroutine. Any `go func()` doing real work
   needs its own recover if a panic is plausible.

**Fire-and-forget is a deliberate trade.** Discord notification and translation
enqueue are best-effort: the admin's post is saved either way, and a Discord
outage must not fail a save. State that trade-off out loud when explaining this
code - it is a design decision, not an oversight.

---

## 15. Channels and select

A channel is a typed pipe. Sending blocks until a receiver is ready (unless
buffered); receiving blocks until a value arrives.

```go
// backend/cmd/server/main.go:490-492
stop := make(chan os.Signal, 1)          // buffered, capacity 1
signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
<-stop                                    // blocks main until Ctrl-C / SIGTERM
```

The buffer of 1 matters: `signal.Notify` never blocks, so if the channel were
unbuffered and `main` were momentarily elsewhere, the signal would be dropped.

**`select` waits on several channels at once.** This is `Worker.run` in
`internal/translation/worker.go:66-83`:

```go
ticker := time.NewTicker(w.interval)
defer ticker.Stop()

for {
	select {
	case <-ctx.Done():
		log.Println("translation worker stopped")
		return                 // cancelled - shut down
	case <-ticker.C:
		if err := w.tick(ctx); err != nil && !errors.Is(err, context.Canceled) {
			log.Printf("translation worker tick error: %v", err)
		}
	}
}
```

**Learn this block by heart.** It is the canonical Go background worker and it
appears in essentially every Go service ever written.

Note there is no separate "stop channel" - **cancellation *is* the shutdown
signal**, which is why the same `ctx` both stops the loop and aborts an
in-flight database call inside `tick`. One mechanism, not two. `Start`
(`worker.go:48-55`) builds it with `context.WithCancel` and stores `cancel`;
`Stop` (`worker.go:58-64`) calls it.

Two refinements in that code worth copying:

- **`sync.Once` in `Start`** makes a double-start a harmless no-op.
- **A `done` channel** closed by `defer close(w.done)` at `worker.go:67`. `Stop`
  waits on it, so `Stop()` returning *means* the goroutine has actually exited -
  not merely been asked to. Without it, `main` could close the database pool
  while the final tick was still using it.

**Closing** a channel makes every receive return instantly with the zero value.
That is why `close(w.done)` works as a broadcast to any number of waiters and
never needs a value sent through it - the close itself is the message.

---

## 16. Mutexes

When goroutines share memory, guard it.

```go
var mu sync.Mutex
mu.Lock()
defer mu.Unlock()
```

`sync.RWMutex` adds `RLock`/`RUnlock`: any number of concurrent readers, or one
writer, never both. Use it when reads massively outnumber writes.

Your codebase has **three TTL caches**, all the same shape, and reading them
together is the fastest way to see the pattern:

| File | Caches | TTL |
|---|---|---|
| `internal/middleware/jwks.go` | Supabase public keys | 1 hour |
| `internal/translation/prompt.go` | system prompt bodies | 5 minutes |
| `internal/service/hero_video.go` | presigned hero URL | 5 minutes |

`jwks.go` is the one to study: every authenticated request reads the keyset, and
one goroutine occasionally refreshes it - the textbook `RWMutex` case.

`prompt.go` adds a lesson that has nothing to do with concurrency: it was
originally a single `content` field that still *accepted* a key argument. With
one prompt that was harmless; the moment a second (`en_translation`) existed, it
would serve whichever direction ran first to the other for the whole TTL -
producing Vietnamese output for an English target **with no error anywhere**.
It is a map now. A cache key that ignores part of the identity is a silent
correctness bug, and no type system catches it.

Run `go test -race ./...` to have the runtime detect unguarded shared access.

---

## 17. The net/http contract

Everything reduces to one interface:

```go
type Handler interface {
	ServeHTTP(w http.ResponseWriter, r *http.Request)
}
```

- `w` is a **write-only sink**. You cannot read back what you wrote.
- `r` is the request: `r.Body` (an `io.ReadCloser`, readable once),
  `r.URL.Query()`, `r.Header`, `r.Context()`.

**Order matters and is not enforced.** Headers, then status, then body:

```go
// backend/internal/handler/reactions.go:129-130
w.Header().Set("Cache-Control", "no-store")   // headers FIRST
writeJSON(w, http.StatusOK, summary)          // then WriteHeader, then body
```

Setting a header after `WriteHeader` silently does nothing - no error, no panic,
just a missing header in production. This is the most common `net/http` bug.

**`WriteHeader` may only be called once.** Which is why every error path in your
handlers ends with `return`:

```go
if err != nil {
	writeError(w, http.StatusInternalServerError, "...")
	return      // without this, you'd fall through and write a second status
}
```

**chi** adds routing on top and nothing else. `chi.URLParam(r, "post_id")`
extracts a path segment declared as `{post_id}` at registration
(`main.go:357`). Route registration order matters for literal-vs-param
collisions - `main.go:428-429` registers `retranslate-all` before
`retranslate/{id}` so the literal wins.

---

## 18. Middleware

Middleware is a function that takes a handler and returns a handler:

```go
func Something(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// before
		next.ServeHTTP(w, r)
		// after
	})
}
```

That's it - the entire pattern. `internal/middleware/cors.go` is 27 lines and is
the cleanest example in your repo; read it before `auth.go`.

**Middleware that needs configuration returns middleware:**

```go
// main.go:160
router.Use(appMiddleware.CORS(os.Getenv("FRONTEND_ORIGIN")))
// main.go:323
r.Use(appMiddleware.RequireAdmin(adminRepo, jwksCache))
```

`RequireAdmin(...)` is called at wiring time and *returns* the
`func(http.Handler) http.Handler`. The closure captures `adminRepo` and
`jwksCache` - [section 12](#12-functions-are-values) again.

**Passing data down: context values.** Middleware cannot add a parameter to
`ServeHTTP`, so it attaches values to the request context and returns a new
request:

```go
ctx := context.WithValue(r.Context(), userIDKey, sub)
next.ServeHTTP(w, r.WithContext(ctx))
```

`internal/middleware/context.go` defines an **unexported key type** for this.
Context values are `any`-keyed, so a plain string `"user_id"` could collide with
an identical key set by a third-party package, silently returning the wrong
value. An unexported named type makes collision impossible at compile time -
this is the standard Go answer, and it is why that 37-line file exists.

**Ordering** is registration order (`main.go:156-160`):
RequestID → RealIP → Logger → Recoverer → CORS, then any group-level
`RequireAdmin`. Each wraps the next, so the first registered is outermost.

---

## 19. Talking to Postgres with pgx

No ORM. Raw SQL, `$1`-style placeholders, results scanned into Go variables.
`$1` placeholders are sent separately from the query text, so **parameterised
queries are immune to SQL injection** - never build SQL with `fmt.Sprintf`.

**One row:**

```go
var emoji string
err := r.pool.QueryRow(ctx, `SELECT emoji FROM reactions WHERE ...`, postID, fp).Scan(&emoji)
if errors.Is(err, pgx.ErrNoRows) {
	return nil, nil        // "not found" is not a failure
}
```

**Many rows** - the single most repeated pattern in your repositories:

```go
rows, err := r.pool.Query(ctx, `SELECT emoji, count(*) FROM ... GROUP BY emoji`, postID)
if err != nil {
	return nil, err
}
defer rows.Close()

var out []model.ReactionCount
for rows.Next() {
	var c model.ReactionCount
	if err := rows.Scan(&c.Emoji, &c.Count); err != nil {
		return nil, err
	}
	out = append(out, c)
}
return out, rows.Err()     // MUST check - see below
```

Three things that bite:

1. **`Scan` takes pointers**, and the argument order must match the `SELECT`
   column order exactly. The compiler cannot check this; a mismatch is a
   runtime error or, with two same-typed columns, silently swapped data.
2. **`rows.Err()` is not optional.** `rows.Next()` returning false means "done
   **or** broken". Skip `rows.Err()` and a mid-stream connection failure becomes
   an empty list with no error - the worst kind of bug.
3. **`defer rows.Close()`** or you hold a pooled connection until GC.

**NULL** scans into a pointer (`*string`) or a `pgtype` wrapper - see
[section 8](#8-pointers-for-nullable).

**Transactions:**

```go
tx, err := r.pool.Begin(ctx)
if err != nil { return err }
defer tx.Rollback(ctx)      // no-op after a successful Commit
// ... several statements on tx ...
return tx.Commit(ctx)
```

`repository/pages.go`'s `ReplaceBlocks` needs this: without it, a successful
delete followed by a failed insert would blank a live page.

**`FOR UPDATE SKIP LOCKED`** (in `repository/translation.go`) is how the worker
claims jobs: it locks the rows it takes and *skips* rows another worker already
locked, so two instances of your backend never process the same job. The
database is the lock manager, which is why the design survives Render restarting
your container mid-job.

---

## 20. Testing

Testing is built into the toolchain. No framework, no config, no runner.

- File must end `_test.go`, in the **same package** as the code (so it can see
  unexported identifiers like `writeError` and `allowedEmojis`).
- Function must be `func TestXxx(t *testing.T)`.
- Fail with `t.Errorf` (continue) or `t.Fatalf` (stop this test).

```powershell
cd backend
go test ./...                              # everything
go test ./internal/handler/ -run Reaction  # one package, matching tests
go test ./... -v                           # show each test name
go test ./... -race                        # detect data races
go test ./... -cover                       # coverage
```

**Table-driven tests** are the dominant Go style, and
`internal/model/address_test.go` is the best example in your repo:

```go
tests := []struct {
	name string
	in   string
	want string
}{
	{"strips punctuation", "101 Main St.", "101 main street"},
	// ... one line per case
}
for _, tt := range tests {
	t.Run(tt.name, func(t *testing.T) {
		if got := NormalizeAddressKey(tt.in); got != tt.want {
			t.Errorf("got %q want %q", got, tt.want)
		}
	})
}
```

Adding a case is one line, and `t.Run` gives each its own name in the output.

**Two ways your repo fakes dependencies - know when to use each:**

| Technique | Use when | Example |
|---|---|---|
| Hand-written mock struct satisfying an interface | faking **your own** layer | `mockReactionService` in `handler/reactions_test.go` |
| `httptest.NewServer` returning canned JSON | faking an **outbound HTTP** service | `discord/send_test.go` |

And `httptest.NewRecorder()` captures what a handler wrote, so you can assert on
status code and body without a network:

```go
req := httptest.NewRequest(http.MethodPost, "/api/v1/reactions", body)
rec := httptest.NewRecorder()
h.Upsert(rec, req)
if rec.Code != http.StatusNoContent { t.Fatalf("got %d", rec.Code) }
```

---

## 21. Runes vs bytes

A Go `string` is a read-only slice of **bytes** holding UTF-8. `len(s)` counts
bytes, not characters.

```go
s := "Thánh"
len(s)              // 6 - "á" is two bytes
len([]rune(s))      // 5 - what a human means by "length"
```

A `rune` is an `int32` holding one Unicode code point. `for i, r := range s`
iterates **runes**, with `i` being the byte offset (so it jumps).

**This is not academic in your project.** You handle Vietnamese everywhere:

- `internal/translation/detect.go` counts words carrying Vietnamese diacritics
  and compares the ratio against 0.4 - that requires rune-level inspection.
- `internal/model/address.go` normalises addresses.
- `sanitizePlaceName` in `service/place_namer.go` rejects names over **40
  runes** - deliberately runes, because 40 bytes would be about 20 Vietnamese
  characters and would reject valid names.

Use `golang.org/x/text` (already a direct dependency in your `go.mod`) for
normalisation, and remember that "é" can be one code point or two (letter +
combining accent) - which is why normalisation exists at all.

---

## 22. Compiler directives and blank imports

**`//go:embed`** - a comment the compiler acts on. It must sit immediately above
the variable, with no blank line:

```go
// backend/migrations/embed.go - 9 lines, entire SQL schema into the binary
//go:embed *.sql
var FS embed.FS
```

Your 28 migration files ship *inside* the compiled binary. The Docker image
carries no SQL files, and `runMigrations` (`main.go:43`) reads them from `FS`.
This is why deployment is "push a container" with no migration step.

**Blank imports** - imported purely for the side effect of their `init()`:

```go
// backend/cmd/server/main.go:18
_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
```

Nothing in `main.go` references this package. Importing it runs its `init()`,
which registers the `pgx5://` URL scheme with golang-migrate's driver registry.
Delete the line and `migrate.NewWithSourceInstance` fails at runtime with
"unknown driver" - the compiler cannot warn you. That registry is also why
`runMigrations` rewrites `postgres://` to `pgx5://` at `main.go:38-41`.

---

## 23. Go idioms cheat sheet

| Idiom | Meaning |
|---|---|
| `x, err := f()` | almost every call; error is always last |
| `if err := f(); err != nil { return err }` | scoped error check, the most common line in Go |
| `defer f()` | run on function exit, LIFO order |
| `v, ok := m[k]` | map lookup distinguishing absent from zero |
| `v, ok := x.(T)` | type assertion; `ok` false instead of panic |
| `for i, v := range s` | iterate slice/map/string/channel |
| `_ = f()` | explicitly discard a value |
| `_ "pkg"` | import for `init()` side effects only |
| `var _ Iface = (*T)(nil)` | compile-time assertion that `*T` satisfies `Iface` |
| `make(chan T, n)` | buffered channel |
| `close(ch)` | broadcast to all receivers |
| `ctx, cancel := context.WithTimeout(...)` then `defer cancel()` | always paired |
| `New*()` returning `*T` | constructor convention |
| `s = append(s, x)` | append returns a new slice; reassign |
| `%w` in `fmt.Errorf` | wrap an error so `errors.Is` can find it |
| `%v` / `%+v` / `%q` | default / with-field-names / quoted formatting |

**Commands worth memorising:**

```powershell
go build ./...        # compile everything, print nothing on success
go test ./...         # run every test
go test ./... -race   # + data race detector
go vet ./...          # catch real bugs the compiler allows
gofmt -l .            # list files that aren't formatted (should be empty)
go doc net/http Handler          # docs for any symbol, offline
go doc -all ./internal/service   # everything exported by one of your packages
go mod tidy           # add missing / drop unused dependencies
```

---

## Where to go when this isn't enough

- **[Effective Go](https://go.dev/doc/effective_go)** - the taste document.
- **[Go Code Review Comments](https://go.dev/wiki/CodeReviewComments)** - short,
  and it is what Go reviewers actually cite. Read it once a month.
- **[The Go Memory Model](https://go.dev/ref/mem)** - after Module 9, when you
  want to know what "happens-before" actually guarantees.
- **`go doc`** - faster and more accurate than searching the web.
- **The standard library source.** `net/http`, `encoding/json`, and `sync` are
  readable Go written by the language's designers. `F12` into them from your own
  code and keep going.
