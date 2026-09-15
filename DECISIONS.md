# Decisions

Design council output goes here. Each entry is dated and named after the
fork, written by the chairman. Entry format is defined in
.claude/design-council.md, not duplicated here.

---

## 2026-09-14 - How recurring calendar events are stored, read, and edited

**Status:** concluded 2026-09-14. Three proposers, two verifiers, chairman
ruling below. Pending only the owner's own words at the end of this entry.

**The fork.** A congregation member asked for recurring birthdays - the admin
currently re-types roughly forty birthdays by hand every year. Scope was
widened by the owner before the council convened: solve recurrence as a
general primitive available to any event type, not as a birthday special
case. Weekly bible study has the same problem and would otherwise bring us
straight back to this fork.

**Initial instinct (owner, written before any subagent ran).**

> "I think for brute force, I would go with just a rule on the row, like if
> it's birthday, recurring once a year, if it's bible study, recurring once a
> month. But I also think about scalability, and I think that's when separate
> source comes in. On the UI, I imagine it would just be a toggle, just
> exactly like Google Calendar - but not sure how the backend works."

Noted at the time, before dispatch:

- The toggle instinct is right, but a toggle implies a series, and a series
  implies that every edit and delete must ask *this one / this and following /
  all*. `CalendarService.DeleteEvent` takes a single id and has no seam for
  that question.
- Binding recurrence to `event_type` would reintroduce the trap migration
  `000012` removed. Event types became runtime-creatable specifically so
  adding a category needs no deploy; a type-to-frequency map in Go would mean
  the first admin-created recurring type needs a deploy again. Recurrence has
  to be a property of the event or the series, not of its type.
- "Scalability" will not survive a verifier at roughly one hundred members.
  The real argument for decoupling is that a birthday is a fact about a
  person, and a person's name should never enter the translation queue -
  which `CreateEvent`'s unconditional enqueue of `title` currently guarantees
  it does.

**Prior art given to all three proposers as raw material.** RFC 5545
(`RRULE`/`EXRULE`/`RDATE`/`EXDATE`). Google Calendar keeps the rule on a
parent event, generates instances, and materializes a row only for
occurrences that are edited or cancelled; instances carry `recurringEventId`
and `originalStartTime`, so an occurrence stays identifiable after being
moved. Known naive-implementation breakages: monthly-on-the-31st, Feb 29
birthdays, DST.

---

### Chairman's ruling - 2026-09-14

**The decision, in one paragraph you can say out loud.** We are storing
recurring events as real rows, not as a rule that gets expanded every time
somebody looks at the calendar. When an admin ticks "repeats yearly" we
generate the next three years of occurrences as ordinary `calendar_events`
rows that share a `series_id`, so every read path, every export, every React
key and the assistant keep working untouched, and the end-date CHECK
constraint that migration `000008` already added validates a generated
occurrence exactly the way it validates a hand-typed one. The single thing we
change about existing machinery is that a translation now belongs to the
series rather than to the occurrence, so forty birthdays cost forty
review-queue entries once instead of two hundred - that was the only
real objection to this design, and it is fixable without adopting the
expander. We are not building RFC 5545, we are not expanding rules at read
time, and we are not letting `event_type` decide frequency. The price we
accept is that the horizon has to be extended eventually, which we make
visible in the admin panel rather than silent, and that a series-wide edit
overwrites occurrences someone hand-edited - the same thing Google does, and
we show the count before we do it.

**Direction: Proposal A's storage model, with four corrections, two of which
are borrowed from B.** Call it A-plus. Precisely:

1. **From A, kept:** materialized occurrence rows, a bounded horizon, a
   Go-generated `series_id` with no foreign key, and an untouched read path.
2. **Correction one (mine, not in any proposal):** translation identity is a
   property of the *series*, not the occurrence. Occurrence rows after the
   first do not enqueue; the month read resolves a row's translation through
   its series anchor instead of its own id. This is the fix that makes A
   survivable and nobody proposed it.
