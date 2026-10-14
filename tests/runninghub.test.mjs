import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Bundle only the API/capacity modules under test; no browser or live credentials.
const dir = await mkdtemp(join(tmpdir(), 'rh-regressions-'));
const outfile = join(dir, 'api.mjs');
await build({
  stdin: { contents: "export * from './services/api'; export * from './services/apiCapacity'; export * from './services/taskExecutor'; export * from './utils/nodeUtils';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile,
});
const api = await import(pathToFileURL(outfile).href);
const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
globalThis.localStorage = { getItem: key => key === 'rh_runninghub_region_mode' ? 'cn' : null };
after(async () => {
  globalThis.fetch = originalFetch;
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
  await rm(dir, { recursive: true, force: true });
});
beforeEach(() => { globalThis.fetch = async () => { throw new Error('Unexpected network request'); }; });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const queue = (limit, running = 0, queued = 0) => json({ code: 0, data: { concurrentLimit: limit, runningCount: String(running), queuedCount: String(queued), totalCurrentTasks: String(running + queued) } });

test('live queue limits supersede stale settings; local reservations and external tasks share capacity', async () => {
  let remote = { limit: 3, running: 1, queued: 0 };
  globalThis.fetch = async url => {
    assert.match(url, /\/openapi\/v2\/queue\/status$/);
    return queue(remote.limit, remote.running, remote.queued);
  };
  const manager = new api.ApiCapacityManager({ apiKey: ' a ', concurrency: 1 }, 0);
  assert.equal((await manager.probe()).availableSlots, 2);
  assert.equal(manager.reserveSlot(), true);
  assert.equal(manager.reserveSlot(), true);
  assert.equal(manager.reserveSlot(), false);
  remote.running = 3;
  assert.equal((await manager.probe(true)).externalInFlight, 1);
  remote.running = 2;
  manager.releaseSlot();
  assert.equal((await manager.probe()).availableSlots, 1);
  remote = { limit: 1, running: 0, queued: 1 };
  assert.equal((await manager.probe(true)).availableSlots, 0);
});

test('different accounts have independent capacity and repeated API keys cannot multiply it', async () => {
  globalThis.fetch = async (_url, init) => queue(1, init.headers.Authorization === 'Bearer a' ? 1 : 0);
  const managers = api.createApiCapacityManagers([
    { apiKey: ' a ', concurrency: 1 }, { apiKey: 'a', concurrency: 50 },
    { apiKey: 'b', concurrency: 1 }, { apiKey: ' ', concurrency: 10 },
  ]);
  assert.equal(managers.length, 2);
  assert.deepEqual(await Promise.all(managers.map(async manager => (await manager.probe()).availableSlots)), [0, 1]);
});

test('queue endpoint unavailable falls back to account counts; invalid keys stay visible', async () => {
  globalThis.fetch = async url => url.endsWith('/queue/status') ? json({}, 404) : json({ code: 0, data: { currentTaskCounts: '1' } });
  const manager = new api.ApiCapacityManager({ apiKey: 'a', concurrency: 2 }, 0);
  assert.equal((await manager.probe()).availableSlots, 1);
  globalThis.fetch = async () => json({}, 401);
  await assert.rejects(manager.probe(true), error => error.code === '401');
});

test('capacity rejection applies a cooldown even when the queue has not caught up', async () => {
  globalThis.fetch = async () => queue(1);
  const manager = new api.ApiCapacityManager({ apiKey: 'a', concurrency: 1 }, 0);
  await manager.probe();
  manager.reserveSlot();
  manager.markCapacityLimited();
  manager.releaseSlot();
  assert.equal((await manager.probe(true)).availableSlots, 0);
  assert.equal(manager.reserveSlot(), false);
});

test('upload accepts both official documented success codes and filename fields', async () => {
  for (const [code, field] of [[0, 'fileName'], [200, 'filename']]) {
    globalThis.fetch = async (_url, init) => {
      assert.equal(init.headers.Authorization, 'Bearer a');
      assert.ok(init.body instanceof FormData);
      return json({ code, data: { [field]: 'openapi/input.png', download_url: 'https://example.test/input.png', type: 'image' } });
    };
    const result = await api.uploadMediaV2('a', new Blob(['test'], { type: 'image/png' }));
    assert.equal(result.fileName, 'openapi/input.png');
    assert.equal(result.downloadUrl, 'https://example.test/input.png');
  }
});

test('upload errors and missing filenames cannot be treated as successful uploads', async () => {
  globalThis.fetch = async () => json({ code: 1008, message: 'too large' });
  await assert.rejects(api.uploadMediaV2('a', new Blob()), error => error.code === '1008');
  globalThis.fetch = async () => json({ code: 200, data: {} });
  await assert.rejects(api.uploadMediaV2('a', new Blob()), /缺少文件名/);
});

test('app submission sends optional access/retention parameters and omits unset options', async () => {
  let payload;
  globalThis.fetch = async (_url, init) => {
    payload = JSON.parse(init.body);
    return json({ code: 0, data: { taskId: '123', taskStatus: 'RUNNING' } });
  };
  await api.submitTask('a', '456', [], 'default', { accessPassword: 'test password', retainSeconds: 30 });
  assert.equal(payload.accessPassword, 'test password');
  assert.equal(payload.retainSeconds, 30);
  assert.equal(payload.webappId, '456');
  await api.submitTask('a', '456', []);
  assert.equal('accessPassword' in payload, false);
  assert.equal('retainSeconds' in payload, false);
  for (const retainSeconds of [0, 9, 181, 10.5, NaN]) {
    await assert.rejects(api.submitTask('a', '456', [], undefined, { retainSeconds }), /10–180/);
  }
});

test('HTTP 429 and API capacity errors are recoverable; authentication errors are not', async () => {
  globalThis.fetch = async () => json({}, 429);
  await assert.rejects(api.submitTask('a', '456', []), api.isCapacityLimitedError);
  assert.equal(api.isCapacityLimitedError({ code: 421 }), true);
  assert.equal(api.isCapacityLimitedError({ code: 401 }), false);
});

test('a rate-limit failure after task acceptance cannot trigger another paid submission', async () => {
  let submissions = 0;
  globalThis.fetch = async url => {
    if (url.endsWith('/ai-app/run')) {
      submissions++;
      return json({ code: 0, data: { taskId: 'accepted-task', taskStatus: 'RUNNING' } });
    }
    if (url.endsWith('/v2/query')) return json({ taskId: 'accepted-task', status: 'FAILED', errorMessage: 'upstream rate limit' });
    if (url.endsWith('/outputs')) return json({ code: 805, msg: 'rate limit' });
    throw new Error(`Unexpected request: ${url}`);
  };
  await assert.rejects(api.executeWorkflowTask({ apiKey: 'a', webappId: '111', taskNodes: [], autoSaveEnabled: false }), error => {
    assert.equal(error.taskId, 'accepted-task');
    assert.equal(api.isCapacityLimitedError(error), false);
    assert.match(error.message, /rate limit/);
    return true;
  });
  assert.equal(submissions, 1);
});

test('queue totals include queued tasks when the total field is absent', async () => {
  globalThis.fetch = async () => json({ code: 0, data: { concurrentLimit: 3, runningCount: '1', queuedCount: '2' } });
  assert.equal((await api.getApiQueueStatus('a')).totalCurrentTasks, '3');
});

const h3Fixtures = JSON.parse(await readFile(new URL('./fixtures/h3-inputs.json', import.meta.url), 'utf8'));
test('real H3 COMBO parameters expose options instead of type markers or object text', () => {
  for (const { node } of h3Fixtures.filter(f => f.node.fieldType === 'LIST')) {
    const expected = JSON.parse(node.fieldData)[1].options;
    assert.deepEqual(api.parseListOptions(node).map(item => item.index), expected);
    assert.ok(!api.parseListOptions(node).some(item => item.name.includes('[object Object]')));
  }
});

test('real H3 BOOLEAN descriptors toggle true/false while COMBO audio remains an upload field', () => {
  const boolean = h3Fixtures.find(f => f.node.fieldType === 'BOOLEAN').node;
  assert.deepEqual(api.parseListOptions(boolean), []);
  const config = api.getSwitchFieldConfig(boolean);
  assert.equal(config.checked, true);
  assert.equal(config.checkedValue, 'true');
  assert.equal(config.uncheckedValue, 'false');
  const audio = h3Fixtures.find(f => f.node.fieldType === 'AUDIO').node;
  assert.deepEqual(api.parseListOptions(audio), []);
});

test('legacy lists, object labels, numeric switch values and scalar descriptors stay compatible', () => {
  const node = { fieldType: 'LIST', fieldValue: '', fieldName: 'choice' };
  assert.deepEqual(api.parseListOptions({ ...node, fieldData: '[ ["5","10"], {"default":"5"} ]' }).map(item => item.index), ['5', '10']);
  assert.deepEqual(api.parseListOptions({ ...node, fieldData: ['a', 'b'] }).map(item => item.index), ['a', 'b']);
  assert.deepEqual(api.parseListOptions({ ...node, fieldData: [['a', { label: 'B', value: 'b' }], {}] }).map(item => item.index), ['a', 'b']);
  assert.deepEqual(api.parseListOptions({ ...node, fieldType: 'SWITCH', fieldData: [{ name: 'off', index: 0 }, { name: 'on', index: 1 }, { default: 0 }] }).map(item => item.index), ['0', '1']);
  assert.deepEqual(api.parseListOptions({ ...node, fieldType: 'FLOAT', fieldValue: '5', fieldData: '["FLOAT",{"min":4,"max":15}]' }), []);
  assert.deepEqual(api.parseListOptions({ ...node, fieldType: 'STRING', fieldData: { options: [{ name: 'Display label', value: 'actual_value' }] } }), [{ name: 'Display label', index: 'actual_value' }]);
});

test('API node loading normalizes COMBO type without losing field data', async () => {
  const node = { ...h3Fixtures.find(f => f.node.fieldType === 'LIST').node, fieldType: 'COMBO' };
  globalThis.fetch = async () => json({ code: 0, data: { nodeInfoList: [node] } });
  const result = await api.getNodeList('a', '123');
  assert.equal(result.nodes[0].fieldType, 'LIST');
  assert.deepEqual(api.parseListOptions(result.nodes[0]).map(item => item.index), ['match', 'max']);
});
