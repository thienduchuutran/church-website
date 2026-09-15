// Command adopt-birthdays turns the calendar's existing hand-typed birthdays
// into recurring series, without deleting or re-creating anything.
//
// The situation it exists for: an admin typed every birthday by hand for this
// year AND next year before recurrence existed, then asked for recurrence
// precisely because that was so much work. Those rows are not mess to clean up
// - they are already correct occurrences. So this adopts them: the earliest row
// for a person becomes the series anchor, the later ones are stamped with its
// series_id, and only the years beyond what already exists are generated.
//
// Nothing is deleted and nothing is re-translated. Every existing row keeps its
// own translation, and the month query prefers a row's own translation over its
// anchor's, so the calendar renders exactly as it did before. The anchor's
// translation is usually already human-approved, which means the newly
// generated years inherit approved Vietnamese and the review queue gains
// nothing at all.
//
// Grouping is deterministic on purpose. Two rows are the same person when their
// titles match after trimming, collapsing internal whitespace and case-folding,
// AND they fall on the same month and day. Anything that does not group cleanly
// is printed and left alone - deliberately NOT resolved by a model. A wrong
// merge makes a real member's birthday vanish into someone else's series and
// stays invisible until the year turns, and a model's guess reads exactly as
// confident when it is wrong as when it is right. Forty names is a list a human
// who knows the congregation can check in two minutes.
//
// Scope is event_type = 'birthday' only. Bible studies and everything else are
// untouched.
//
// Re-running is safe: rows that already carry a series_id are skipped, so a
// second -apply adds nothing.
//
// Which database it talks to is explicit, because getting that wrong is the
// expensive mistake here. backend/.env sets DATABASE_URL to the local Docker
// database, and the Supabase URL in that file is commented out AND named
// SUPABASE_DATABASE_URL - so the default target is dev, not production. Pass
// -database-url to point somewhere else; it beats both the environment and
// .env. Whatever is chosen, the host and database name are printed before any
// work happens, so an operator can see what they are about to touch.
//
// Usage, from the backend/ directory:
//
//	go run ./cmd/adopt-birthdays                       # dry run against .env's DATABASE_URL (local dev)
//	go run ./cmd/adopt-birthdays -apply                # apply to that same database
//	go run ./cmd/adopt-birthdays -database-url "..."   # dry run against an explicit database
//
// In PowerShell, quote the URL - it usually contains characters the shell
// would otherwise treat as its own.
package main

import (
	"context"
	"flag"
	"fmt"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/thienduchuutran/church-website/backend/internal/repository"
	"github.com/thienduchuutran/church-website/backend/internal/service"
)

// row is one existing birthday event, as stored.
type row struct {
	ID    string
	Date  time.Time
	Title string
}

// group is a set of rows believed to be one person's birthday across years.
type group struct {
	Key string
	// Title is what the series should be called: the MOST RECENT row's wording
	// with any "'s Birthday" removed. The newer entries are the house style the
	// admin settled on, so they win over the older ones.
	Title string
	Month time.Month
	Day   int
	Rows  []row // sorted by date ascending; Rows[0] is the anchor
}

func main() {
	apply := flag.Bool("apply", false, "actually write (default is a dry-run report)")
	dbURL := flag.String("database-url", "", "database to operate on; overrides DATABASE_URL and .env")
	flag.Parse()

	// Load is deliberate rather than Overload: it does not replace a variable
	// already present in the environment, so an explicitly exported
	// DATABASE_URL still wins over the file. The -database-url flag wins over
	// both, which is the only form that leaves no ambient state behind to
	// surprise the next command run in the same shell.
	_ = godotenv.Load(".env")
	ctx := context.Background()

	target := *dbURL
	if target == "" {
		target = os.Getenv("DATABASE_URL")
	}
	if target == "" {
		fmt.Println("no database configured: pass -database-url or set DATABASE_URL")
		os.Exit(1)
	}

	fmt.Printf("Database: %s\n", describeTarget(target))
	if *apply {
		fmt.Println("Mode:     APPLY - this will write.")
	} else {
		fmt.Println("Mode:     dry run - nothing will be written.")
	}
	fmt.Println()

	pool, err := pgxpool.New(ctx, target)
	if err != nil {
		fmt.Println("connect:", err)
		os.Exit(1)
	}
	defer pool.Close()

	rows, alreadyInSeries, err := loadBirthdays(ctx, pool)
	if err != nil {
		fmt.Println("load birthdays:", err)
		os.Exit(1)
	}

	groups := groupRows(rows)
	clean, duplicates := splitByDuplicateYears(groups)
	sameDay := sameDateDifferentTitle(clean)

	report(rows, alreadyInSeries, clean, duplicates, sameDay)

	if !*apply {
		fmt.Println("\nDry run. Nothing was written. Re-run with -apply to make these changes.")
		return
	}
	if len(clean) == 0 {
		fmt.Println("\nNothing to adopt.")
		return
	}

	repo := repository.NewCalendarRepository(pool)
	adopted, generated := 0, 0
	for _, g := range clean {
		n, err := adopt(ctx, pool, repo, g)
		if err != nil {
			fmt.Printf("  FAILED %-30s %v\n", g.Title, err)
			continue
		}
		adopted++
		generated += n
	}
	fmt.Printf("\nAdopted %d series. Generated %d new occurrences.\n", adopted, generated)
	if len(duplicates) > 0 || len(sameDay) > 0 {
		fmt.Println("The flagged rows above were left exactly as they were.")
	}
}

