import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, '..', 'scripts', 'audit.mjs');
const dangerous = path.join(__dirname, '..', 'examples', 'dangerous.sql');
const safe = path.join(__dirname, '..', 'examples', 'safe.sql');

function run(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [script, ...args], (err, stdout, stderr) => {
      resolve({ code: err ? err.code ?? 1 : 0, stdout, stderr });
    });
  });
}

test('dangerous.sql flags all 4 critical rules (json)', async () => {
  const { code, stdout } = await run([dangerous, '--format', 'json']);
  assert.equal(code, 0);
  const data = JSON.parse(stdout);
  assert.equal(data.tool, 'pg-migration-safe-lite');
  const ids = data.files[0].findings.map((f) => f.id).sort();
  assert.deepEqual(ids, ['delete-without-where', 'drop-column', 'drop-table', 'update-without-where']);
  for (const f of data.files[0].findings) assert.equal(f.risk, 'critical');
});

test('safe.sql yields 0 findings (no false positives)', async () => {
  const { code, stdout } = await run([safe, '--format', 'json']);
  assert.equal(code, 0);
  const data = JSON.parse(stdout);
  assert.equal(data.files[0].findings.length, 0);
});

test('--help exits 0 and prints usage', async () => {
  const { code, stdout } = await run(['--help']);
  assert.equal(code, 0);
  assert.match(stdout, /Usage:/);
});

test('--fail-on critical exits 1 when a finding exists', async () => {
  const { code } = await run([dangerous, '--fail-on', 'critical']);
  assert.equal(code, 1);
});

test('--fail-on critical exits 0 on the safe file', async () => {
  const { code } = await run([safe, '--fail-on', 'critical']);
  assert.equal(code, 0);
});

test('missing path exits 2', async () => {
  const { code } = await run(['does_not_exist.sql']);
  assert.equal(code, 2);
});