3. **Correction two (from B):** every write carries an explicit scope - this
   one / this and following / all - never defaulted. B's sentence is the best
   line produced by the whole council and it is now a house rule: *a silent
   default is how an admin deletes forty birthdays intending to delete one.*
4. **Correction three (mine):** v1 offers recurrence only on single-day
   events. This closes the `end_date` question the entire council left open,
   costs nothing, and un-deferring it later is a UI change, not a migration.
5. **Correction four (from A's own admission, upgraded):** the horizon
   running dry silently is A's worst flaw. v1 ships a manual extend action
   *plus* a visible admin warning when a series is within twelve months of
   its last occurrence. Automatic top-up is deferred, see "not in v1".

**Why not B, which is the better textbook answer.** B is the design a larger
team should build, and it was the most rigorous document submitted. It loses
here on one fact about this specific project: the maintainer cannot yet read
his own backend. B is four to six hundred lines of new Go, the largest single
chunk in the calendar, and its failure mode is a *public* one. Forget
`recurrence_rule is null` in one of the read paths and the congregation sees
phantom duplicate events. I checked how many places that is: `GetEventsByMonth`
holds two separate query strings (the raw branch at `repository/calendar.go:46`
and the locale-aware branch at `:84`), there is a third read at `:171`, and
`assistant.go` has two more. B and C both say "the existing query", singular.
Five sites where an omission puts a wrong calendar in front of the church, in
code its author cannot audit, is the wrong bet. Under A-plus that number is
zero, because a generated occurrence is indistinguishable from a typed one.

**Why not C.** C is B's idea with worse execution and I reject it outright.
Its rollback genuinely resurrects cancelled events publicly, it is silent on
`assistant.go` and on `source_locale`, and it omits the CHECK constraint that
B wrote for the same five columns. Its headline cost claim - "a
materialize-every-occurrence design would get ZERO cache benefit" - is simply
false, and verifier A was right to say so. C's one excellent artifact is its
five-surface React key enumeration, which is the most accurate thing any
proposer produced. We do not need it, and that is itself an argument for
A-plus.

**Where the verifiers were right, and where they were not.**

Verifier A did a real read of the code, not citation-dressing; verifier B
checked it and so did I, and every line reference held. Its two best catches
stand: the cache-hit branch at `translator.go:119-127` calls
`upsertTranslation` *before* returning, and that upsert unconditionally sets
`approved_by = NULL` at `:268` - so "the cache absorbs the cost" is false for
the one resource this project cannot buy more of, the owner's review time.
And `laneOf` at `CalendarGrid.tsx:161` really is a `Map` keyed by event id.

Verifier B's audit found the one place verifier A was unfair, and it is the
most important correction in the council: verifier A charged B with "new code,
not reuse" but never asked what editing a *whole series* costs under A. It is
not free. A-plus owes a bulk update and its own translation-diff decision, and
I am counting that against A openly rather than letting the minimalism framing
carry it. Verifier B was also right to rehabilitate C's partial index - it is a
standard flag-index idiom, not a mistake - and right to narrow the critique of
B's CHECK to `recurrence_until` being unconstrained.

Two places I overrule verifier A. First, it called A's translation burst "job-row
overhead", which is too kind and also imprecise: those two hundred rows are
*structurally required* under A as written, because the month query joins
translations on `t_title.record_id = e.id`, so an occurrence with no row of its
own renders in the wrong language. That is a sharper framing than anyone
reached, and it is what makes correction one necessary rather than optional.
Second, it let A's self-named falsifier stand unexamined, and that falsifier is
backwards. A claimed it would break on "any system keying attendance or
reminders to an event id". The opposite is true: under A every occurrence *has*
an id, so attendance works; under B an occurrence has no id until somebody
edits it. A named as its weakness the thing that is actually its strength.

**What all three missed, and what it turns out to mean.** The reports worried
that nobody traced `DESKTOP_CELL_BUDGET` (`CalendarGrid.tsx:46`), the
non-clickable Locations-strip row (`CalendarShell.tsx:713`), or the PNG export
under a fully expanded month. Having read them, I can settle it: this is a
non-issue under any design, because the number of events rendered in a given
month is unchanged. The admin already types those forty birthdays. Recurrence
changes who types them, not how many appear in March.

**The open questions, settled.**

*Feb 29.* B says leap-years-only and is RFC-correct. C says pin to Feb 28. I
rule for Feb 28, and I want the reasoning on the record because it is not a
technical one: this is a named person in a congregation of about a hundred, and
a church that skips a member's birthday three years in four has failed the
member, not the specification. B is right about the standard and wrong about
the people. Under A-plus this barely matters anyway - the generated dates are
ordinary rows, so if that member would rather be greeted on March 1, the admin
drags one row and no code changes. A-plus turns a philosophical dispute into an
editable field, which is the strongest single argument for it.

*Multi-day recurrence.* Genuinely unresolved by all three proposals and both
verifiers - the honest outcome of the process, not a gap in it. Ruled by
deferral: v1 disables the recurrence control when an end date is set. Note for
the record that A-plus is the only design where this is *safe rather than
merely deferred*, because a generated occurrence carries a real `end_date` that
the existing `calendar_events_end_after_start` constraint validates at write
time. B and C compute that offset in Go, where no constraint is watching.

*Is the review-queue burst decisive?* Yes, but not in the direction the council
assumed. It is decisive as a **requirement** - it kills Proposal A exactly as
written - and it is not decisive as a **choice of storage model**, because
moving translation identity to the series satisfies the requirement without the
expander. The correct reading of the settled numbers is that B and C never
saved money; all three designs make about forty Gemini calls. They saved the
owner's afternoon. That is worth more than the money, and it is now purchased
without the four hundred lines.

**Engaging with the instinct, directly.** The owner was right, and more right
than the council gave him credit for. "For brute force, I would go with just a
rule on the row" is, after three proposals and two adversarial reviews, the
direction that wins. Two of the three agents reached for the more elaborate
parent-and-rule design and the most rigorous document submitted was the one we
are not building. He should notice that his instinct beat two Sonnets and an
Opus on this fork, and he should notice *why*: he was optimizing for what he
can maintain, and the models were optimizing for what is architecturally
admirable. "Just a toggle, exactly like Google Calendar" is also correct and
ships as stated.

He was wrong about two things, and softening either would waste the exercise.
First, "if it's birthday, recurring once a year, if it's bible study, recurring
once a month" binds frequency to `event_type`, and that is the exact trap
migration `000012` was written to remove. Event types are runtime-creatable so
that adding a category needs no deploy; a type-to-frequency map in Go hands
that back. The rule goes on the event, chosen by the admin at create time, and
no Go code may branch on `event_type`. Second, "scalability" is not the reason
for any of this and will not survive contact with a hundred members and a few
hundred rows. Postgres does not notice this table. The real reason this fork
deserved a council was something he had no way to see: `CreateEvent` enqueues
every title unconditionally, so the naive version of his own instinct would
have dumped two hundred entries into the queue he personally reviews. His
instinct was right and his stated reason for doubting it was wrong, which is a
more useful thing to learn than being right for the right reason.

What the instinct becomes: **a toggle on the event, a `series_id` on the rows,
an explicit scope on every edit and delete, and translation owned by the
series.**

**Not in v1, and why deferring is safe.**

- *RRULE, `COUNT`, `EXDATE`, "every second Tuesday".* Yearly and weekly cover
  both things anyone actually asked for. A third requested pattern is the
  signal to revisit this entry - that is A's real falsifier, and unlike the one
  it named for itself, it is a good one.
- *Automatic horizon top-up on startup.* Correct eventually, but it is a
  write-on-boot on a system where migrations auto-apply and a bad deploy breaks
  production. Manual extend plus a visible warning has the same effect with
  none of that risk, and three years is a long time to get it right.
- *Series split ("this and following" as an edit rather than a delete).* B
  deferred it too and B was right.
- *Multi-day recurrence.* As above.
- *Exception markers on hand-edited occurrences.* A series edit will overwrite
  them. Google behaves identically, and the mitigation is showing the count in
  the existing `useConfirm()` / `ConfirmDialog` before it happens, not new
  schema.

Deferring all of it is safe for one structural reason: materialized rows
carrying a `series_id` can be collapsed into a parent-plus-rule later if the
site ever earns the need. The council treated A as a dead end. It is not one.

---

### Open implementation questions - raised by the owner after the ruling

Neither of these reopens the fork. Both change what gets built, and both were
surfaced by the owner reading the ruling back, not by the council.

**1. "Ends" is an admin-facing field, and it retires the horizon for most
series.**

The create form is two controls: *Repeats* (Does not repeat / Every week /
Every year) and *Ends* (Never / On `<date>`). The admin never sees a rule
string or an id.

When the admin supplies a real end date, **that date is the bound**. Generate
exactly those occurrences and stop. The three-year horizon, the manual extend
action and the twelve-month warning are all irrelevant to that series - a
bible study running a fixed term never touches them.

Correction four was written as though every series eventually runs dry. It is
not: only `Ends: Never` series do, which in practice means birthdays. The
warning must fire for open-ended series only, or it will nag about series that
ended on purpose.

One honesty note for the admin copy: `Never` is stored as three years of rows
plus a warning, not as forever. The label is a promise the warning keeps.

**2. A single-occurrence text edit must detach that occurrence's translation.**

Correction one makes a translation belong to the series - only the anchor
enqueues, and the month read resolves through `COALESCE(e.series_id, e.id)`.
That is correct right up until an admin edits one occurrence's title or notes.
That row then carries new source text while still resolving to the anchor's
translation: the English shows the new title and the Vietnamese silently shows
the old one. On a bilingual site this is exactly the failure class
`source_locale` exists to prevent, and it would not throw an error - it would
just quietly be wrong in one language.

Resolution: an occurrence whose translatable text diverges from its anchor
gets its own rows in `translations`, and the month query prefers a
row-specific translation over the series one - two left joins per translatable
field, first match wins. `UpdateEvent` already diffs before enqueuing, so the
trigger for "this text diverged" exists; what is new is the fallback order in
the read.

This is the "translation-diff decision" the ruling said A-plus owed and did
not specify. It is now specified.

**Corollary, which nobody stated.** The same applies in reverse to
`scope=all` and `scope=following`. A series-wide rename re-enqueues the
anchor, but a previously hand-edited occurrence still holds its own
translation rows and would keep showing its stale Vietnamese after the series
was renamed in English. A series-wide text edit must therefore clear the
diverged occurrences' own translations as part of the same write. This is the
translation half of the already-accepted trade-off that a series edit
overwrites hand-edited occurrences - the display half was recorded, this half
was not.

### Plain-language explanation for the owner

Every term defined, because a term you have to look up is a term I failed to
explain.

**What the fork actually was.** When you tick "repeats every year", something
has to remember that. There are exactly two ways.

The first way is to **write down every date**. Tick the box on a birthday and
the server immediately creates one calendar entry for 2027, one for 2028, one
for 2029 - real entries, the same kind you get when you type one by hand. This
is called *materializing*: turning something described by a rule into actual
saved rows. Your instinct.

The second way is to **write down the rule and do the maths later**. You save
one entry that says "this repeats yearly", and every single time anyone opens
the calendar, the server works out on the spot which dates that means and
invents the entries in memory just long enough to send them to the browser. The
entries never exist in the database. This is called *expanding at read time* -
"read time" meaning the moment someone looks, as opposed to "write time", the
moment the admin saves. That is what the other two agents proposed, and it is
how Google Calendar works internally.

**Why the second way is tempting.** You store almost nothing. A weekly bible
study is one row forever instead of fifty-two rows a year. Changing the time
means editing one row, not fifty-two.

**Why we are not doing it.** Because of what happens when it goes slightly
wrong. Once the database holds both "rule" rows and "real" rows in the same
table, every piece of code that reads that table has to remember to skip the
rule rows - otherwise the rule row *also* shows up as an event, on its original
date, forever. I counted the places in your code that read that table: five. If
one of them forgets, the congregation sees duplicate or wrong events on the
public calendar, and you would be debugging four hundred lines of Go that you
did not write. With the first way, that number is zero, because a generated
entry is byte-for-byte the same kind of thing as one you typed. Nothing needs
to know it was generated.

**The one genuine problem with your way, and the fix.** Your site auto-
translates. Right now, every time an event is saved, its title is queued for
translation into the other language, and the result lands in the queue you
review by hand. Forty birthdays times three years is a hundred and twenty
review items, of which a hundred and twenty are the same forty names repeated.
The feature meant to save you typing forty names would have handed you a
hundred and twenty things to approve. Worth knowing: the translator has a
*cache* - a memory of text it has already translated, so it does not pay Google
twice for the same words - and I checked, the cache does save the money. It
does *not* save your review time, because it still files a fresh row for you to
approve. So the fix is upstream: only the first entry in a series gets queued,
and the rest are told to look at the first one's translation. Forty reviews,
once, ever.

**The terms, so none of them are bare jargon.** A *series* is the group of
entries created by one toggle. A *`series_id`* is a random identifier stamped
on all of them so the server can find the group again - it is how "delete all
of these" knows what "these" means. *Scope* is the question Google asks you
when you edit a repeating event: this one, this and following, or all - and the
rule here is that the server must always be told explicitly which one, never
guess, because guessing is how you delete forty birthdays meaning to delete
one. A *horizon* is how far ahead we generate; ours is three years, and when a
series gets close to running out the admin panel will tell you before it does.
A *migration* is a numbered file that changes the database shape, and yours run
automatically when the backend starts, which is why a bad one breaks the live
site and why a design whose rollback is clean matters more here than it would
anywhere else.

**What you are giving up, stated plainly.** Three years from now something has
to be clicked, and you will get a warning before that. Editing a whole series
will quietly overwrite any single occurrence you had hand-edited - Google does
this too and people complain about it there. And a birthday on February 29 will
be generated on February 28 in ordinary years, which is a judgement call I made
on purpose: a member should be greeted every year, not every fourth. If she
would rather be greeted on March 1, you move that one entry, because under this
design it is just an entry.

---

### Amendment - 2026-09-14, later the same day: the revisit trigger fired

The entry above named its own tripwire: *"a third requested pattern is the
signal to revisit this entry."* The owner asked for two things within hours of
reading the ruling - the ability to edit an existing series' rule, and
Google-style custom recurrence instead of the two presets. Recorded here rather
than in a second council, because what follows changes the vocabulary and not
the decision.

**The storage decision holds, and the reason is worth being precise about.**
What the council rejected was EXPANDING a rule every time somebody reads the
calendar, which would have put a recurrence engine in front of five separate
readers - two month queries, a third read below them, and two in
`repository/assistant.go` - where forgetting one produces phantom events on the
public calendar. Rules are still expanded exactly once, on save. What lands in
`calendar_events` is still ordinary dated rows. So a richer rule vocabulary
costs generator complexity and **nothing at all on the read path**, which is
why the trigger could fire without the storage model moving. The deferral list
above assumed more patterns implied the expander; it did not.

**What changed (migration `000016`).** `recurrence_rule` widens from the two
words `weekly`/`yearly` to RFC 5545 RRULE text - `FREQ=MONTHLY;BYDAY=1SU`,
`FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR`, `COUNT=8`. The supported subset is
whatever `service.ParseRRule` can expand, and the write path validates against
exactly that set, so the database can never hold a rule the generator would
mis-handle. The DB `CHECK` is a shape backstop only, the same division of
labour as `calendar_palette_colors`' hex check.

**A side effect worth banking.** RRULE text is the string an `.ics` feed needs.
The "When this decision expires" note below identifies a phone-subscription
request as the scenario that would force a rewrite of the storage model. Storing
the standard form now costs nothing and removes part of that rewrite - the rule
would already be in the right shape, leaving only the feed itself. The expiry
condition is not gone, but it is cheaper than it was this morning.

**Editing a series' rule is now supported, with one deliberate restriction.** A
rule change applies to the WHOLE series and nothing narrower. Applying a new
rule to part of a series means splitting it in two, which the list above defers
and which nothing has yet asked for. The anchor keeps its date and identity; the
generated occurrences are rebuilt. Occurrences that had been edited individually
are destroyed, which is the trade-off already accepted for any series-wide edit
- the modal states it before the admin confirms.

Setting the rule to nothing means "stop repeating", and that turned out to have
two reasonable meanings, so it **asks**. The first implementation silently kept
every generated date - which left the form saying "does not repeat" over an
event still shown three years out, and, worse, was a silent default in exactly
the place this entry made a house rule against one. `recurrence_cleanup` is now
a required field when the rule is cleared: *keep the dates already on the
calendar*, or *also remove the ones that have not happened yet*. The past is
never touched either way - it is a record of what the church actually did, not a
schedule to tidy.

There is deliberately no "remove every date" option. That is what Delete with
scope=series already does, and one operation with two ways to wipe a series is
how the two quietly stop agreeing.

**Monthly day-of-month clamps rather than skips**, consistent with the February
29 choice: an event set for the 31st happens on the last day of a shorter month.
An nth-weekday rule is the exception - "the fifth Sunday" genuinely does not
exist in most months, and inventing one would move the event into a week nobody
chose, so those months are skipped.

**What is still not built.** Series splitting, `EXDATE`, `BYSETPOS`, sub-daily
rules, and per-occurrence exception markers.

**The horizon warning shipped on the admin dashboard**, not on the calendar. It
was built into the calendar's margin first, on the argument that a panel which
is always visible is a panel that stays correct, and the owner removed it as
unnecessary UI in a place people go to read the month rather than maintain it.
He was right: the dashboard is where maintenance belongs, and there the panel
earns its place by being ABSENT until it matters. `RepeatingEventsNotice`
renders nothing while every series still has years to run.

That leaves the rule itself untestable by eye until 2029, so `needsExtension`
takes `now` as an argument and is covered by cases that hand it a date -
including both sides of the twelve-month boundary and the two different ways a
series can be finished rather than running out. A rule whose first real
evaluation is three years away, in code that will be edited many times before
then, rots unless something exercises it.

**When this decision expires.**

Recorded separately from the deferrals above, because this one is not a
feature we chose to postpone - it is the condition under which this entry
becomes wrong.

This decision rests on a bet: that nothing outside this application ever
needs to read a repeat rule *as a rule*. Google Calendar stores the rule
because `.ics` files, CalDAV and Exchange all read it; this project has no
such consumer, so the rule can be spent at write time and discarded.

The realistic way that bet loses is someone asking to **subscribe to the
church calendar on their phone**. An `.ics` feed wants `RRULE` text, which is
precisely what Proposal B stores and this design throws away. It is a
plausible ask for a church - service times and bible study are exactly what
people subscribe to.

If that day comes, B is not a patch on A. It is a replacement of the storage
model, and this entry should be reopened rather than amended. Knowing that
now makes it a choice; discovering it later makes it a surprise.

### Owner's own words

stored the occurrences instead of the rule, because the rule would have had to be understood by five different parts of the app - and only one of them was the calendar.
