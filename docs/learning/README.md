# Learning Go by reverse-engineering this backend

You built this with AI. Now you're going to take it apart and understand every line.

This is the map. It covers **all 89 Go files, all 14,429 lines** of `backend/` -
nothing is skipped, nothing is left as "you'll pick that up later". Every file
appears in exactly one module, and the module line totals add up to 14,429 exactly.

**Companion doc:** [go-primer.md](go-primer.md) - the Go language itself, every
concept anchored to a real line in *your* code. Read a primer section when a
module tells you to.

---

## Why this order (read this first)

The instinct is to read `handler/` then `service/` then `repository/`,
alphabetically, folder by folder. **That is the worst possible order** and it is
why the codebase feels impenetrable.

Reading horizontally (all handlers, then all services) means you see 11 versions
of a pattern you don't understand yet. Reading **vertically** - one feature all
the way down through all three layers - means you see the pattern *once*,
completely, and then recognise it 10 more times.

So this path is ordered by two things:

1. **Vertical slices, smallest first.** Module 2 is reactions: 445 lines, three
   layers, no side effects, no AI, no auth. It is your entire architecture in
   miniature. Once you understand those 445 lines, you understand the shape of
   the other 14,000.
2. **Go concepts in dependency order.** You cannot understand `worker.go`
   (goroutines, channels, tickers) before you understand what a method on a
   struct is. Each module introduces 3-6 new language concepts and reuses
   everything before it.

The two big files everyone wants to start with - `cmd/server/main.go` and
`model/types.go` - are deliberately **not** first. `main.go` is last (Module 13)
because it is the composition root: it only makes sense once you know what all
the pieces are. It is the exam, not the lesson.

---

## The method: four passes per module

For every module, do these four passes in order. Do not skip pass 3 - it is the
one that actually moves knowledge into your head.

### Pass 1 - Read the test first
Your codebase has 30 test files. **A test is a specification written in code.**
It shows you what the thing is supposed to do before you see how it does it.
Every module below lists the test file first for this reason.

### Pass 2 - Read the implementation, top to bottom
Read the file in the order it is written: imports, types, constructor, then
methods. Do not jump around. When you hit a word you don't know, look it up in
[go-primer.md](go-primer.md), then come back.

### Pass 3 - Delete and rebuild (the reverse-engineering pass)
This is the whole point.

```powershell
# Example for Module 2
git stash push backend/internal/service/reactions.go
```

Now the project does not compile. Rebuild `service/reactions.go` from scratch,
using only the test file and the interface declared in the handler as your spec.
When `go build ./...` passes and `go test ./...` passes, you have proven you
understand it. Then:

```powershell
git stash pop   # compare yours against the original
```

Start with the smallest file in the module and work up. You will not be able to
rebuild `repository/calendar.go` from memory, and you are not supposed to - for
the big files, rebuild one *function* instead of the whole file.

### Pass 4 - Answer the checkpoint questions out loud
Each module ends with questions. Say the answers **out loud, in full sentences**,
as if to an interviewer. If you can't finish a sentence, you haven't got it yet -
go back to pass 2 for that specific thing.

---

## Setup before Module 1

```powershell
# Confirm Go is installed and matches the project
go version                    # want 1.25.x - go.mod says 1.25.3

# From the repo root
cd backend
go build ./...                # should print nothing = success
go test ./...                 # should be all ok/no-test-files
go vet ./...                  # the built-in linter, catches real bugs
```

Two tools you will use constantly:

```powershell
go doc net/http Handler       # read the docs for any type, offline, instantly
go doc github.com/go-chi/chi/v5 Router
gofmt -d .                    # show what the formatter would change (should be empty)
```

**Install the Go extension for VS Code.** Then `F12` (go to definition) and
`Shift+F12` (find all references) become your primary reading tools. Reading Go
without jump-to-definition is like reading with one eye closed.

---

## The 14 modules

