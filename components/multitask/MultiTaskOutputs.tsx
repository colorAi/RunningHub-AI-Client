import {
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  FileIcon,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TaskOutput } from '../../types';
type OutputKind = 'image' | 'video' | 'audio' | 'unknown';
const getOutputUrl = (output: TaskOutput) => output.fileUrl || output.downloadUrl || '';

const inferOutputKind = (output: TaskOutput): OutputKind => {
  const url = getOutputUrl(output);
  const fileType = output.fileType?.toLowerCase();

  if (fileType && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(fileType)) {
    return 'image';
  }
  if (fileType && ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(fileType)) {
    return 'video';
  }
  if (fileType && ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(fileType)) {
    return 'audio';
  }
  if (/^data:image/i.test(url) || /\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?.*)?$/i.test(url)) {
    return 'image';
  }
  if (/^(blob:|data:video)/i.test(url) || /\.(mp4|webm|mov|avi|mkv)(\?.*)?$/i.test(url)) {
    return 'video';
  }
  if (/^(data:audio)/i.test(url) || /\.(mp3|wav|ogg|flac|aac)(\?.*)?$/i.test(url)) {
    return 'audio';
  }

  return 'unknown';
};

const buildDownloadName = (url: string, fileType?: string) => {
  if (!url.startsWith('blob:')) {
    const clean = url.split('?')[0];
    return clean.split('/').pop() || 'download';
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `result_${timestamp}.${fileType || 'bin'}`;
};

const renderOutputPreview = (output: TaskOutput, mode: 'card' | 'modal') => {
  const url = getOutputUrl(output);
  const kind = inferOutputKind(output);
  const mediaClass = mode === 'card' ? 'h-full w-full object-contain' : 'max-h-[78vh] max-w-full object-contain';

  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
        {'\u6682\u65e0\u53ef\u9884\u89c8\u7ed3\u679c'}
      </div>
    );
  }

  if (kind === 'image') {
    return <img src={url} alt="Task Output" className={mediaClass} />;
  }

  if (kind === 'video') {
    return <video src={url} controls className={mediaClass} />;
  }

  if (kind === 'audio') {
    return (
      <div className="flex h-full w-full items-center justify-center px-6">
        <audio src={url} controls className="w-full max-w-md" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-500 dark:text-slate-400">
      <FileIcon className="h-10 w-10" />
      <div className="max-w-full break-all text-xs">{url}</div>
    </div>
  );
};

const renderOutputThumb = (output: TaskOutput) => {
  const url = getOutputUrl(output);
  const kind = inferOutputKind(output);

  if (kind === 'image') {
    return <img src={url} alt="Result Thumbnail" className="h-full w-full object-cover" />;
  }

  if (kind === 'video') {
    return <video src={url} className="h-full w-full object-cover" muted preload="metadata" />;
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
      {kind}
    </div>
  );
};


