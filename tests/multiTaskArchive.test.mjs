import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { build } from 'esbuild';

const dir = await mkdtemp(join(tmpdir(), 'rh-multi-task-archive-'));
const outfile = join(dir, 'multiTaskArchive.mjs');
await build({
  stdin: {
    contents: "export * from './services/multiTaskArchive';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
});
const { createMultiTaskArchive, createMultiTaskArchiveFilename } = await import(pathToFileURL(outfile).href);

after(async () => rm(dir, { recursive: true, force: true }));

test('creates one ZIP containing every successfully fetched task output', async () => {
  const urls = [];
  const result = await createMultiTaskArchive([
    { fileUrl: 'https://files.example.test/image.png?token=one', fileType: 'png' },
    { fileUrl: '', downloadUrl: 'https://files.example.test/clip.mp4?token=two', fileType: 'mp4' },
  ], async url => {
    urls.push(url);
    return new Response(url.includes('image') ? 'image-bytes' : 'video-bytes', { status: 200 });
  });

  const files = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  assert.deepEqual(urls, [
    'https://files.example.test/image.png?token=one',
    'https://files.example.test/clip.mp4?token=two',
  ]);
  assert.deepEqual(Object.keys(files).sort(), ['clip.mp4', 'image.png']);
  assert.equal(strFromU8(files['image.png']), 'image-bytes');
  assert.equal(strFromU8(files['clip.mp4']), 'video-bytes');
  assert.equal(result.includedCount, 2);
  assert.equal(result.failedCount, 0);
});

test('keeps duplicate output basenames unique inside the archive', async () => {
  const result = await createMultiTaskArchive([
    { fileUrl: 'https://first.example.test/shared.png' },
    { fileUrl: 'https://second.example.test/shared.png' },
  ], async () => new Response('bytes', { status: 200 }));

  const files = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  assert.deepEqual(Object.keys(files), ['shared.png', 'shared (2).png']);
});

test('avoids filenames that collide on case-insensitive filesystems', async () => {
  const result = await createMultiTaskArchive([
    { fileUrl: 'https://first.example.test/Result.png' },
    { fileUrl: 'https://second.example.test/result.png' },
  ], async () => new Response('bytes', { status: 200 }));

  assert.deepEqual(result.filenames, ['Result.png', 'result (2).png']);
});

test('uses the response MIME type when the output type is only a media category', async () => {
  const result = await createMultiTaskArchive([
    { fileUrl: 'https://files.example.test/generated', fileType: 'image' },
  ], async () => new Response('image-bytes', {
    status: 200,
    headers: { 'content-type': 'image/png' },
  }));

  assert.deepEqual(result.filenames, ['generated.png']);
});

test('creates a filesystem-safe ZIP filename from the card name and timestamp', () => {
  assert.equal(
    createMultiTaskArchiveFilename('我的 / 视频:卡片', new Date('2026-10-05T10:20:30.000Z'), 'card12345'),
    '我的 _ 视频_卡片_2026-10-05T10-20-30-000Z_card12345.zip',
  );
});

test('continues after one failed output and reports the partial archive accurately', async () => {
  const result = await createMultiTaskArchive([
    { fileUrl: 'https://files.example.test/good.png' },
    { fileUrl: 'https://files.example.test/broken.png' },
  ], async url => url.includes('broken')
    ? new Response('', { status: 503 })
    : new Response('good-bytes', { status: 200 }));

  const files = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  assert.deepEqual(Object.keys(files), ['good.png']);
  assert.equal(result.includedCount, 1);
  assert.equal(result.failedCount, 1);
});

test('rejects an archive request when no output could be fetched', async () => {
  await assert.rejects(
    createMultiTaskArchive([{ fileUrl: 'https://files.example.test/broken.png' }], async () => new Response('', { status: 404 })),
    /没有可下载的结果/,
  );
});

test('historical ZIP groups runs and reports retryable failures without path traversal', async () => {
  const bad = { fileUrl: 'https://files.example.test/failure.txt', archiveDirectory: '../bad' };
  const result = await createMultiTaskArchive([
    { fileUrl: 'https://files.example.test/same.txt', archiveDirectory: 'run-one' },
    { fileUrl: 'https://files.example.test/same.txt', archiveDirectory: 'run-two' }, bad,
    { fileUrl: 'https://files.example.test/safe.txt', archiveDirectory: '../bad' },
  ], async url => url.includes('failure') ? new Response('', { status: 403 }) : new Response('bytes'));
  const files = Object.keys(unzipSync(new Uint8Array(await result.blob.arrayBuffer())));
  assert.ok(files.includes('run-one/same.txt')); assert.ok(files.includes('run-two/same.txt'));
  assert.ok(files.every(name => !name.split('/').includes('..')));
  assert.deepEqual(result.failedOutputs, [bad]);
});