| # | Module | Files | Lines | New Go concepts | Est. |
|---|---|---|---|---|---|
| 0 | [Go survival kit](#module-0---go-survival-kit) | 0 | 0 | syntax, types, errors | 3 days |
| 1 | [The spine](#module-1---the-spine) | 5 | 139 | package, struct, method, http.Handler | 1 day |
| 2 | [First vertical slice: reactions](#module-2---first-vertical-slice-reactions) | 4 | 445 | interfaces, DI, JSON, context, httptest | 3 days |
| 3 | [Collections: tags](#module-3---collections-tags) | 4 | 517 | slices, rows.Scan, variadic, transactions | 2 days |
| 4 | [Pure Go: the model layer](#module-4---pure-go-the-model-layer) | 5 | 1,596 | named types, runes, maps, table tests | 4 days |
| 5 | [Middleware and auth](#module-5---middleware-and-auth) | 9 | 613 | func-returning-func, ctx values, mutex | 3 days |
| 6 | [Bytes: R2 storage](#module-6---bytes-r2-storage) | 11 | 1,095 | io.Reader, multipart, interface seams | 3 days |
| 7 | [Side effects: posts](#module-7---side-effects-posts) | 4 | 1,026 | goroutines, setter injection, diffing | 4 days |
| 8 | [Outbound: Discord](#module-8---outbound-discord) | 17 | 1,861 | http.Client, HMAC, OAuth, mock servers | 5 days |
| 9 | [Concurrency: translation engine](#module-9---concurrency-translation-engine) | 14 | 2,325 | tickers, stop channels, cancellation, retries | 6 days |
| 10 | [The big one: calendar](#module-10---the-big-one-calendar) | 6 | 2,270 | time, tx, nil-interface trap | 6 days |
| 11 | [Transactional replace: pages](#module-11---transactional-replace-pages) | 4 | 1,143 | JSONB, map[string]any, upsert+delete | 3 days |
| 12 | [RAG: the assistant](#module-12---rag-the-assistant) | 5 | 899 | rate limiting, FTS, prompt assembly | 3 days |
| 13 | [Final boss: main.go](#module-13---final-boss-maingo) | 1 | 500 | composition root, graceful shutdown, defer order | 3 days |
| - | **Total** | **89** | **14,429** | | **~7 weeks** |

At 1-2 focused hours a day that is roughly seven weeks. At 4 hours a day, three.
**Do not skip ahead to Module 13 because it looks important.** It is 500 lines
that reference every other module; read early, it teaches nothing.

---

## Module 0 - Go survival kit

**No project files.** You need enough syntax to not drown. Three days, not three
weeks - you will learn the rest *from your own code*, which is the entire point
of this path.

Do these, in this order:

1. **[A Tour of Go](https://go.dev/tour/)** - the official interactive tour.
   Do the sections `Basics`, `Methods and interfaces`, `Generics` (skim),
   `Concurrency` (just watch it, don't fight it yet). ~4 hours.
2. **[Go by Example](https://gobyexample.com/)** - not a course, a lookup table.
   Read: Values, Variables, For, If/Else, Arrays, Slices, Maps, Functions,
   Multiple Return Values, Pointers, Structs, Methods, Interfaces, Errors,
   Goroutines, Channels, JSON, Context. ~3 hours.
3. **[Effective Go](https://go.dev/doc/effective_go)** - read *only* these
   sections: Names, Semicolons, Control structures, Functions (esp. multiple
   returns and defer), Data (new vs make), Initialization, Methods, Interfaces,
   Errors. ~2 hours. This is where Go's *taste* comes from.

**Then stop.** Do not do a 40-hour Udemy course. You have 14,429 lines of your
own code to learn from, and it is a better teacher because you already know what
it is supposed to do.

**Checkpoint:** Without looking anything up, write on paper what these mean:
`func (h *ReactionHandler) Upsert(w http.ResponseWriter, r *http.Request)`,
`if err != nil { return err }`, `map[string]bool`, `*string`, `[]model.Post`,
`ctx context.Context`, `defer cancel()`.

---

## Module 1 - The spine

**The goal:** watch one HTTP request enter and leave the process. Nothing else.

| Order | File | Lines | Why it's here |
|---|---|---|---|
| 1 | [backend/internal/handler/health_test.go](../../backend/internal/handler/health_test.go) | 27 | The smallest test in the repo. Learn `httptest` here where nothing else distracts. |
| 2 | [backend/internal/handler/health.go](../../backend/internal/handler/health.go) | 16 | The smallest handler. A struct, a constructor, one method. That's the shape of all 11 handlers. |
| 3 | [backend/pkg/database/postgres.go](../../backend/pkg/database/postgres.go) | 34 | How a connection pool is created. Note it returns `(*pgxpool.Pool, error)` - the Go two-value idiom. |
| 4 | [backend/migrations/embed.go](../../backend/migrations/embed.go) | 9 | 9 lines that put your entire SQL schema *inside the compiled binary*. `//go:embed` is a compiler directive, not a comment. |
| 5 | [backend/cmd/probe/main.go](../../backend/cmd/probe/main.go) | 53 | A second, standalone `main()`. Proves `cmd/` holds N programs, not one. |

**Primer sections:** `package and imports`, `structs and methods`,
`pointer receivers`, `exported vs unexported`, `the error return`.

**Why `pkg/` vs `internal/`:** Go enforces this at compile time. Anything under
`internal/` can only be imported by code in the same module. `pkg/database` is
outside it, signalling "this is generic, reusable, has nothing to do with
churches". That distinction is a real Go language rule, not a convention.

**Drill:** Add a `GET /api/v1/version` endpoint that returns
`{"version":"dev"}`. Test first (copy `health_test.go`), then handler, then
register it in `main.go` line ~299 next to `/health`. Then delete it all.

**Checkpoint:**
- Why is the receiver `(h *HealthHandler)` a pointer when the struct is empty?
- What does `httptest.NewRecorder()` stand in for?
- What breaks if you rename `NewHealthHandler` to `newHealthHandler`?

---

## Module 2 - First vertical slice: reactions

**This is the most important module in the path.** 445 lines containing your
entire architecture with nothing extra: no auth, no AI, no file uploads, no
side effects. Every other feature is this shape plus complications.

| Order | File | Lines | Why it's here |
|---|---|---|---|
| 1 | [backend/internal/handler/reactions_test.go](../../backend/internal/handler/reactions_test.go) | 197 | Read the mock at the top *first*. It tells you why the interface exists. |
| 2 | [backend/internal/handler/reactions.go](../../backend/internal/handler/reactions.go) | 131 | Parse, validate, call, respond. Four steps, nothing else. |
| 3 | [backend/internal/service/reactions.go](../../backend/internal/service/reactions.go) | 38 | Four methods that just delegate. Read the comment on line 11 - it explains why a "useless" layer exists. |
| 4 | [backend/internal/repository/reactions.go](../../backend/internal/repository/reactions.go) | 79 | Raw SQL. `QueryRow`, `Scan`, `pgx.ErrNoRows`. |

**Primer sections:** `interfaces are satisfied implicitly`,
`dependency injection without a framework`, `JSON struct tags`,
`pointers for nullable`, `context.Context`, `maps as sets`.

**The three things to actually understand here:**

1. **[reactions.go:17-23](../../backend/internal/handler/reactions.go#L17-L23)** -
   the handler declares an *interface* describing what it needs, and
   `*service.ReactionService` satisfies it **without ever naming it**. This is
   the single biggest difference between Go and Java/TypeScript. The interface
   is declared by the *consumer*, next to where it is used, and is only 4
   methods wide because that's all the handler needs.

2. **[reactions.go:26-31](../../backend/internal/handler/reactions.go#L26-L31)** -
   `map[string]bool` as a set, mirroring a database CHECK constraint. `!allowedEmojis[req.Emoji]`
   works on a missing key because Go returns the *zero value* (`false`) rather
   than throwing. Zero values are everywhere in Go; internalise this one early.

3. **[reactions.go:110-112](../../backend/internal/handler/reactions.go#L110-L112)** -
   `if counts == nil { counts = []model.ReactionCount{} }`. A nil slice
   marshals to JSON `null`, an empty slice marshals to `[]`. That one line is
   the difference between your frontend crashing on `.map()` and not.

**Drill (the full reverse-engineer):**
```powershell
git stash push backend/internal/service/reactions.go
# rebuild it from reactions_test.go + the interface in handler/reactions.go
cd backend; go test ./internal/handler/
git stash pop
```
Then do the same for `repository/reactions.go`, then `handler/reactions.go`.
Budget a full day for the handler.

**Checkpoint:**
- Where would you put "one fingerprint may only react 10 times per minute"?
  Name the file and say why not the other two.
- Why does `GetMyReaction` return `*string` and not `string`?
- The handler imports `model` but never `repository`. What enforces that?
- Trace `POST /api/v1/reactions` from the TCP socket to the `INSERT`, naming
  every function it passes through.

---

## Module 3 - Collections: tags

Same shape as reactions, but now rows come back as *lists* and one write
touches many rows.

| Order | File | Lines |
|---|---|---|
| 1 | [backend/internal/handler/tag_test.go](../../backend/internal/handler/tag_test.go) | 191 |
| 2 | [backend/internal/handler/tag.go](../../backend/internal/handler/tag.go) | 130 |
| 3 | [backend/internal/service/tag.go](../../backend/internal/service/tag.go) | 42 |
| 4 | [backend/internal/repository/tag.go](../../backend/internal/repository/tag.go) | 154 |

**Primer sections:** `slices vs arrays`, `append and the nil slice`,
`the rows.Scan loop`, `variadic functions`, `defer rows.Close()`.

**Focus:** the `rows.Next()` / `rows.Scan(&x)` / `rows.Err()` loop in
`repository/tag.go`. It appears ~40 times across your repositories and is the
single most repeated pattern in the codebase. Learn it once, here. In
particular: **why `rows.Err()` must be checked after the loop** - `rows.Next()`
returning false means "done OR broken", and skipping `rows.Err()` silently
turns a database failure into an empty list.

**Drill:** rebuild `repository/tag.go`'s `GetAllTags` and `ReplacePostTags`
from scratch. `ReplacePostTags` is your first taste of "several statements must
succeed together".

**Checkpoint:**
- What is the zero value of a slice, and why can you `append` to it anyway?
- Why does `ReplacePostTags` delete-then-insert instead of diffing?
- What happens if you forget `defer rows.Close()`?

---

## Module 4 - Pure Go: the model layer

**1,596 lines with zero I/O.** No database, no HTTP, no AI. Pure functions and
type definitions - which makes this the best place in the entire repo to learn
the *language* rather than the plumbing. It is also where the tests are densest
(595 of these lines are tests).

| Order | File | Lines | Why it's here |
|---|---|---|---|
| 1 | [backend/internal/model/address_test.go](../../backend/internal/model/address_test.go) | 263 | The finest table-driven test in your repo. Read it before the implementation. |
| 2 | [backend/internal/model/address.go](../../backend/internal/model/address.go) | 195 | `NormalizeAddressKey`. String processing, runes, maps, no dependencies. |
| 3 | [backend/internal/model/types.go](../../backend/internal/model/types.go) | 806 | Your entire domain vocabulary. Skim, then use as reference forever. |
| 4 | [backend/internal/model/calendar_types_test.go](../../backend/internal/model/calendar_types_test.go) | 244 | JSON marshalling contracts pinned by test. |
| 5 | [backend/internal/model/calendar_test.go](../../backend/internal/model/calendar_test.go) | 88 | |

**Primer sections:** `named types (type PostType string)`, `const blocks`,
`runes vs bytes`, `the strings package`, `table-driven tests`,
`omitempty and the JSON contract`.

**How to read `types.go` (806 lines, do not read it linearly):** open it, and
every time a later module mentions a type, come back and read *that struct
only*. It is a dictionary, not a novel. Right now, read only: `PostType` and
its consts, `Post`, `PostImage`, `Reaction*`, `PageContent`, `PageBlock`.

**Focus - the one architectural rule in this module:**
`NormalizeAddressKey` must exist in exactly one language. Your database has a
`UNIQUE` constraint on `address_key`; if a TypeScript copy of this function ever
normalised `St.` differently from the Go one, you would get duplicate places
that the constraint could not catch. AGENTS.md line 92 states this rule -
Module 4 is where you understand *why* it is a rule and not a preference.

**Drill:** delete `address.go` entirely and rebuild it from `address_test.go`
alone. This is the single best drill in this whole path: a real, non-trivial,
pure function with a complete spec sitting next to it and no I/O to mock.
Budget most of a day. Then add a new abbreviation (`Blvd` -> `boulevard`)
test-first.

**Checkpoint:**
- Why `type PostType string` instead of just `string`?
- What is the difference between `len(s)` and `len([]rune(s))` for `"Thánh"`,
  and which does your code need?
- What does `json:"body"` on a `*string` produce when the pointer is nil?
- Why does `PageBlock.Props` use `map[string]any` instead of a struct?

---

## Module 5 - Middleware and auth

| Order | File | Lines |
|---|---|---|
| 1 | [backend/internal/middleware/cors.go](../../backend/internal/middleware/cors.go) + [cors_test.go](../../backend/internal/middleware/cors_test.go) | 58 |
| 2 | [backend/internal/middleware/logger.go](../../backend/internal/middleware/logger.go) | 10 |
| 3 | [backend/internal/middleware/context.go](../../backend/internal/middleware/context.go) | 37 |
| 4 | [backend/internal/middleware/auth_test.go](../../backend/internal/middleware/auth_test.go) | 134 |
| 5 | [backend/internal/middleware/auth.go](../../backend/internal/middleware/auth.go) | 137 |
| 6 | [backend/internal/middleware/jwks.go](../../backend/internal/middleware/jwks.go) | 158 |
| 7 | [backend/internal/repository/admins.go](../../backend/internal/repository/admins.go) | 67 |
| 8 | [backend/internal/handler/auth.go](../../backend/internal/handler/auth.go) | 12 |

**Primer sections:** `functions are values`, `the middleware pattern
(func(http.Handler) http.Handler)`, `context values and typed keys`,
`sync.RWMutex`, `closures capture variables`.

**Start with `cors.go` (27 lines).** It is the middleware pattern with the
logic removed - a function that takes a handler and returns a handler. Once
that clicks, `auth.go` is the same shape with 100 more lines inside.

**Focus - two things:**

1. **`context.go` and typed keys.** Context values are `any`-typed, so a plain
   string key like `"user_id"` could collide with another package's `"user_id"`
   and silently return the wrong value. Your `context.go` defines an
   unexported key type so collision is *impossible at compile time*. This is
   the standard Go answer to a real hazard.
2. **`jwks.go` and the read-write mutex.** Public keys are fetched once and
   cached for an hour. Many requests read the cache concurrently; one goroutine
   refreshes it. `RWMutex` lets all readers proceed in parallel and only blocks
   them during the swap. Your first real concurrency primitive, in the calmest
   possible setting.

**Also read** [docs/agents/backend.md](../agents/backend.md) → "Auth contract"
and the route comments in `main.go` lines 311-317. **The public/admin split is
the most important security decision in your project.**

**Drill:** write a middleware `RequireJSONContentType` that 415s any POST
without `Content-Type: application/json`. Test first. Wire it, run it, delete it.

**Checkpoint:**
- Draw the call order when a request hits `POST /api/v1/posts`. Which
  middleware runs first, and where does `RequireAdmin` sit?
- Why is `GET /api/v1/admin/discord/callback` public? What replaces the token
  as the trust signal?
- What is the difference between `RequireAdmin` and `OptionalAdmin`
  (`main.go:445`) and why does `/calendar` use the second one?
- Why `RWMutex` rather than `Mutex` in `jwks.go`?

---

## Module 6 - Bytes: R2 storage

| Order | File | Lines |
|---|---|---|
| 1 | [backend/internal/storage/s3.go](../../backend/internal/storage/s3.go) | 95 |
| 2 | [backend/internal/handler/uploads_test.go](../../backend/internal/handler/uploads_test.go) | 76 |
| 3 | [backend/internal/handler/uploads.go](../../backend/internal/handler/uploads.go) | 60 |
| 4 | [backend/internal/service/uploads.go](../../backend/internal/service/uploads.go) | 54 |
| 5 | [backend/internal/handler/gallery_test.go](../../backend/internal/handler/gallery_test.go) | 202 |
| 6 | [backend/internal/handler/gallery.go](../../backend/internal/handler/gallery.go) | 77 |
| 7 | [backend/internal/service/gallery.go](../../backend/internal/service/gallery.go) | 90 |
| 8 | [backend/internal/repository/gallery.go](../../backend/internal/repository/gallery.go) | 71 |
| 9 | [backend/internal/service/hero_video.go](../../backend/internal/service/hero_video.go) | 181 |
| 10 | [backend/internal/handler/hero_video.go](../../backend/internal/handler/hero_video.go) | 111 |
| 11 | [backend/internal/repository/hero_video.go](../../backend/internal/repository/hero_video.go) | 78 |

**Primer sections:** `io.Reader and io.Writer`, `multipart form parsing`,
`defer file.Close()`, `wrapping a third-party SDK behind your own interface`,
`sync.Mutex + TTL caching`.

**Focus:** the `URLPresigner` / `PublicURLBuilder` interfaces (defined in
`service/`, satisfied by `*storage.S3Client`). Your services never import the
AWS SDK. That is why `service/posts.go` is testable without network access, and
why swapping R2 for real S3 was a config change rather than a rewrite. This is
Module 2's interface lesson applied to a *third-party* dependency.

`hero_video.go` also has a 5-minute in-memory cache guarded by a mutex - the
same TTL-cache idea as `jwks.go` and `prompt.go`. Three instances of one
pattern; notice the repetition.

**Drill:** rebuild `service/uploads.go` (54 lines) from scratch. Then trace an
image from `<input type=file>` in the browser to a key in the R2 bucket,
writing down every transformation the bytes go through.

**Checkpoint:**
- Why does a presigned URL expire, and what would break if you served the
  bucket publicly instead?
- Why do gallery album images use a public URL but other post images use a
  presigned one?
- What is `io.Reader` and why does `UploadFile` take one instead of `[]byte`?

---

## Module 7 - Side effects: posts

The first slice where *writing* does more than write. One `POST /posts` inserts
a row, fires a Discord webhook, and enqueues a translation job - two of those in
the background.

| Order | File | Lines |
|---|---|---|
| 1 | [backend/internal/handler/posts_test.go](../../backend/internal/handler/posts_test.go) | 139 |
| 2 | [backend/internal/handler/posts.go](../../backend/internal/handler/posts.go) | 194 |
| 3 | [backend/internal/service/posts.go](../../backend/internal/service/posts.go) | 437 |
| 4 | [backend/internal/repository/posts.go](../../backend/internal/repository/posts.go) | 256 |

**Primer sections:** `go func() - starting a goroutine`,
`fire-and-forget and why context matters`, `function types as fields
(EnqueueFn)`, `setter injection`, `COALESCE and the locale join`.

**Note:** `writeJSON` and `writeError` - used by every handler in the repo -
are defined at the bottom of `posts.go` ([posts.go:184-193](../../backend/internal/handler/posts.go#L184-L193)).
Unexported functions are shared across all files in the same package, which is
why `reactions.go` could call `writeError` back in Module 2 without importing
anything.

**Focus - three ideas:**

1. **Fire-and-forget with a fresh context.** The Discord send and the
   translation enqueue run in `go func()` with `context.Background()`, *not*
   the request context. If they used the request context, the HTTP response
   returning would cancel them mid-flight. Understanding this one detail is
   understanding most of what context is for.
2. **Diff before enqueue.** `Update` compares old and new before queuing a
   translation job, so a PATCH that only changes a date costs nothing. The same
   pattern recurs in `service/calendar.go` and `service/pages.go`.
3. **Setter injection** (`SetTranslationQueue`, `SetTagRepository`,
   `SetAdminLookup`). The service works without them; they add capability when
   present. That is what makes the whole app degrade gracefully when
   `GEMINI_API_KEY` is missing instead of crashing.

**Drill:** rebuild `PostService.Create` from scratch, then deliberately break
it - change `context.Background()` to `r.Context()` and observe (add a
`log.Println` at the top and bottom of the goroutine) what happens to the
Discord send under load.

**Checkpoint:**
- Why does `Create` return to the client *before* Discord has been notified?
  What is the trade-off, and is it the right one for a church website?
- If the translation enqueue fails, what does the user see? Where is that
  decided?
- Why is the locale join in the repository and not the service?

---

## Module 8 - Outbound: Discord

17 files, 1,861 lines, and the only package in your repo organised by
*capability* rather than by layer. Read it as a case study in when to break your
own architecture rule.

| Order | File | Lines |
|---|---|---|
| 1 | [backend/internal/discord/mentions.go](../../backend/internal/discord/mentions.go) + [test](../../backend/internal/discord/mentions_test.go) | 51 |
| 2 | [backend/internal/discord/identity.go](../../backend/internal/discord/identity.go) + [test](../../backend/internal/discord/identity_test.go) | 86 |
| 3 | [backend/internal/discord/webhook.go](../../backend/internal/discord/webhook.go) | 105 |
| 4 | [backend/internal/discord/serializer.go](../../backend/internal/discord/serializer.go) + [test](../../backend/internal/discord/serializer_test.go) | 498 |
| 5 | [backend/internal/discord/attachments.go](../../backend/internal/discord/attachments.go) + [test](../../backend/internal/discord/attachments_test.go) | 132 |
| 6 | [backend/internal/discord/send.go](../../backend/internal/discord/send.go) + [test](../../backend/internal/discord/send_test.go) | 461 |
| 7 | [backend/internal/discord/state.go](../../backend/internal/discord/state.go) + [test](../../backend/internal/discord/state_test.go) | 120 |
| 8 | [backend/internal/discord/oauth.go](../../backend/internal/discord/oauth.go) + [test](../../backend/internal/discord/oauth_test.go) | 166 |
| 9 | [backend/internal/handler/discord_oauth.go](../../backend/internal/handler/discord_oauth.go) + [test](../../backend/internal/handler/discord_oauth_test.go) | 242 |

**Primer sections:** `http.Client and building requests`,
`multipart.Writer for file uploads`, `crypto/hmac and constant-time compare`,
`httptest.NewServer for mocking outbound calls`, `the OAuth redirect dance`.

**Focus:** `state.go` (70 lines) is the most security-dense file in your repo.
The OAuth callback is a public endpoint with no Bearer token, so the HMAC
signature on the `state` parameter is the *only* thing proving the request came
from your own link flow. Read it slowly. Note `hmac.Equal` rather than `==` -
constant-time comparison exists so an attacker cannot learn the signature one
byte at a time by measuring response times.

`send_test.go` shows the standard Go technique for testing outbound HTTP:
`httptest.NewServer` spins up a real local server, and you point the client at
its URL. No mocking library, no interfaces needed. Compare this to the
interface-mocking in Module 2 and understand why each is used where it is.

**Drill:** rebuild `state.go` from `state_test.go`. Then rebuild
`mentions.go`. Then read `serializer.go` and write down every Discord API field
your code produces.

**Checkpoint:**
- Why does the `discord/` package not follow handler/service/repository?
- Walk through the full OAuth link flow, naming which endpoint runs at each
  step and what carries trust at each hop.
- Why `hmac.Equal` and not `==`?
- If Discord is down for an hour, what does an admin creating a post see?

---

## Module 9 - Concurrency: translation engine

**The hardest module, and the most valuable.** This is a real background job
system: a queue table, a polling worker, distributed locking, retry limits, a
content-hash cache, and a hot-reloadable prompt. 2,325 lines.

| Order | File | Lines |
|---|---|---|
| 1 | [backend/internal/translation/models.go](../../backend/internal/translation/models.go) | 67 |
| 2 | [backend/internal/translation/detect_test.go](../../backend/internal/translation/detect_test.go) | 155 |
| 3 | [backend/internal/translation/detect.go](../../backend/internal/translation/detect.go) | 168 |
| 4 | [backend/internal/translation/queue.go](../../backend/internal/translation/queue.go) | 71 |
| 5 | [backend/internal/translation/prompt.go](../../backend/internal/translation/prompt.go) | 109 |
| 6 | [backend/internal/translation/translator_test.go](../../backend/internal/translation/translator_test.go) | 91 |
| 7 | [backend/internal/translation/translator.go](../../backend/internal/translation/translator.go) | 366 |
| 8 | [backend/internal/translation/worker.go](../../backend/internal/translation/worker.go) | 197 |
| 9 | [backend/internal/repository/translation.go](../../backend/internal/repository/translation.go) | 301 |
| 10 | [backend/internal/repository/finetuning.go](../../backend/internal/repository/finetuning.go) | 40 |
| 11 | [backend/internal/service/translation.go](../../backend/internal/service/translation.go) | 204 |
| 12 | [backend/internal/handler/admin_translations_test.go](../../backend/internal/handler/admin_translations_test.go) | 177 |
| 13 | [backend/internal/handler/admin_translations.go](../../backend/internal/handler/admin_translations.go) | 205 |
| 14 | [backend/cmd/repair-translations/main.go](../../backend/cmd/repair-translations/main.go) | 174 |

**Primer sections:** `goroutines and the happens-before rule`,
`time.Ticker`, `the stop-channel shutdown pattern`, `select`,
`context cancellation vs timeout`, `crypto/sha256`, `sync.Mutex for cache maps`.

**Read [docs/agents/backend.md](../agents/backend.md) → "Translation engine"
before the code.** You wrote extensive notes there; they are the design doc for
this module and they explain decisions the code cannot.

**Focus - four ideas, in order:**

1. **`detect.go` - the 0.4 ratio.** A pure function, fully tested, no I/O.
   Start here; it is Module 4 material sitting inside the hardest module.
2. **`worker.go` - the loop.** A `time.Ticker` and a `for { select { ... } }`,
   shut down by **context cancellation** rather than a separate stop flag - so
   the same `ctx` ends the loop *and* aborts an in-flight query inside `tick`.
   Note the `sync.Once` in `Start` and the `done` channel closed on exit: `Stop`
   waits on it, so returning from `Stop` means the goroutine has really
   finished. This is *the* canonical Go background-worker shape.
3. **`FOR UPDATE SKIP LOCKED`** in `repository/translation.go`. This is how two
   copies of your backend can poll the same queue table without ever processing
   the same job twice - the database does the locking. It is why the design
   survives Render restarting your container mid-job.
4. **`prompt.go` - the keyed cache.** Read the note in backend.md about the
   single-`content`-field bug: with two prompts, an unkeyed cache would have
   served Vietnamese output for an English target *with no error anywhere*. A
   perfect example of a bug that types cannot catch and only a mental model can.

**Drill:** rebuild `detect.go` from its test. Then rebuild `worker.go`'s
`Start`/`Stop`/`tick` from scratch - it is only ~197 lines and it is the
highest-leverage 197 lines in your entire repo for a backend interview.

**Checkpoint:**
- Why a polling worker on a table instead of an in-memory Go channel queue?
  (Hint: what happens when Render restarts the container?)
- What exactly does `FOR UPDATE SKIP LOCKED` prevent?
- Where does the sha256 hash come from and what does caching on it save you?
- The worker retries 3 times then marks `failed`. Why not retry forever?
- `Stop()` cancels a context *and* waits on a `done` channel. What breaks if you
  drop the wait and just cancel?

---

## Module 10 - The big one: calendar

Your largest feature: 2,270 lines, bidirectional translation, place resolution,
AI naming, month-range overlap queries, and transactions.

| Order | File | Lines |
|---|---|---|
| 1 | [backend/internal/service/calendar_test.go](../../backend/internal/service/calendar_test.go) | 75 |
| 2 | [backend/internal/handler/calendar.go](../../backend/internal/handler/calendar.go) | 302 |
| 3 | [backend/internal/service/calendar.go](../../backend/internal/service/calendar.go) | 525 |
| 4 | [backend/internal/service/place_namer_test.go](../../backend/internal/service/place_namer_test.go) | 381 |
| 5 | [backend/internal/service/place_namer.go](../../backend/internal/service/place_namer.go) | 262 |
| 6 | [backend/internal/repository/calendar.go](../../backend/internal/repository/calendar.go) | 725 |

**Primer sections:** `time.Time and time zones`, `database transactions with
pgx`, `the typed-nil interface trap`, `errors.Is and error wrapping`.

**Read `docs/agents/backend.md` → "Place naming" first.** It documents three
invariants, each pinned by a test - that section is a model of how to
document a feature and worth studying as *writing*, not just as reference.

`repository/calendar.go` is 725 lines and you should **not** read it top to
bottom. Read one query at a time, driven by the service method that calls it.
Start with `GetEventsByMonth` and understand the range-overlap condition
(`date < first-of-next-month AND COALESCE(end_date, date) >= first-of-month`)
and why a multi-day event appears in both months.

**Focus - the typed-nil trap.** `main.go:100-112` has a long comment about
assigning a nil `*Translator` into a `service.PlaceNamer` interface variable.
An interface in Go holds *(type, value)*; a nil pointer inside a non-nil type
makes the interface itself non-nil, so `if placeNamer != nil` passes and the
next call panics. **This is the single most notorious Go gotcha** and your
codebase hit it for real. Understand it here; you will be asked about it.

**Drill:** rebuild `place_namer.go`'s `resolve` from `place_namer_test.go`. The
test pins all three invariants, so if you get it right, you get them right.

**Checkpoint:**
- Why is `calendar_places` keyed by normalized address rather than by name?
- Trace what happens when an admin saves an event at a brand-new address, and
  again at a known one. How many Gemini calls each, and why?
- Why is `placeNameMaxTokens` 2048 for a two-word answer?
- Explain the typed-nil interface trap to someone who has never written Go.

---

## Module 11 - Transactional replace: pages

| Order | File | Lines |
|---|---|---|
| 1 | [backend/internal/handler/pages_test.go](../../backend/internal/handler/pages_test.go) | 353 |
| 2 | [backend/internal/handler/pages.go](../../backend/internal/handler/pages.go) | 188 |
| 3 | [backend/internal/service/pages.go](../../backend/internal/service/pages.go) | 171 |
| 4 | [backend/internal/repository/pages.go](../../backend/internal/repository/pages.go) | 431 |

**Primer sections:** `map[string]any and JSONB`, `tx.Begin / defer tx.Rollback
/ tx.Commit`, `the two-COALESCE join`.

**Focus:** `ReplaceBlocks` - a transactional upsert-plus-delete that also
cleans up orphaned translations. If the delete succeeded and the insert failed
without a transaction, a page would go blank in production. Read
`defer tx.Rollback(ctx)` and understand why rolling back an already-committed
transaction is a harmless no-op - that idiom is how Go code stays correct on
every early-return path without a `finally` block.

**Drill:** write out the SQL that runs when an admin saves a 3-block About page
that previously had 5 blocks. Then rebuild `service/pages.go` from scratch.

**Checkpoint:**
- Why `defer tx.Rollback(ctx)` immediately after `Begin`, before you know
  whether you'll commit?
- Sections vs blocks - why do both exist, and which is the newer model?
- What are the two COALESCE joins doing on a `?locale=vi` read?

---

## Module 12 - RAG: the assistant

| Order | File | Lines |
|---|---|---|
| 1 | [backend/internal/handler/assistant_test.go](../../backend/internal/handler/assistant_test.go) | 151 |
| 2 | [backend/internal/handler/assistant.go](../../backend/internal/handler/assistant.go) | 77 |
| 3 | [backend/internal/service/groq.go](../../backend/internal/service/groq.go) | 114 |
| 4 | [backend/internal/service/assistant.go](../../backend/internal/service/assistant.go) | 247 |
| 5 | [backend/internal/repository/assistant.go](../../backend/internal/repository/assistant.go) | 310 |

**Primer sections:** `per-IP rate limiting with a map + mutex`,
`strings.Builder for prompt assembly`, `full-text search in Postgres`.

**Focus:** this is a complete RAG pipeline in 899 lines and you should be able
to name all four stages: retrieve (SQL in the repository), assemble (build the
context string), generate (Groq call), respond. Compare `groq.go` to
`translation/translator.go` - two hand-rolled LLM clients, no SDK, same shape.
Ask yourself what could be shared and whether it should be.

**Drill:** rebuild `service/groq.go` from scratch. Then add one new retrieval
source to the assistant, test-first.

**Checkpoint:**
- Why is `POST /assistant/chat` public, and what stops one visitor burning your
  Groq quota?
- What exactly goes into the prompt, and where would you look to change it?
- Why raw `net/http` instead of an official SDK? (backend.md answers this.)

---

## Module 13 - Final boss: main.go

| File | Lines |
|---|---|
| [backend/cmd/server/main.go](../../backend/cmd/server/main.go) | 500 |

500 lines that reference every module before it. Now you can read it.

**Primer sections:** `the composition root`, `defer runs LIFO`,
`signal.Notify and graceful shutdown`, `blank imports (_ "driver")`,
`//go:embed`.

**Read it in five passes, in this order:**

1. **Lines 34-56** - `runMigrations`. Embedded SQL, the `pgx5://` scheme
   rewrite, `migrate.ErrNoChange` as a non-error.
2. **Lines 58-147** - env loading, pool creation, and the translation wiring.
   Re-read the comment at lines 86-112 now that you've done Modules 9 and 10 -
   it should read completely differently than it did in week one.
3. **Lines 155-296** - the construction block. Every `NewXRepository` →
   `NewXService` → `NewXHandler` chain. Notice that **every optional
   capability is a nil check**: no S3 means no gallery handler means no gallery
   routes. The app runs with any subset of its env vars configured.
4. **Lines 298-475** - the route table. Read the comments as carefully as the
   code; the public/admin split is documented inline because getting it wrong
   blanks the site.
5. **Lines 477-500** - graceful shutdown. `signal.Notify`, blocking on `<-stop`,
   then `server.Shutdown` with a 10-second deadline. Then work out the `defer`
   ordering: `dbPool.Close()` is deferred at line 83, `translationWorker.Stop()`
   at line 139 - defers run **last-in-first-out**, so the worker stops before
   the pool closes. That ordering is deliberate and the comment at lines 97-99
   says so.

**Drill:** on paper, without looking, draw the full object graph: every
repository, which service holds it, which handler holds that service, and which
routes it serves. Then check yourself against the file. **If you can draw this
graph, you understand your own architecture.**

**Checkpoint:**
- What happens on startup if `DATABASE_URL` is set but `GEMINI_API_KEY` is not?
  List every feature that degrades and how.
- Why is `_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"` imported
  for its side effect only?
- Why does the HTTP server run in a goroutine while `main` blocks on a channel?
- Why is `retranslate-all` registered *before* `retranslate/{id}`?
- If you added a "sermons" feature tomorrow, list every file you would touch,
  in order, per the workflow in AGENTS.md.

---

## After Module 13

You will have read every line of Go in the project. Three things to do next:

1. **Build one feature entirely by hand.** No AI. Follow AGENTS.md's 8-step
   workflow literally. Something small - "pin a post to the top of the list" is
   a good size. Doing this once end to end without help converts recognition
   into ability, which is the difference this whole path is aimed at.
2. **Write the postmortems.** You have real, non-trivial war stories: the
   typed-nil interface bug, the unkeyed `PromptCache`, the `MAX_TOKENS`
   truncation, the `ERR_REQUIRE_ESM` production 500. Write each up as
   *symptom → investigation → root cause → fix → what it taught*. These are
   interview gold and you already own them.
3. **Then read the frontend.** 120 files, 12,653 lines of TypeScript/React -
   roughly the same size as the backend. It deserves its own path, and it will
   go faster because you will already understand the API contract from this side.

## Progress checklist

- [ ] Module 0 - Go survival kit
- [ ] Module 1 - The spine (139 lines)
- [ ] Module 2 - Reactions (445)
- [ ] Module 3 - Tags (517)
- [ ] Module 4 - Model layer (1,596)
- [ ] Module 5 - Middleware and auth (613)
- [ ] Module 6 - R2 storage (1,095)
- [ ] Module 7 - Posts (1,026)
- [ ] Module 8 - Discord (1,861)
- [ ] Module 9 - Translation engine (2,325)
- [ ] Module 10 - Calendar (2,270)
- [ ] Module 11 - Pages (1,143)
- [ ] Module 12 - Assistant (899)
- [ ] Module 13 - main.go (500)
- [ ] Built one feature by hand, no AI
- [ ] Wrote up the four postmortems
