// Package migrations embeds all SQL migration files into the binary so
// the server can run migrate.Up() without needing a separate migrations/
// directory on disk in production.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
