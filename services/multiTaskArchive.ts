import { Zip, ZipPassThrough } from 'fflate';
import { TaskOutput } from '../types';

const TYPE_ONLY_CATEGORIES = new Set(['image', 'video', 'audio', 'file', 'application', 'text']);

export interface ArchiveOutput extends TaskOutput { archiveDirectory?: string }

export interface MultiTaskArchiveResult {
  failedOutputs: ArchiveOutput[];
  blob: Blob;
  includedCount: number;
  failedCount: number;
  filenames: string[];
}

export type ArchiveProgressCallback = (completedCount: number, totalCount: number, failedCount: number) => void;

const getOutputUrl = (output: TaskOutput): string => output.fileUrl || output.downloadUrl || '';

const sanitizeFilename = (value: string, fallback: string): string => {
  const safe = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  return safe || fallback;
};

export function createMultiTaskArchiveFilename(
  label: string,
  timestamp = new Date(),
  uniqueSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8),
): string {
  const safeLabel = sanitizeFilename(label, 'batch-results').slice(0, 80);
  const safeTimestamp = timestamp.toISOString().replace(/[:.]/g, '-');
  const safeSuffix = uniqueSuffix.replace(/[^a-z0-9_-]/gi, '').slice(0, 12) || 'archive';
  return `${safeLabel}_${safeTimestamp}_${safeSuffix}.zip`;
}

const getFilename = (url: string, output: TaskOutput, contentType: string, index: number): string => {
  let leaf = '';
  try {
    leaf = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
  } catch {
    leaf = '';
  }

  if (leaf && /\.[a-z0-9]{1,12}$/i.test(leaf)) {
    return sanitizeFilename(leaf, `result_${String(index + 1).padStart(3, '0')}.bin`);
  }

  const outputType = output.fileType?.trim().toLowerCase().split('/').pop() || '';
  const mimeType = contentType.split(';')[0].trim().toLowerCase().split('/').pop() || '';
  const type = !outputType || TYPE_ONLY_CATEGORIES.has(outputType) ? mimeType || outputType : outputType;
  const normalizedType = type === 'jpeg' ? 'jpg' : type;
  const extension = sanitizeFilename(normalizedType || 'bin', 'bin').replace(/[^a-z0-9_-]/gi, '') || 'bin';
  const base = sanitizeFilename(leaf || `result_${String(index + 1).padStart(3, '0')}`, 'result');
  return `${base}.${extension}`;
};

const withUniqueFilename = (filename: string, existing: Set<string>): string => {
  const normalize = (value: string) => value.toLocaleLowerCase('en-US');
  if (!existing.has(normalize(filename))) return filename;

  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : '';
  let suffix = 2;
  let candidate = `${base} (${suffix})${extension}`;
  while (existing.has(normalize(candidate))) {
    suffix += 1;
    candidate = `${base} (${suffix})${extension}`;
  }
  return candidate;
};

/** Fetches a card's outputs and packages every reachable file into one ZIP archive. */
export async function createMultiTaskArchive(
  outputs: ArchiveOutput[],
  fetchOutput: typeof fetch = fetch,
  onProgress?: ArchiveProgressCallback,
): Promise<MultiTaskArchiveResult> {
  if (outputs.length === 0) {
    throw new Error('没有可下载的结果');
  }

  const chunks: Uint8Array[] = [];
  const filenames = new Set<string>();
  const filenameKeys = new Set<string>();
  let failedCount = 0;
  const failedOutputs: ArchiveOutput[] = [];
  let resolveArchive!: () => void;
  let rejectArchive!: (error: Error) => void;
  const archiveWritten = new Promise<void>((resolve, reject) => {
    resolveArchive = resolve;
    rejectArchive = reject;
  });
  const archive = new Zip((error, chunk, final) => {
    if (error) {
      rejectArchive(error);
      return;
    }
    chunks.push(chunk);
    if (final) resolveArchive();
  });

  for (const [index, output] of outputs.entries()) {
    const url = getOutputUrl(output);
    if (url) {
      try {
        const response = await fetchOutput(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const contentType = response.headers.get('content-type') || '';
        const content = new Uint8Array(await response.arrayBuffer());
        let filename = getFilename(url, output, contentType, index);
        if (output.archiveDirectory) filename = `${sanitizeFilename(output.archiveDirectory, 'run').replace(/^\.+$/, 'run')}/${filename}`;
        filename = withUniqueFilename(filename, filenameKeys);
        filenames.add(filename);
        filenameKeys.add(filename.toLocaleLowerCase('en-US'));
        const entry = new ZipPassThrough(filename);
        archive.add(entry);
        entry.push(content, true);
      } catch {
        failedCount += 1;
        failedOutputs.push(output);
      }
    } else {
      failedCount += 1;
      failedOutputs.push(output);
    }

    onProgress?.(index + 1, outputs.length, failedCount);
  }

  if (filenames.size === 0) {
    throw new Error('没有可下载的结果');
  }

  archive.end();
  await archiveWritten;
  const blobParts = chunks.map(chunk => chunk.buffer.slice(
    chunk.byteOffset,
    chunk.byteOffset + chunk.byteLength,
  ) as ArrayBuffer);

  return {
    blob: new Blob(blobParts, { type: 'application/zip' }),
    failedOutputs,
    includedCount: filenames.size,
    failedCount,
    filenames: [...filenames],
  };
}
