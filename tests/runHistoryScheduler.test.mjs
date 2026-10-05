import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir = await mkdtemp(join(tmpdir(), 'rh-history-scheduler-'));
const outfile = join(dir, 'scheduler.mjs');
await build({ stdin: { contents: "export * from './components/multitask/useMultiTaskScheduler'; export * from './components/multitask/workspaceModel'; export * from './services/runHistory/controller'; export { control } from './services/taskExecutor';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile,
  plugins: [{ name: 'isolated-scheduler', setup(build) {
    build.onLoad({ filter: /services\/taskExecutor\.ts$/ }, () => ({ loader: 'js', contents: `
      export class TaskCancelledError extends Error {}
      export const control = { attempts: [], execute: null };
      export async function executeWorkflowTask(options) {
        control.attempts.push(options.taskIndex);
        return control.execute(options);
      }` }));
    build.onLoad({ filter: /services\/apiCapacity\.ts$/ }, () => ({ loader: 'js', contents: `
      export function createApiCapacityManagers() {
        return [{ index: 0, apiKey: 'fixture-only', probe: async () => ({ availableSlots: 2 }), reserveSlot: () => true, releaseSlot() {}, markCapacityLimited() {} }];
      }` }));
    build.onLoad({ filter: /services\/api\.ts$/ }, () => ({ loader: 'js', contents: `export const isCapacityLimitedError = error => error.code === 429;` }));
  } }],
});
const { useMultiTaskScheduler, createCard, RunHistoryController, control } = await import(pathToFileURL(outfile));
after(() => rm(dir, { recursive: true, force: true }));
function setup() {
  const card = createCard({ webappId: 'test-app', isConnected: true, nodes: [{ nodeId: '1', fieldName: 'text', fieldValue: 'test', fieldType: 'STRING' }] });
  let cards = [card];
  const workspace = {
    cards, sessionRef: { current: null }, manualSnapshotsRef: { current: {} },
    editorRefs: { current: {} }, apiConfigs: [{ apiKey: 'fixture-only', concurrency: 2 }], totalConfiguredSlots: 2,
    setSessionNotice() {}, setSessionActive() {}, appendCardLog() {},
    setCards(update) { cards = typeof update === 'function' ? update(cards) : update; },
    updateCard(id, update) { cards = cards.map(card => card.id === id ? update(card) : card); },
  };
  const records = new Map();
  const controller = new RunHistoryController({ list: async () => [...records.values()], put: async run => { records.set(run.id, structuredClone(run)); }, remove: async () => {} });
  control.attempts = [];
  return { scheduler: useMultiTaskScheduler(workspace, { controller }, { enabled: false }), card, controller, records };
}
test('capacity retry stays in the same history run and out-of-order units finish once', async () => {
  const { scheduler, card, controller, records } = setup(); let rejectFirst = true;
  control.execute = async options => {
    if (options.taskIndex === 0 && rejectFirst) { rejectFirst = false; throw Object.assign(new Error('capacity'), { code: 429 }); }
    const taskId = `task-${options.taskIndex}`;
    options.callbacks.onSubmitted(taskId);
    return { taskId, outputs: [{ fileUrl: `https://example.test/${taskId}.txt` }] };
  };
  await scheduler.handleRunCard(card.id, card.nodes, [card.nodes, card.nodes]); await controller.flush();
  assert.deepEqual(control.attempts, [0, 1, 0]);
  assert.equal(records.size, 1);
  const [run] = records.values(); assert.deepEqual(run.units.map(u => u.taskId), ['task-0', 'task-1']);
  assert.deepEqual(run.units.map(u => u.status), ['success', 'success']); assert.ok(run.endedAt);
});
test('stop during execution persists submitted ID without accepting late completion', async () => {
  const { scheduler, card, controller, records } = setup(); let finish; let submitted;
  const waiting = new Promise(resolve => { submitted = resolve; });
  control.execute = async options => {
    options.callbacks.onSubmitted('submitted-before-stop'); submitted();
    return new Promise(resolve => { finish = () => resolve({ taskId: 'submitted-before-stop', outputs: [{ fileUrl: 'https://example.test/late.txt' }] }); });
  };
  const running = scheduler.handleRunCard(card.id, card.nodes);
  await waiting; scheduler.stopAllTracking(); finish(); await running; await controller.flush();
  const [run] = records.values(); assert.equal(run.units[0].taskId, 'submitted-before-stop');
  assert.equal(run.units[0].status, 'stopped'); assert.equal(run.units[0].outputs.length, 0);
});
