import { DirectoryHandle } from '../fileSystem';
import { ArchiveOutput, createMultiTaskArchiveFilename } from '../multiTaskArchive';
import { RunRecord } from './model';

export function historyOutputs(runs: RunRecord[]): ArchiveOutput[] {
  return runs.flatMap(run => {
    const archiveDirectory = createMultiTaskArchiveFilename(run.appName || run.appId,
      new Date(run.startedAt), run.id.replace(/-/g, '').slice(0, 12)).replace(/\.zip$/, '');
    return run.units.flatMap(unit => unit.outputs.map(output => ({ ...output, archiveDirectory })));
  });
}
export async function authorizeDirectory(directory: DirectoryHandle): Promise<void> {
  const permission = await directory.requestPermission({ mode: 'readwrite' });
  if (permission !== 'granted') throw new Error('文件夹写入权限已失效，请重新选择目录或允许写入。');
}
