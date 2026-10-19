#!/usr/bin/env node
/**
 * pg-migration-safe-lite — FREE static safety analyzer for PostgreSQL migration SQL.
 *
 * Catches the 4 catastrophic, "always-wrong-in-prod" patterns:
 *   DROP TABLE · DROP COLUMN · DELETE without WHERE · UPDATE without WHERE
 * Pure JavaScript, ZERO dependencies, deterministic and offline. It only reads
 * .sql files — it never connects to or executes against your database.
 *
 * Want the full 10-rule zero-downtime analyzer (index/constraint/table-rewrite
 * locks, Markdown PR reports, CI --fail-on tiers)? → https://shipsafe.gumroad.com/l/pg-migration-safe
 *
 * Usage:   node scripts/audit.mjs <file.sql|dir> [more ...] [--format json|md|text] [--fail-on critical]
 * Exit:    0 ok · 1 findings at/above threshold · 2 usage/runtime error
 */
import fs from 'node:fs';
import path from 'node:path';

const TOOL = 'pg-migration-safe-lite';
const UPSELL = 'Tip: the full ShipSafe analyzer also flags locking index/constraint builds, table rewrites and more (10 rules, PR-ready Markdown, CI tiers): https://shipsafe.gumroad.com/l/pg-migration-safe';
const RISK_RANK = { critical: 3 };

const RULES = [
  {
    id: 'drop-table', risk: 'critical',
    test: (s) => /\bDROP\s+TABLE\b/i.test(s),
    help: 'DROP TABLE destroys data and is irreversible in production.',
    fix: 'Avoid in automated migrations; rename + delayed drop, or a separate approved decommission step with a verified backup.',
  },
  {
    id: 'drop-column', risk: 'critical',
    test: (s) => /\bALTER\s+TABLE\b[\s\S]*\bDROP\s+COLUMN\b/i.test(s),
    help: 'DROP COLUMN permanently removes stored data.',
    fix: 'Ship code that stops reading the column first, then drop it in a later, backup-reversible migration.',
  },
  {
    id: 'delete-without-where', risk: 'critical',
    test: (s) => /\bDELETE\s+FROM\b/i.test(s) && !/\bWHERE\b/i.test(s),
    help: 'DELETE with no WHERE clause wipes the entire table.',
    fix: 'Add a WHERE clause, or run an intentional TRUNCATE within an explicit, reviewed step.',
  },
  {
    id: 'update-without-where', risk: 'critical',
    test: (s) => /\bUPDATE\b[\s\S]*\bSET\b/i.test(s) && !/\bWHERE\b/i.test(s),
    help: 'UPDATE with no WHERE rewrites every row and holds locks across the table.',
    fix: 'Add a WHERE clause; for bulk backfills update in batches.',
  },
];

function parseArgs(argv) {
  const opts = { targets: [], format: 'text', failOn: 'none', maxSnippets: 5, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--format': opts.format = argv[++i]; break;
      case '--fail-on': opts.failOn = argv[++i]; break;
      case '--max-snippets': opts.maxSnippets = parseInt(argv[++i], 10) || 5; break;
      case '--help': case '-h': opts.help = true; break;
      default: if (!a.startsWith('--')) opts.targets.push(a);
    }
  }
  return opts;
}

function usage() {
  return [
    `${TOOL} - free PostgreSQL migration safety analyzer (zero-deps, offline)`,
    '',
    'Usage: node scripts/audit.mjs <file.sql|dir> [more ...] [options]',
    '',
    'Options:',
    '  --format <json|md|text>  Output format (default: text)',
    '  --fail-on <risk>         Exit 1 at/above risk: critical|none (default: none)',
    '  --max-snippets <n>       Max example statements per rule (default: 5)',
    '  --help                   Show this usage',
    '',
    'Exit codes: 0 ok, 1 findings at/above threshold, 2 usage/runtime error.',
  ].join('\n');
}