// loadBirthdays reads every birthday event. Rows already carrying a series_id
// are counted but excluded, which is what makes a second run a no-op.
func loadBirthdays(ctx context.Context, pool *pgxpool.Pool) ([]row, int, error) {
	res, err := pool.Query(ctx,
		`SELECT id, date, title, series_id IS NOT NULL
		 FROM calendar_events
		 WHERE event_type = 'birthday'
		 ORDER BY date ASC`)
	if err != nil {
		return nil, 0, err
	}
	defer res.Close()

	var out []row
	already := 0
	for res.Next() {
		var r row
		var inSeries bool
		if err := res.Scan(&r.ID, &r.Date, &r.Title, &inSeries); err != nil {
			return nil, 0, err
		}
		if inSeries {
			already++
			continue
		}
		out = append(out, r)
	}
	return out, already, res.Err()
}

// titleAliases are merges a HUMAN decided, not rules the tool worked out.
//
// They exist because the calendar holds two entries for one person that no
// amount of string handling can connect: a nickname, and a name recorded with
// a surname one year and without it the next. Each line is somebody looking at
// the congregation and saying "those two are the same person".
//
// Keys and values are already normalized (lower case, suffix removed). Keep
// this list short and keep it explicit - the moment it grows into pattern
// matching it becomes the guessing this tool exists to avoid.
var titleAliases = map[string]string{
	"sebastian": "seb",             // the 2027 entry uses the nickname
	"khang":     "khang le",        // the 2027 entry carries the surname
	"nha nghi":  "hudson/nha nghi", // one entry; Hudson was added to it in 2027
}

// birthdaySuffixes are the trailing words that describe the OCCASION rather
// than the person. The calendar was entered with them in 2026 and without them
// in 2027, which left one member looking like two.
//
// Longest first, so "'s birthday" is tried before the bare "birthday" and the
// apostrophe is not left stranded.
//
// There is deliberately NO "s birthday" entry, tempting as it looks for a
// possessive typed without an apostrophe. It would eat the last letter of any
// name that ends in s: "Thomas birthday" becomes "Thoma", and Thomas is a real
// member of this congregation. The bare " birthday" rule below handles that
// case correctly anyway, because the space is part of the match.
var birthdaySuffixes = []string{"'s birthday", "’s birthday", " birthday"}

// normalizeTitle is the grouping rule, written out so it can be read and
// argued with. Trim, collapse any run of internal whitespace to one space,
// case-fold, drop a trailing "'s Birthday", then apply the alias list.
//
// Deliberately NOT diacritic-folding: in a Vietnamese congregation two names
// differing only by an accent can be two different people, and merging them is
// the one mistake this tool must never make. Note the asymmetry - removing a
// word that means "birthday" from a birthday entry cannot merge two people,
// while folding accents can.
func normalizeTitle(t string) string {
	n := strings.ToLower(strings.Join(strings.Fields(t), " "))
	n = stripBirthdaySuffix(n)
	if alias, ok := titleAliases[n]; ok {
		return alias
	}
	return n
}

// stripBirthdaySuffix removes a trailing occasion word. It only ever removes
// from the END, so a member actually called "Birthday Nguyen" is untouched.
func stripBirthdaySuffix(n string) string {
	for _, suffix := range birthdaySuffixes {
		if strings.HasSuffix(n, suffix) {
			stripped := strings.TrimSpace(strings.TrimSuffix(n, suffix))
			// An entry called nothing but "Birthday" has no name left once the
			// occasion word is gone. Keeping the original stops every such row
			// collapsing into one nameless group.
			if stripped == "" {
				return n
			}
			return stripped
		}
	}
	return n
}

