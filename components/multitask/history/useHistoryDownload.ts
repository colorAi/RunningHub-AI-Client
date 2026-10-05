import { useEffect, useRef, useState } from 'react';
import { saveBinaryFile, selectRootDirectory } from '../../../services/fileSystem';
import { ArchiveOutput, createMultiTaskArchive, createMultiTaskArchiveFilename } from '../../../services/multiTaskArchive';
import { authorizeDirectory, historyOutputs } from '../../../services/runHistory/download';
import { RunRecord } from '../../../services/runHistory/model';
import type { useRunHistory } from './useRunHistory';

export function useHistoryDownload(history: ReturnType<typeof useRunHistory>) {
  const active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState<ArchiveOutput[]>([]);
  const retryRuns = useRef<RunRecord[]>([]);
  useEffect(() => () => active.current?.abort(), []);

  async function download(runs: RunRecord[], only?: ArchiveOutput[], single = false) {
    if (active.current || !runs.length) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setFailed([]);
    const outputs = only || historyOutputs(runs);
    retryRuns.current = runs;
    try {
      const cardIds = new Set(runs.map(run => run.cardId));
      const cardId = runs[0].cardId;
      // Cross-card archives always ask explicitly; per-card directories remain untouched.
      const directory = cardIds.size === 1 && history.directories[cardId]
        ? history.directories[cardId] : await selectRootDirectory();
      if (!directory) { setMessage('已取消选择目录'); return; }
      if (cardIds.size === 1) history.setDirectory(cardId, directory);
      await authorizeDirectory(directory);
      if (controller.signal.aborted) return;
      const fetchFile: typeof fetch = (input, init) => fetch(input, { ...init, signal: controller.signal });
      let blob: Blob;
      let filename: string;
      let failedOutputs: ArchiveOutput[] = [];
      if (single) {
        setMessage('正在下载文件…');
        const response = await fetchFile(outputs[0].fileUrl || outputs[0].downloadUrl);
        if (!response.ok) throw new Error('下载失败');
        blob = await response.blob();
        const url = new URL(outputs[0].fileUrl || outputs[0].downloadUrl);
        let leaf = '';
        try { leaf = decodeURIComponent(url.pathname.split('/').pop() || ''); } catch { /* use fallback */ }
        const safe = leaf.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 160) || 'result.bin';
        filename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safe}`;
      } else {
        setMessage(`准备下载 ${outputs.length} 个文件…`);
        const archive = await createMultiTaskArchive(outputs, fetchFile, (done, total, failures) => {
          setMessage(`正在下载并打包 ${done}/${total}${failures ? `，失败 ${failures}` : ''}`);
        });
        blob = archive.blob;
        filename = createMultiTaskArchiveFilename(runs.length === 1 ? runs[0].appName : `运行记录_${runs.length}次`);
        failedOutputs = archive.failedOutputs;
      }
      if (controller.signal.aborted) { setMessage('下载已取消'); return; }
      if (!await saveBinaryFile(directory, filename, blob)) throw new Error('保存失败');
      setFailed(failedOutputs);
      setMessage(`已保存 ${outputs.length - failedOutputs.length} 个文件到 ${directory.name}${failedOutputs.length ? `，${failedOutputs.length} 个下载失败，可重试` : ''}`);
    } catch {
      setFailed(controller.signal.aborted ? [] : outputs);
      setMessage(controller.signal.aborted ? '下载已取消' : '下载或保存失败，请检查网络及目录写入权限后重试；可重新选择目录。');
    } finally {
      active.current = null;
      setBusy(false);
    }
  }
  async function chooseDirectory(cardId: string) {
    try {
      const directory = await selectRootDirectory();
      if (directory) { history.setDirectory(cardId, directory); setMessage(`目录已设置：${directory.name}`); }
    } catch (error) { setMessage(error instanceof Error ? error.message : '选择目录失败'); }
  }
  return { busy, message, failed, download, chooseDirectory,
    retry: () => download(retryRuns.current, failed), cancel: () => active.current?.abort() };
}
