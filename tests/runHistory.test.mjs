import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir = await mkdtemp(join(tmpdir(), 'rh-history-'));
const outfile = join(dir, 'history.mjs');
await build({ stdin: { contents: "export * from './services/runHistory/model'; export * from './services/runHistory/controller'; export * from './services/runHistory/download';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile });
const { RunHistoryController, decodeRun, runStatus, historyOutputs } = await import(pathToFileURL(outfile));
after(() => rm(dir, { recursive: true, force: true }));
const input = { cardId: 'card-1', appId: 'app-1', appName: '语音识别', batchName: '批次一' };
const output = { fileUrl: 'https://example.test/result.txt', fileType: 'txt' };
function storage() {
  const data = new Map();
  return { data, list: async () => [...data.values()].map(value => structuredClone(value)), put: async run => { data.set(run.id, structuredClone(run)); }, remove: async ids => ids.forEach(id => data.delete(id)) };
}
test('out-of-order completion is idempotent and persists all unit outputs', async () => {
  const db = storage(); const c = new RunHistoryController(db); const id = c.start(input, 3);
  c.event(id, 2, { type: 'success', taskId: 'task-3', outputs: [output] });
  c.event(id, 0, { type: 'submitted', taskId: 'task-1' });
  c.event(id, 2, { type: 'success', taskId: 'task-3', outputs: [output] });
  c.event(id, 0, { type: 'success', taskId: 'task-1', outputs: [output] });
  c.event(id, 1, { type: 'failed', error: 'NOT_ENOUGH_BALANCE' });
  await c.flush();
  const run = db.data.get(id);
  assert.deepEqual(run.units.map(u => u.status), ['success', 'failed', 'success']);
  assert.equal(historyOutputs([run]).length, 2);
  assert.equal(runStatus(run, c.getSnapshot().active), 'failed');
  assert.ok(run.endedAt);
});
test('submitted IDs survive stop; late completions cannot overwrite terminal records', async () => {
  const c = new RunHistoryController(storage()); const id = c.start(input, 2);
  c.event(id, 0, { type: 'success', taskId: '1', outputs: [output] });
  c.event(id, 1, { type: 'submitted', taskId: '2' });
  c.stopCard(input.cardId);
  c.event(id, 1, { type: 'success', taskId: '2', outputs: [output] });
  const run = c.getSnapshot().records[0];
  assert.equal(runStatus(run, c.getSnapshot().active), 'stopped');
  assert.equal(run.units[1].taskId, '2'); assert.equal(historyOutputs([run]).length, 1);
  await c.flush();
});
test('new runs remain separate; reload retains history independent of cards', async () => {
  const db = storage(); const c = new RunHistoryController(db);
  const first = c.start(input, 1); c.event(first, 0, { type: 'success', taskId: '1', outputs: [output] });
  const second = c.start(input, 1); c.stopCard(input.cardId); await c.flush();
  const loaded = new RunHistoryController(db); await loaded.load();
  assert.equal(loaded.getSnapshot().records.length, 2); assert.notEqual(first, second);
  await loaded.remove([first]); assert.equal(db.data.has(first), false); assert.equal(db.data.has(second), true);
});
test('failed persistence preserves latest memory snapshot and retry recovers', async () => {
  const db = storage(); let failed = true; const put = db.put;
  db.put = async run => { if (failed) throw Error('quota'); await put(run); };
  const c = new RunHistoryController(db); const id = c.start(input, 1);
  c.event(id, 0, { type: 'success', taskId: '1', outputs: [output] }); await c.flush();
  assert.equal(c.getSnapshot().unsaved, true); assert.equal(c.getSnapshot().records[0].units[0].outputs.length, 1);
  failed = false; await c.retry(); assert.equal(c.getSnapshot().unsaved, false); assert.ok(db.data.get(id).endedAt);
});
test('loading overlapping a new mutation cannot replace the latest run', async () => {
  const db = storage(); const c = new RunHistoryController(db); const id = c.start(input, 1); await c.flush();
  const stale = structuredClone(db.data.get(id)); let release;
  db.list = () => new Promise(resolve => { release = resolve; });
  const loading = c.load(); c.event(id, 0, { type: 'success', taskId: '1', outputs: [output] });
  release([stale]); await loading; await c.flush();
  assert.equal(c.getSnapshot().records[0].units[0].status, 'success');
});
test('active runs cannot be deleted and failures persist only safe diagnostics', async () => {
  const c = new RunHistoryController(storage()); const id = c.start(input, 1);
  await c.remove([id]); assert.equal(c.getSnapshot().records.length, 1);
  c.event(id, 0, { type: 'failed', error: 'secret-api-key https://host.test/?token=private' });
  assert.doesNotMatch(JSON.stringify(c.getSnapshot().records), /secret-api-key|private/);
  await c.flush();
});
test('persistence decoder rejects corrupt records and drops unknown fields/unsafe URLs', async () => {
  const c = new RunHistoryController(storage()); c.start(input, 1);
  const run = structuredClone(c.getSnapshot().records[0]);
  assert.equal(decodeRun({ ...run, version: 2 }), null);
  assert.equal(decodeRun({ ...run, units: [null] }), null);
  run.apiKey = 'private'; run.units[0].outputs = [{ fileUrl: 'javascript:alert(1)' }, output];
  const decoded = decodeRun(run);
  assert.equal('apiKey' in decoded, false); assert.deepEqual(decoded.units[0].outputs.map(o => o.fileUrl), [output.fileUrl]);
  await c.flush();
});
test('merged history separates runs with the same app name into distinct folders', async () => {
  const c = new RunHistoryController(storage());
  for (let i = 0; i < 2; i++) { const id = c.start(input, 1); c.event(id, 0, { type: 'success', taskId: String(i), outputs: [output] }); }
  const entries = historyOutputs(c.getSnapshot().records);
  assert.equal(new Set(entries.map(entry => entry.archiveDirectory)).size, 2); await c.flush();
});