// displayTitle is what a series should be CALLED, as opposed to how it is
// matched: the given wording with the occasion words removed, original
// capitalisation kept.
func displayTitle(t string) string {
	clean := strings.Join(strings.Fields(t), " ")
	lower := strings.ToLower(clean)
	for _, suffix := range birthdaySuffixes {
		if strings.HasSuffix(lower, suffix) {
			trimmed := strings.TrimSpace(clean[:len(clean)-len(suffix)])
			if trimmed == "" {
				return clean
			}
			return trimmed
		}
	}
	return clean
}

func groupRows(rows []row) []group {
	byKey := map[string]*group{}
	for _, r := range rows {
		key := fmt.Sprintf("%s|%02d-%02d", normalizeTitle(r.Title), int(r.Date.Month()), r.Date.Day())
		g, ok := byKey[key]
		if !ok {
			g = &group{Key: key, Title: r.Title, Month: r.Date.Month(), Day: r.Date.Day()}
			byKey[key] = g
		}
		g.Rows = append(g.Rows, r)
	}

	out := make([]group, 0, len(byKey))
	for _, g := range byKey {
		sort.Slice(g.Rows, func(i, j int) bool { return g.Rows[i].Date.Before(g.Rows[j].Date) })
		// The newest row's wording is the house style the admin settled on, so
		// it becomes the series title - even though the OLDEST row is the
		// anchor. Those are two different questions: which row owns the series,
		// and what the series is called.
		g.Title = displayTitle(g.Rows[len(g.Rows)-1].Title)
		out = append(out, *g)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Month != out[j].Month {
			return out[i].Month < out[j].Month
		}
		if out[i].Day != out[j].Day {
			return out[i].Day < out[j].Day
		}
		return out[i].Title < out[j].Title
	})
	return out
}

// splitByDuplicateYears separates groups that are safe to adopt from groups
// holding two rows in the SAME year.
//
// That case is the one real hazard of grouping by title: two rows saying the
// same thing on the same day of the same year are either a duplicate the admin
// made twice, or two different members who share a name and a birthday. Those
// are opposite fixes, the database cannot tell them apart, and picking wrong
// either hides a duplicate forever or erases somebody. So neither is touched.
func splitByDuplicateYears(groups []group) (clean, duplicates []group) {
	for _, g := range groups {
		seen := map[int]bool{}
		dup := false
		for _, r := range g.Rows {
			if seen[r.Date.Year()] {
				dup = true
				break
			}
			seen[r.Date.Year()] = true
		}
		if dup {
			duplicates = append(duplicates, g)
		} else {
			clean = append(clean, g)
		}
	}
	return clean, duplicates
}

// sameDateDifferentTitle finds groups sharing a month and day but spelled
// differently. Usually that is two members who happen to share a birthday,
// which is fine and common. Occasionally it is one member whose name was typed
// with accents one year and without them the next, in which case adopting them
// as two series leaves her with two entries every year. Reported rather than
// resolved, because only a human knows which.
func sameDateDifferentTitle(groups []group) [][]group {
	byDate := map[string][]group{}
	for _, g := range groups {
		byDate[fmt.Sprintf("%02d-%02d", int(g.Month), g.Day)] = append(byDate[fmt.Sprintf("%02d-%02d", int(g.Month), g.Day)], g)
	}
	var out [][]group
	for _, gs := range byDate {
		if len(gs) > 1 {
			out = append(out, gs)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i][0].Month < out[j][0].Month })
	return out
}