function collectSqlFiles(targets) {
  const files = [];
  for (const t of targets) {
    const abs = path.resolve(t);
    if (!fs.existsSync(abs)) throw new Error(`Path not found: ${abs}`);
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(abs)) if (name.toLowerCase().endsWith('.sql')) files.push(path.join(abs, name));
    } else if (abs.toLowerCase().endsWith('.sql')) {
      files.push(abs);
    } else {
      throw new Error(`Not a .sql file or directory: ${abs}`);
    }
  }
  return files;
}

function splitStatements(sql) {
  const noComments = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return noComments.split(';').map((s) => s.trim()).filter(Boolean);
}

function lineOf(sql, statement) {
  const idx = sql.indexOf(statement);
  return idx < 0 ? 0 : sql.slice(0, idx).split('\n').length;
}

function analyzeFile(file) {
  const sql = fs.readFileSync(file, 'utf8');
  const statements = splitStatements(sql);
  const findings = [];
  for (const rule of RULES) {
    const matches = [];
    for (const stmt of statements) {
      if (rule.test(stmt)) matches.push({ statement: stmt.replace(/\s+/g, ' ').slice(0, 200), line: lineOf(sql, stmt) });
    }
    if (matches.length) findings.push({ id: rule.id, risk: rule.risk, help: rule.help, fix: rule.fix, count: matches.length, matches });
  }
  findings.sort((a, b) => (RISK_RANK[b.risk] || 0) - (RISK_RANK[a.risk] || 0) || a.id.localeCompare(b.id));
  return { file, findings, statementCount: statements.length };
}

function highestRisk(findings) { let m = 0; for (const f of findings) m = Math.max(m, RISK_RANK[f.risk] || 0); return m; }

function renderText(perFile, maxSnippets) {
  const lines = [];
  for (const f of perFile) {
    lines.push(`\n== ${f.file} (${f.statementCount} statement(s)) ==`);
    if (!f.findings.length) { lines.push('  No catastrophic patterns detected.'); continue; }
    for (const s of f.findings) {
      lines.push(`  [${s.risk.toUpperCase()}] ${s.id} — ${s.help} (${s.count})`);
      lines.push(`    remediation: ${s.fix}`);
      for (const m of s.matches.slice(0, maxSnippets)) lines.push(`      - line ${m.line}: ${m.statement}`);
    }
  }
  return lines.join('\n');
}

function renderMarkdown(perFile, maxSnippets) {
  const out = ['# PostgreSQL Migration Safety Report (lite)', ''];
  for (const f of perFile) {
    out.push(`## ${f.file}`, `_${f.statementCount} statement(s)_`, '');
    if (!f.findings.length) { out.push('_No catastrophic patterns detected._', ''); continue; }
    out.push('| Risk | Rule | Occurrences | Why | Remediation |', '|---|---|---|---|---|');
    for (const s of f.findings) out.push(`| ${s.risk} | \`${s.id}\` | ${s.count} | ${s.help} | ${s.fix} |`);
    out.push('');
  }
  return out.join('\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(usage()); process.exit(0); }
  if (!opts.targets.length) { console.error(usage()); process.exit(2); }
  try {
    const files = collectSqlFiles(opts.targets);
    if (!files.length) { console.error('No .sql files found in the given targets.'); process.exit(2); }
    const perFile = files.map(analyzeFile);
    let overallMax = 0;
    for (const f of perFile) overallMax = Math.max(overallMax, highestRisk(f.findings));
    if (opts.format === 'json') {
      console.log(JSON.stringify({ tool: TOOL, dialect: 'postgresql', engineVersion: '1.0.0', ruleCount: RULES.length, files: perFile }, null, 2));
    } else if (opts.format === 'md') {
      console.log(renderMarkdown(perFile, opts.maxSnippets));
      console.log(`\n_${UPSELL}_`);
    } else {
      console.log(renderText(perFile, opts.maxSnippets));
      const total = perFile.reduce((s, f) => s + f.findings.length, 0);
      console.log(`\n-- ${total} finding(s) across ${perFile.length} file(s). Free lite: 4 critical rules, heuristic static analysis, PostgreSQL. --`);
      console.log(UPSELL);
    }
    const threshold = RISK_RANK[opts.failOn] || 0;
    process.exit(threshold > 0 && overallMax >= threshold ? 1 : 0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(2);
  }
}

main();
