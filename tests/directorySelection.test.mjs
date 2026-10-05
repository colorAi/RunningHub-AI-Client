import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(join(tmpdir(), 'rh-directory-'));
await build({
  entryPoints: ['services/fileSystem.ts'], bundle: true, platform: 'node', format: 'esm',
  outfile: join(dir, 'fileSystem.mjs'),
  plugins: [{ name: 'native-dialog-stub', setup(build) {
    build.onResolve({ filter: /^@tauri-apps\/plugin-dialog$/ }, () => ({ path: 'dialog', namespace: 'fixture' }));
    build.onResolve({ filter: /^@tauri-apps\/api\/path$/ }, () => ({ path: 'path', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({path}) => ({ contents: path === 'dialog'
      ? 'export const open = async () => "/native/results";'
      : 'export const BaseDirectory = {}; export const homeDir = async () => "/native"; export const join = async (...parts) => parts.join("/");' }));
  }}],
});
const {selectRootDirectory, supportsFileSystemAccessAPI} = await import(pathToFileURL(join(dir, 'fileSystem.mjs')));
const oldWindow = globalThis.window;
after(async () => { if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow; await rm(dir, {recursive:true,force:true}); });
function browser(picker, secure = true) {
  globalThis.window = { isSecureContext: secure, showDirectoryPicker: picker,
    location: { protocol: 'http:', href: 'http://127.0.0.1:5173/' },
    navigator: { platform: 'MacIntel', userAgent: 'Macintosh AppleWebKit Chrome/130.0' },
  };
}

test('macOS Chromium opens a readwrite picker synchronously and returns its directory', async () => {
  const calls = [];
  const handle = {name:'results',requestPermission:async options => {calls.push(options); return 'granted';}};
  browser(options => {calls.push(options); return Promise.resolve(handle);});
  const selected = selectRootDirectory();
  assert.deepEqual(calls, [{mode:'readwrite'}]);
  assert.equal(await selected, handle);
  assert.deepEqual(calls, [{mode:'readwrite'},{mode:'readwrite'}]);
});
test('cancelling is a no-op', async () => {
  browser(async () => {throw new DOMException('cancel', 'AbortError');});
  assert.equal(await selectRootDirectory(), null);
});
test('denied write permission is reported', async () => {
  browser(async () => ({requestPermission:async () => 'denied'}));
  await assert.rejects(selectRootDirectory(), /写入权限/);
});
test('unsupported browsers and insecure contexts do not invoke the picker', async () => {
  browser(undefined);
  assert.equal(supportsFileSystemAccessAPI(), false);
  await assert.rejects(selectRootDirectory(), /不支持选择文件夹/);
  browser(() => {throw Error('must not invoke');}, false);
  assert.equal(supportsFileSystemAccessAPI(), false);
  await assert.rejects(selectRootDirectory(), /HTTPS/);
});
test('security failures get actionable feedback', async () => {
  browser(async () => {throw new DOMException('blocked', 'SecurityError');});
  await assert.rejects(selectRootDirectory(), /浏览器未允许访问/);
});
test('Tauri keeps using its native directory dialog', async () => {
  browser(() => {throw Error('must not invoke browser picker');});
  window.__TAURI_INTERNALS__ = {};
  const result = await selectRootDirectory();
  assert.equal(result.name, 'results');
  assert.equal(result.path, '/native/results');
});
