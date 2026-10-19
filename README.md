# pg-migration-safe-lite 🛡️ (free)

A **zero-dependency** static checker that catches the four catastrophic
PostgreSQL migration patterns before they hit production:

| Pattern | Why it's a disaster |
|---|---|
| `DROP TABLE` | Irreversible data loss |
| `ALTER TABLE … DROP COLUMN` | Permanently deletes stored data |
| `DELETE FROM …` (no `WHERE`) | Wipes the whole table |
| `UPDATE … SET …` (no `WHERE`) | Rewrites every row + table-wide locks |

It only reads `.sql` files — **never connects to or runs anything against your DB**.

## Quick start
```bash
node scripts/audit.mjs db/migrations/ --fail-on critical
```
Works as a plain CLI, in CI, or as an **Agent Skill** (SKILL.md) for Claude Code,
Cursor, Codex, Gemini CLI, Copilot and other agents that read the open SKILL.md standard.

### Options
```
--format <json|md|text>   Output format (default: text)
--fail-on critical        Exit 1 if any critical finding exists (CI gate)
--max-snippets <n>        Max example statements per rule
--help                    Usage
```

## Example
```
== db/migrations/001.sql (4 statement(s)) ==
  [CRITICAL] delete-without-where — DELETE with no WHERE clause wipes the entire table. (1)
    remediation: Add a WHERE clause, or run an intentional TRUNCATE within an explicit, reviewed step.
      - line 3: DELETE FROM sessions
```

## What the full version adds
This free tool checks 4 rules. **[pg-migration-safe](https://shipsafe.gumroad.com/l/pg-migration-safe)**
checks **10** — including the subtle ones that lock or rewrite big tables in production:
non-concurrent `CREATE INDEX`, `ADD COLUMN NOT NULL` without default, `ALTER COLUMN TYPE`,
locking `ADD CONSTRAINT`, `VACUUM FULL`, `RENAME` — with risk-ranked, PR-ready Markdown
reports and CI severity tiers.

## Limitations
Heuristic static analysis, PostgreSQL only. Does not execute SQL or know table sizes.
A clean report means "no catastrophic patterns detected", not a guarantee.

## License
MIT — see [LICENSE](LICENSE).

---
Built by **ShipSafe** — *audit before you ship.*