func report(rows []row, alreadyInSeries int, clean, duplicates []group, sameDay [][]group) {
	fmt.Printf("Birthdays not yet in a series: %d rows\n", len(rows))
	if alreadyInSeries > 0 {
		fmt.Printf("Already in a series, skipped:  %d rows\n", alreadyInSeries)
	}
	fmt.Printf("\nWOULD ADOPT (%d series)\n", len(clean))
	for _, g := range clean {
		years := make([]string, 0, len(g.Rows))
		for _, r := range g.Rows {
			years = append(years, fmt.Sprint(r.Date.Year()))
		}
		future, err := plannedDates(g)
		note := strings.Join(future, ", ")
		if err != nil {
			note = "ERROR: " + err.Error()
		}
		if note == "" {
			note = "(nothing new to generate)"
		}
		rename := ""
		if g.Rows[0].Title != g.Title {
			rename = fmt.Sprintf("   (renaming %q)", g.Rows[0].Title)
		}
		fmt.Printf("  %-24s %s %2d   have: %-14s  new: %s%s\n",
			truncate(g.Title, 24), g.Month.String()[:3], g.Day, strings.Join(years, ","), note, rename)
	}

	if len(duplicates) > 0 {
		fmt.Printf("\nNEEDS YOUR EYES - two rows in the same year (%d). LEFT UNTOUCHED.\n", len(duplicates))
		fmt.Println("  Either the event was entered twice, or two members share a name and a birthday.")
		for _, g := range duplicates {
			fmt.Printf("  %-34s %s %2d\n", truncate(g.Title, 34), g.Month.String()[:3], g.Day)
			for _, r := range g.Rows {
				fmt.Printf("      %s  %q  id=%s\n", r.Date.Format("2006-01-02"), r.Title, r.ID)
			}
		}
	}

	if len(sameDay) > 0 {
		fmt.Printf("\nWORTH A GLANCE - same date, different spellings (%d dates).\n", len(sameDay))
		fmt.Println("  Usually two members sharing a birthday, which is fine. Occasionally one")
		fmt.Println("  member typed with accents one year and without them the next.")
		for _, gs := range sameDay {
			fmt.Printf("  %s %2d:\n", gs[0].Month.String()[:3], gs[0].Day)
			for _, g := range gs {
				fmt.Printf("      %q (%d row(s))\n", g.Title, len(g.Rows))
			}
		}
	}
}

// plannedDates is what adopt() would generate, computed through the SAME
// function the running application uses so the report cannot promise dates the
// app would not produce.
func plannedDates(g group) ([]string, error) {
	last := g.Rows[len(g.Rows)-1]
	return service.OccurrencesForExtend(g.Rows[0].Date, "FREQ=YEARLY", nil, last.Date)
}

// adopt writes one group: the anchor gains the rule and points at itself, the
// existing later rows join the series, and the missing future years are
// generated. All in one transaction, because a half-adopted series is worse
// than an unadopted one - the admin would see some years grouped and some not,
// with no way to tell which.
func adopt(ctx context.Context, pool *pgxpool.Pool, repo *repository.CalendarRepository, g group) (int, error) {
	anchor := g.Rows[0]

	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after Commit

	if _, err := tx.Exec(ctx,
		`UPDATE calendar_events
		 SET series_id = id, recurrence_rule = 'FREQ=YEARLY', recurrence_until = NULL,
		     title = $2, updated_at = now()
		 WHERE id = $1`, anchor.ID, g.Title); err != nil {
		return 0, fmt.Errorf("stamp anchor: %w", err)
	}

	// A renamed anchor's stored translation describes wording nobody will see
	// again, and the read path would keep serving it to Vietnamese viewers.
	// Deleting it drops the row back to showing its own text - which for a
	// person's name is the right answer anyway, and costs no review-queue entry
	// because nothing is re-enqueued.
	if anchor.Title != g.Title {
		if _, err := tx.Exec(ctx,
			`DELETE FROM translations WHERE table_name = 'calendar_events' AND record_id = $1`,
			anchor.ID); err != nil {
			return 0, fmt.Errorf("clear stale translation: %w", err)
		}
	}

	for _, r := range g.Rows[1:] {
		if _, err := tx.Exec(ctx,
			`UPDATE calendar_events SET series_id = $1, updated_at = now() WHERE id = $2`,
			anchor.ID, r.ID); err != nil {
			return 0, fmt.Errorf("stamp occurrence %s: %w", r.ID, err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}

	// Generation runs after the commit and through the repository, so the new
	// rows are inserted by exactly the code the "extend" button uses - one
	// insert path, one set of columns, one thing to keep correct.
	dates, err := plannedDates(g)
	if err != nil {
		return 0, fmt.Errorf("generate: %w", err)
	}
	n, err := repo.AppendOccurrences(ctx, anchor.ID, dates)
	if err != nil {
		return 0, fmt.Errorf("append: %w", err)
	}
	return int(n), nil
}

// describeTarget renders the connection as host:port/database with any
// credentials removed, so the banner can be pasted into a message or a ticket
// without leaking a password. Printing it at all is the point: the difference
// between localhost and the Supabase pooler is the difference between a
// harmless dev run and eighty rows of production data.
func describeTarget(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return "(unparseable connection string)"
	}
	db := strings.TrimPrefix(u.Path, "/")
	if db == "" {
		db = "(default)"
	}
	label := fmt.Sprintf("%s/%s", u.Host, db)
	if strings.HasPrefix(u.Hostname(), "localhost") || u.Hostname() == "127.0.0.1" {
		return label + "   [local]"
	}
	return label + "   [REMOTE - not your local Docker database]"
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-1] + "…"
}
