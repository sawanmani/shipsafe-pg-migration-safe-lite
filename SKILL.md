---
name: pg-migration-safe-lite
description: Free static checker that flags catastrophic PostgreSQL migration patterns - DROP TABLE, DROP COLUMN, DELETE/UPDATE without WHERE - before they destroy production data. Use when the user says things like "review this migration", "is this SQL safe", "will this drop data", or "check my .sql migrations". This is the free lite edition; the full 10-rule zero-downtime analyzer is available from ShipSafe.
---

# pg-migration-safe-lite (free)

Catches the four "always-wrong-in-production" migration patterns in your `.sql`
files before they run:

- `DROP TABLE`
- `ALTER TABLE ... DROP COLUMN`
- `DELETE FROM ...` with no `WHERE`
- `UPDATE ... SET ...` with no `WHERE`

Zero dependencies, fully offline, deterministic. It only **reads** `.sql` files —
it never connects to or executes against your database.

## When to use
When reviewing database migrations / schema-change SQL for destructive operations.

## How to run
```bash
node scripts/audit.mjs path/to/migrations/            # scan a directory
node scripts/audit.mjs db/migrations/001.sql          # scan one file
node scripts/audit.mjs db/migrations/ --fail-on critical   # CI gate (exit 1 on a hit)
node scripts/audit.mjs db/migrations/ --format md     # Markdown report
```
Exit codes: `0` ok · `1` findings at/above `--fail-on` · `2` usage/runtime error.

## Limitations (honest)
- Free **lite**: only the 4 critical destructive rules. It does **not** check the
  locking / table-rewrite patterns (non-concurrent `CREATE INDEX`, `ADD COLUMN
  NOT NULL`, `ALTER COLUMN TYPE`, locking constraints, `VACUUM FULL`, `RENAME`) —
  those are in the full analyzer.
- Heuristic static analysis for PostgreSQL only. Does not execute SQL, measure
  real lock duration, or know row counts. A clean report means "no catastrophic
  patterns detected", not a guarantee.

## Get the full version
**pg-migration-safe** (10 rules, risk-ranked, PR-ready Markdown reports, CI
`--fail-on` tiers) → https://shipsafe.gumroad.com/l/pg-migration-safe
