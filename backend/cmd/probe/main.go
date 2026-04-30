package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load(".env")
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		fmt.Println("connect:", err)
		os.Exit(1)
	}
	defer pool.Close()

	queries := []struct {
		label string
		sql   string
		args  []any
	}{
		{"posts count", `select count(*) from posts`, nil},
		{"page_content count", `select count(*) from page_content`, nil},
		{"calendar_events count", `select count(*) from calendar_events`, nil},
		{"calendar_month_notes count", `select count(*) from calendar_month_notes`, nil},
		{"calendar getmonth", `SELECT id, date::text, title, event_type, icon, color, notes, admin_id, created_at, updated_at FROM calendar_events WHERE EXTRACT(YEAR FROM date) = $1 AND EXTRACT(MONTH FROM date) = $2`, []any{2026, 4}},
		{"month note", `SELECT id, year, month, content, admin_id, created_at, updated_at FROM calendar_month_notes WHERE year = $1 AND month = $2`, []any{2026, 4}},
	}

	for _, q := range queries {
		rows, err := pool.Query(ctx, q.sql, q.args...)
		if err != nil {
			fmt.Printf("%-30s ERROR: %v\n", q.label, err)
			continue
		}
		n := 0
		for rows.Next() {
			n++
		}
		if rows.Err() != nil {
			fmt.Printf("%-30s ERROR rows: %v\n", q.label, rows.Err())
			rows.Close()
			continue
		}
		rows.Close()
		fmt.Printf("%-30s OK rows=%d\n", q.label, n)
	}
}
