import React, { useState } from 'react';
import { HistoryItem, DecodeConfig } from '../types';
import { Download, ExternalLink, FileIcon, ImageIcon, VideoIcon, History, Trash2, Maximize2, X, Clock, Terminal, Unlock, Loader2 } from 'lucide-react';
import { decodeDuckImage } from '../utils/duckDecoder';

interface StepResultProps {
  history: HistoryItem[];
  decodeConfig: DecodeConfig;
  onClear: () => void;
}

const StepResult: React.FC<StepResultProps> = ({ history, decodeConfig, onClear }) => {
  const [preview, setPreview] = useState<{ url: string; type: 'image' | 'video' | 'audio' | 'unknown' } | null>(null);
  // Cache for decoded URLs: original URL -> decoded blob URL
  const [decodedUrls, setDecodedUrls] = useState<Record<string, string>>({});
  // Track which URLs are currently being decoded
  const [decodingUrls, setDecodingUrls] = useState<Record<string, boolean>>({});
  // Cache for decoded extensions: original URL -> decoded file extension
  const [decodedExtensions, setDecodedExtensions] = useState<Record<string, string>>({});

  const getFileType = (url: string) => {
    if (/\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(url)) return 'image';
    if (/\.(mp4|webm|mov|avi|mkv)$/i.test(url)) return 'video';
    if (/\.(mp3|wav|ogg|flac|aac)$/i.test(url)) return 'audio';
    return 'unknown';
  };

  const handleDownload = async (url: string, fileType?: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Network response was not ok');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;

      // Generate filename
      let fileName: string;
      if (url.startsWith('blob:')) {
        // For blob URLs, use fileType or extract from blob.type
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        let ext = fileType;
        if (!ext && blob.type) {
          // Extract extension from MIME type (e.g., image/png -> png)
          const mimeExt = blob.type.split('/')[1]?.replace('jpeg', 'jpg');
          ext = mimeExt || 'bin';
        }
        fileName = `decoded_${timestamp}.${ext || 'bin'}`;
      } else {
        fileName = url.split('/').pop() || 'download';
      }

      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
      window.open(url, '_blank');
    }
  };

  // Handle manual decode for a single image
  const handleDecode = async (originalUrl: string) => {
    if (decodedUrls[originalUrl] || decodingUrls[originalUrl]) return;

    setDecodingUrls(prev => ({ ...prev, [originalUrl]: true }));
    try {
      const result = await decodeDuckImage(originalUrl, decodeConfig.password);
      if (result.success && result.data) {
        const decodedUrl = URL.createObjectURL(result.data);
        setDecodedUrls(prev => ({ ...prev, [originalUrl]: decodedUrl }));
        // Store the decoded extension
        setDecodedExtensions(prev => ({ ...prev, [originalUrl]: result.extension || 'png' }));
      }
    } catch (e) {
      console.error('Decode failed:', e);
    } finally {
      setDecodingUrls(prev => ({ ...prev, [originalUrl]: false }));
    }
  };

  // Get display URL (decoded if available, otherwise original)
  const getDisplayUrl = (originalUrl: string) => {
    return decodedUrls[originalUrl] || originalUrl;
  };

  // Get file type for download (decoded extension if decoded, otherwise from output)
  const getFileTypeForDownload = (originalUrl: string, outputFileType?: string) => {
    // If manually decoded in StepResult, use the decoded extension
    if (decodedExtensions[originalUrl]) {
      return decodedExtensions[originalUrl];
    }
    // If auto-decoded in StepRunning, use the output's fileType
    return outputFileType;
  };

  // Flatten all outputs into a single array for thumbnail grid
  const allOutputs = history.flatMap(item =>
    item.outputs.map(output => ({
      ...output,
      historyId: item.id,
      timestamp: item.timestamp
    }))
  );

  const totalOutputs = allOutputs.length;

  if (history.length === 0) {
    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0F1115]/50">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800/50 bg-white dark:bg-[#161920] flex justify-between items-center">
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-white">
            <History className="w-5 h-5 text-brand-500" />
            历史记录
          </h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 p-8 text-center">
          <Terminal className="w-12 h-12 mb-4 opacity-20" />
          <h3 className="text-base font-medium text-slate-500 dark:text-slate-400">准备就绪</h3>
          <p className="text-sm max-w-xs mt-2">配置中间的参数并点击"运行任务"，生成历史将显示在这里。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#161920] relative">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800/50 bg-white dark:bg-[#161920] flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-white">
            <History className="w-5 h-5 text-brand-500" />
            历史记录
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            共 {totalOutputs} 个结果
          </p>
        </div>
        <button
          onClick={onClear}
          title="清空历史"
          className="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Thumbnail Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
          {allOutputs.map((output, idx) => {
            const originalUrl = output.fileUrl;
            const displayUrl = getDisplayUrl(originalUrl);

            // Determine file type - prefer output.fileType for decoded images
            let type: 'image' | 'video' | 'audio' | 'unknown' = getFileType(originalUrl);
            if (type === 'unknown' && output.fileType) {
              // Use fileType from decoded output
              const extLower = output.fileType.toLowerCase();
              if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(extLower)) {
                type = 'image';
              } else if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(extLower)) {
                type = 'video';
              } else if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(extLower)) {
                type = 'audio';
              }
            }

            const isDecoded = !!decodedUrls[originalUrl];
            const isDecoding = !!decodingUrls[originalUrl];
            const showDecodeButton = decodeConfig.enabled && !decodeConfig.autoDecodeEnabled && !isDecoded && type === 'image';


            return (
              <div
                key={`${output.historyId}-${idx}`}
                className={`group relative aspect-square bg-slate-200 dark:bg-[#0F1115] rounded-lg overflow-hidden border cursor-pointer hover:ring-2 hover:ring-brand-500 transition-all ${isDecoded
                  ? 'border-amber-400 dark:border-amber-500'
                  : 'border-slate-300 dark:border-slate-700'
                  }`}
                onClick={() => setPreview({ url: displayUrl, type })}
              >
                {type === 'image' ? (
                  <img src={displayUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                ) : type === 'video' ? (
                  <video src={displayUrl} className="w-full h-full object-cover opacity-80" muted preload="metadata" />
                ) : (
                  <div className="flex flex-col items-center justify-center w-full h-full text-slate-400">
                    <FileIcon className="w-6 h-6 mb-1" />
                    <span className="text-[8px] uppercase">{type}</span>
                  </div>
                )}

                {/* Decode Progress Overlay */}
                {isDecoding && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                  </div>
                )}

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 backdrop-blur-[1px]">
                  {showDecodeButton && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDecode(originalUrl);
                      }}
                      className="p-1.5 bg-amber-500/80 hover:bg-amber-500 text-white rounded-full backdrop-blur-md transition-colors"
                      title="解码"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreview({ url: displayUrl, type });
                    }}
                    className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-full backdrop-blur-md transition-colors"
                    title="放大预览"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(displayUrl, getFileTypeForDownload(originalUrl, output.fileType));
                    }}
                    className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-full backdrop-blur-md transition-colors"
                    title="下载"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Type Badge */}
                {type !== 'image' && (
                  <div className="absolute top-1 right-1 px-1 py-0.5 bg-black/50 backdrop-blur-sm rounded text-[6px] text-white font-bold uppercase pointer-events-none">
                    {type}
                  </div>
                )}

                {/* Decoded Badge */}
                {isDecoded && (
                  <div className="absolute top-1 left-1 px-1 py-0.5 bg-amber-500 rounded text-[6px] text-white font-bold uppercase pointer-events-none flex items-center gap-0.5">
                    <Unlock className="w-2 h-2" />
                    已解码
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Full Screen Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <button
            onClick={() => setPreview(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-50"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="relative max-w-5xl w-full max-h-screen flex flex-col items-center justify-center">
            {preview.type === 'image' && (
              <img
                src={preview.url}
                alt="Preview"
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              />
            )}
            {preview.type === 'video' && (
              <video
                src={preview.url}
                controls
                autoPlay
                className="max-w-full max-h-[85vh] rounded-lg shadow-2xl bg-black"
              />
            )}
            {(preview.type === 'audio' || preview.type === 'unknown') && (
              <div className="bg-slate-800 p-10 rounded-2xl flex flex-col items-center text-white shadow-2xl border border-slate-700">
                <FileIcon className="w-20 h-20 mb-6 text-slate-400" />
                <audio controls src={preview.url} className="w-64" />
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 flex items-center gap-2 text-brand-400 hover:text-brand-300"
                >
                  <ExternalLink className="w-4 h-4" />
                  在浏览器中打开
                </a>
              </div>
            )}

            <div className="mt-4 flex gap-4">
              <button
                onClick={() => handleDownload(preview.url)}
                className="flex items-center gap-2 px-4 py-2 bg-white text-slate-900 rounded-full font-medium hover:bg-slate-200 transition-colors shadow-lg"
              >
                <Download className="w-4 h-4" />
                下载文件
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StepResult;