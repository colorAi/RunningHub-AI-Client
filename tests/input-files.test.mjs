import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(join(tmpdir(), 'rh-input-files-'));
const outfile = join(dir, 'input-files.mjs');
await build({ entryPoints: ['services/inputFiles.ts'], bundle: true, platform: 'node', format: 'esm', outfile });
const inputs = await import(pathToFileURL(outfile).href);
const originalWindow = globalThis.window;
after(async () => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  await rm(dir, { recursive: true, force: true });
});

test('desktop batch imports use native dialogs without browser picker APIs and preserve MIME types', async () => {
  const calls = [];
  globalThis.window = { isTauri: true, __TAURI_INTERNALS__: { invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === 'plugin:dialog|open') return args.options.directory ? '/virtual/input' : ['/virtual/B.JPG', '/virtual/A.png'];
    if (command === 'plugin:fs|read_file') return [1, 2, 3];
    throw new Error(`Unexpected command: ${command}`);
  } } };
  const directory = await inputs.selectInputDirectory();
  assert.equal(directory.name, 'input');
  assert.equal(calls[0].args.options.recursive, true, 'subdirectories must be included in the native read scope');
  const files = await inputs.selectInputFiles({ description: 'Images', accept: { 'image/*': ['.jpg', '.png'] }, multiple: true });
  assert.deepEqual(files.map(file => [file.name, file.type, file.size]), [['B.JPG', 'image/jpeg', 3], ['A.png', 'image/png', 3]]);
  assert.deepEqual(calls[1].args.options.filters, [{ name: 'Images', extensions: ['jpg', 'png'] }]);
});

test('cancelled native and browser pickers do not report import failures', async () => {
  const options = { description: 'Text', accept: { 'text/plain': ['.txt'] }, multiple: false };
  globalThis.window = { isTauri: true, __TAURI_INTERNALS__: { invoke: async () => null } };
  assert.equal(await inputs.selectInputDirectory(), null);
  assert.deepEqual(await inputs.selectInputFiles(options), []);
  globalThis.window = { location: { protocol: 'https:', href: 'https://example.test' },
    showDirectoryPicker: async () => { throw new DOMException('Cancelled', 'AbortError'); },
    showOpenFilePicker: async () => { throw new DOMException('Cancelled', 'AbortError'); },
  };
  assert.equal(await inputs.selectInputDirectory(), null);
  assert.deepEqual(await inputs.selectInputFiles(options), []);
});