export default function MultiTaskOutputs({ outputs }: { outputs: TaskOutput[] }) {
  const [activeOutputIndex, setActiveOutputIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const displayOutputs = useMemo(() => outputs.slice(-4), [outputs]);
  const hasMultipleOutputs = displayOutputs.length > 1;
  const selectedOutput = displayOutputs[activeOutputIndex] || null;

  useEffect(() => {
    if (displayOutputs.length === 0) {
      setActiveOutputIndex(0);
      setPreviewOpen(false);
      return;
    }

    setActiveOutputIndex(current => (current >= displayOutputs.length ? 0 : current));
  }, [displayOutputs]);

  const handleDownload = async (output: TaskOutput | null) => {
    if (!output) return;

    const url = getOutputUrl(output);
    if (!url) return;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('download failed');
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = buildDownloadName(url, output.fileType || blob.type.split('/')[1]?.replace('jpeg', 'jpg'));
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const shiftOutput = (direction: -1 | 1) => {
    if (displayOutputs.length <= 1) return;
    setActiveOutputIndex(current => (current + direction + displayOutputs.length) % displayOutputs.length);
  };

  return <>
    {displayOutputs.length > 0 && selectedOutput && (

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {'\u6700\u65b0\u7ed3\u679c'}
          </div>
          {hasMultipleOutputs && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {activeOutputIndex + 1} / {displayOutputs.length}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="relative flex h-64 items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-3 dark:from-slate-900 dark:to-slate-950">
            {hasMultipleOutputs && (
              <>
                <button
                  type="button"
                  onClick={() => shiftOutput(-1)}
                  className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/45 p-2 text-white transition hover:bg-black/65"
                  aria-label="Previous output"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => shiftOutput(1)}
                  className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/45 p-2 text-white transition hover:bg-black/65"
                  aria-label="Next output"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="group h-full w-full cursor-zoom-in"
              title="\u67e5\u770b\u5927\u56fe"
            >
              {renderOutputPreview(selectedOutput, 'card')}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/60 via-black/10 to-transparent px-4 py-4 opacity-0 transition group-hover:opacity-100">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-3 py-1.5 text-xs text-white backdrop-blur">
                  <Expand className="h-3.5 w-3.5" />
                  {'\u67e5\u770b\u5927\u56fe'}
                </span>
              </div>
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-3 py-3 dark:border-slate-700">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {inferOutputKind(selectedOutput) === 'image'
                ? '\u56fe\u7247'
                : inferOutputKind(selectedOutput) === 'video'
                  ? '\u89c6\u9891'
                  : inferOutputKind(selectedOutput) === 'audio'
                    ? '\u97f3\u9891'
                    : '\u6587\u4ef6'}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-brand-300 hover:text-brand-600 dark:border-slate-700 dark:text-slate-300"
              >
                <Expand className="h-3.5 w-3.5" />
                {'\u9884\u89c8\u5927\u56fe'}
              </button>
              <button
                type="button"
                onClick={() => void handleDownload(selectedOutput)}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                <Download className="h-3.5 w-3.5" />
                {'\u4e0b\u8f7d'}
              </button>
            </div>
          </div>

          {hasMultipleOutputs && (
            <div className="border-t border-slate-200 px-3 py-3 dark:border-slate-700">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {displayOutputs.map((output, index) => {
                  const isActive = index === activeOutputIndex;
                  return (
                    <button
                      key={`${getOutputUrl(output)}-${index}`}
                      type="button"
                      onClick={() => setActiveOutputIndex(index)}
                      className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border transition ${isActive
                          ? 'border-brand-500 ring-2 ring-brand-200 dark:ring-brand-900/50'
                          : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-500'
                        }`}
                      title={`Result ${index + 1}`}
                    >
                      {renderOutputThumb(output)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    )}

    {previewOpen && selectedOutput && createPortal(
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        onClick={() => setPreviewOpen(false)}
      >
        <div
          className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl"
          onClick={event => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setPreviewOpen(false)}
            className="absolute right-4 top-4 z-20 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="relative flex min-h-[420px] flex-1 items-center justify-center bg-black px-6 py-8">
            {hasMultipleOutputs && (
              <>
                <button
                  type="button"
                  onClick={() => shiftOutput(-1)}
                  className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
                  aria-label="Previous output"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => shiftOutput(1)}
                  className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
                  aria-label="Next output"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}

            {renderOutputPreview(selectedOutput, 'modal')}
          </div>

          <div className="border-t border-white/10 bg-slate-950/95 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-300">
                {hasMultipleOutputs
                  ? `\u7ed3\u679c ${activeOutputIndex + 1} / ${displayOutputs.length}`
                  : '\u7ed3\u679c\u9884\u89c8'}
              </div>
              <button
                type="button"
                onClick={() => void handleDownload(selectedOutput)}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-200"
              >
                <Download className="h-4 w-4" />
                {'\u4e0b\u8f7d\u5f53\u524d\u7ed3\u679c'}
              </button>
            </div>

            {hasMultipleOutputs && (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {displayOutputs.map((output, index) => {
                  const isActive = index === activeOutputIndex;
                  return (
                    <button
                      key={`preview-${getOutputUrl(output)}-${index}`}
                      type="button"
                      onClick={() => setActiveOutputIndex(index)}
                      className={`h-20 w-20 shrink-0 overflow-hidden rounded-2xl border transition ${isActive
                          ? 'border-brand-400 ring-2 ring-brand-500/40'
                          : 'border-white/10 hover:border-white/25'
                        }`}
                      title={`Preview ${index + 1}`}
                    >
                      {renderOutputThumb(output)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      , document.body)}
  </>;
}
