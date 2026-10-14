import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(join(tmpdir(), 'rh-autosave-'));
const outfile = join(dir, 'autosave.mjs');
await build({ entryPoints: ['services/autoSaveService.ts'], bundle: true, platform: 'node', format: 'esm', outfile });
const autosave = await import(pathToFileURL(outfile).href);
const originalWindow = globalThis.window;
after(async () => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  await rm(dir, { recursive: true, force: true });
});

test('parallel task cards reserve different sequential filenames before checking the filesystem', async () => {
  const written = [];
  globalThis.window = { isTauri: true, __TAURI_INTERNALS__: { invoke: async (command, args) => {
    if (command === 'get_saved_directory') return '/virtual-output';
    if (command === 'check_directory_writable') return true;
    if (command === 'check_file_exists') return args.filename.endsWith('_00001.png');
    if (command === 'save_file_from_url') { written.push(args.filename); return `/virtual-output/${args.filename}`; }
    throw new Error(`Unexpected filesystem command: ${command}`);
  } } };
  await autosave.initAutoSave();
  await Promise.all(Array.from({ length: 4 }, () => autosave.saveFileFromUrl('https://example.test/result.png', 'same_batch_T001', 'png', true)));
  assert.equal(written.length, 4);
  assert.equal(new Set(written).size, 4, 'parallel outputs overwrite one another');
  assert.ok(!written.includes('same_batch_T001_00001.png'), 'existing file was overwritten');
});
