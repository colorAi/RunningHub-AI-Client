import React, { useRef, useState } from 'react';
import { AlertCircle, Archive, CheckCircle2, Download, FolderOpen, Loader2 } from 'lucide-react';
import { DirectoryHandle, saveBinaryFile, selectRootDirectory } from '../../services/fileSystem';
import { createMultiTaskArchive, createMultiTaskArchiveFilename } from '../../services/multiTaskArchive';
import { authorizeDirectory } from '../../services/runHistory/download';
import { TaskOutput } from '../../types';

interface MultiTaskCardDownloadProps {
  directory: DirectoryHandle | null;
  onDirectoryChange: (directory: DirectoryHandle) => void;
  cardName: string;
  isBatch: boolean;
  isRunning: boolean;
  runStatus: 'idle' | 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
  outputs: TaskOutput[];
}

type DownloadFeedback = {
  kind: 'success' | 'warning' | 'error' | 'progress';
  message: string;
};

const MultiTaskCardDownload: React.FC<MultiTaskCardDownloadProps> = ({
  directory,
  onDirectoryChange: setDirectory,
  cardName,
  isBatch,
  isRunning,
  runStatus,
  outputs,
}) => {
  const [directoryPending, setDirectoryPending] = useState(false);
  const [feedback, setFeedback] = useState<DownloadFeedback | null>(null);
  const downloadActive = useRef(false);

  const canDownload = isBatch
    && !isRunning
    && ['success', 'failed', 'cancelled'].includes(runStatus)
    && outputs.length > 0;

  const handleSelectDirectory = async () => {
    setDirectoryPending(true);
    setFeedback(null);
    try {
      const selected = await selectRootDirectory();
      if (selected) {
        setDirectory(selected);
        setFeedback({ kind: 'success', message: `下载目录已设置：${selected.name}` });
      }
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : '无法选择目录，请重试。' });
    } finally {
      setDirectoryPending(false);
    }
  };

  const handleDownload = async () => {
    if (downloadActive.current) return;
    if (!directory) {
      setFeedback({ kind: 'error', message: '请先为此卡片选择下载目录。' });
      return;
    }
    if (!canDownload) return;

    downloadActive.current = true;
    setFeedback({ kind: 'progress', message: `准备打包 ${outputs.length} 个结果…` });
    try {
      await authorizeDirectory(directory);
      const archive = await createMultiTaskArchive(outputs, fetch, (completed, total, failed) => {
        setFeedback({
          kind: 'progress',
          message: `正在下载并打包 ${completed}/${total} 个结果${failed ? `，${failed} 个失败` : ''}…`,
        });
      });
      const filename = createMultiTaskArchiveFilename(cardName || 'batch-results');
      const saved = await saveBinaryFile(directory, filename, archive.blob);
      if (!saved) throw new Error('ZIP 保存失败，请更换目录后重试。');

      setFeedback({
        kind: archive.failedCount > 0 ? 'warning' : 'success',
        message: archive.failedCount > 0
          ? `ZIP 已保存：${archive.includedCount} 个结果成功，${archive.failedCount} 个结果未能下载。`
          : `ZIP 已保存：共 ${archive.includedCount} 个结果。`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '打包或保存失败，请重试。';
      setFeedback({ kind: 'error', message });
    } finally {
      downloadActive.current = false;
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/30" aria-label="批量结果下载">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 max-w-full text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={directory?.name || '尚未设置'}>
              {directory ? `保存到：${directory.name}` : '尚未设置此卡片的下载目录'}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSelectDirectory()}
            disabled={directoryPending || isRunning || downloadActive.current}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-brand-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
          >
            {directoryPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
            {directory ? '更换目录' : '选择目录'}
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={!canDownload || !directory || directoryPending || downloadActive.current}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            title={!canDownload ? '批量任务完成并产生结果后可下载' : undefined}
          >
            {feedback?.kind === 'progress'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <><Archive className="h-3.5 w-3.5" /><Download className="h-3.5 w-3.5" /></>}
            {feedback?.kind === 'progress' ? '正在打包…' : '批量下载'}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`mt-2 max-h-20 overflow-y-auto break-all flex items-start gap-1.5 text-xs ${
            feedback.kind === 'error' ? 'text-red-600 dark:text-red-300'
              : feedback.kind === 'warning' ? 'text-amber-600 dark:text-amber-300'
                : feedback.kind === 'success' ? 'text-emerald-600 dark:text-emerald-300'
                  : 'text-slate-500 dark:text-slate-400'
          }`}
          role="status"
          aria-live="polite"
        >
          {feedback.kind === 'error'
            ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            : feedback.kind === 'success'
              ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              : null}
          <span className="min-w-0">{feedback.message}</span>
        </div>
      )}
    </section>
  );
};

export default MultiTaskCardDownload;
