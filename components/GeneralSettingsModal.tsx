import React, { useEffect, useState } from 'react';
import { FolderOpen, Loader2, Save, X } from 'lucide-react';
import { AutoSaveConfig } from '../types';
import {
  selectDirectory,
  clearDirectory,
  isFileSystemAccessSupported,
  checkDirectoryAccess,
  hasDirectoryAccess,
  getCurrentDirectoryPath,
} from '../services/autoSaveService';

type StartupView = 'home' | 'workspace' | 'multitask';

interface GeneralSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  autoSaveConfig: AutoSaveConfig;
  onUpdateAutoSave: (config: AutoSaveConfig) => void;
  startupView: StartupView;
  onUpdateStartupView: (view: StartupView) => void;
}

const STARTUP_VIEW_OPTIONS: { value: StartupView; label: string; description: string }[] = [
  { value: 'home', label: '首页', description: '启动后先看应用推荐和收藏入口' },
  { value: 'workspace', label: '单任务模式', description: '启动后直接进入单任务工作区' },
  { value: 'multitask', label: '多任务模式', description: '启动后直接进入多任务调度' },
];

const GeneralSettingsModal: React.FC<GeneralSettingsModalProps> = ({
  isOpen,
  onClose,
  autoSaveConfig,
  onUpdateAutoSave,
  startupView,
  onUpdateStartupView,
}) => {
  const [autoSaveSupported] = useState(isFileSystemAccessSupported());
  const [permissionExpired, setPermissionExpired] = useState(false);
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false);

  useEffect(() => {
    const checkPermission = async () => {
      if (autoSaveConfig.enabled && autoSaveConfig.directoryName) {
        const hasAccess = await checkDirectoryAccess();
        setPermissionExpired(!hasAccess);
        return;
      }

      setPermissionExpired(false);
    };

    if (isOpen) {
      checkPermission();
    }
  }, [autoSaveConfig, isOpen]);

  const handleSelectDirectory = async () => {
    setIsSelectingDirectory(true);

    try {
      const dirName = await selectDirectory();
      if (dirName) {
        onUpdateAutoSave({
          ...autoSaveConfig,
          enabled: true,
          directoryName: dirName,
          directoryPath: getCurrentDirectoryPath(),
        });
        setPermissionExpired(false);
      }
    } catch (error) {
      console.error('Directory selection failed:', error);
    } finally {
      setIsSelectingDirectory(false);
    }
  };

  const handleClearDirectory = async () => {
    await clearDirectory();
    onUpdateAutoSave({ enabled: false, directoryName: null, directoryPath: null });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-[720px] max-w-[95vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#1a1d24]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800/50">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">综合设置</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-5">
          <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800/50 dark:bg-slate-900/30">
            <div className="mb-4">
              <h4 className="text-base font-bold text-slate-800 dark:text-white">首页设置</h4>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                选择启动软件后默认打开的页面，下次进入会直接跳到这里。
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {STARTUP_VIEW_OPTIONS.map((option) => {
                const isActive = startupView === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onUpdateStartupView(option.value)}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      isActive
                        ? 'border-brand-500 bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:shadow-sm dark:border-slate-700 dark:bg-[#161920] dark:text-slate-200 dark:hover:border-brand-700'
                    }`}
                  >
                    <div className="text-sm font-bold">{option.label}</div>
                    <div className={`mt-2 text-xs leading-5 ${isActive ? 'text-white/85' : 'text-slate-500 dark:text-slate-400'}`}>
                      {option.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800/50 dark:bg-slate-900/30">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-slate-800 dark:text-white">自动保存</h4>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  批量和工作区任务完成后，自动将结果保存到你指定的目录。
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!autoSaveConfig.enabled && !hasDirectoryAccess()) {
                    alert('请先选择保存目录，然后再启用自动保存');
                    return;
                  }

                  onUpdateAutoSave({ ...autoSaveConfig, enabled: !autoSaveConfig.enabled });
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:focus:ring-offset-[#1a1d24] ${
                  autoSaveConfig.enabled ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    autoSaveConfig.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {!autoSaveSupported ? (
              <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs text-amber-600 dark:border-amber-900/20 dark:bg-amber-900/10 dark:text-amber-400">
                当前环境不支持文件系统访问 API，暂时无法使用自动保存功能。
              </div>
            ) : (
              <>
                {permissionExpired && (
                  <div className="mb-3 rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs text-amber-600 dark:border-amber-900/20 dark:bg-amber-900/10 dark:text-amber-400">
                    自动保存目录的访问权限已过期，请重新选择目录。
                  </div>
                )}

                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <button
                    type="button"
                    onClick={handleSelectDirectory}
                    disabled={isSelectingDirectory}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    {isSelectingDirectory ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FolderOpen className="h-3.5 w-3.5" />
                    )}
                    {autoSaveConfig.directoryName ? '重新选择目录' : '选择目录'}
                  </button>

                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700/50 dark:bg-slate-800/50">
                    {autoSaveConfig.directoryName ? (
                      <span className="flex-1 truncate font-mono text-xs text-emerald-600 dark:text-emerald-400">
                        {autoSaveConfig.directoryName}
                      </span>
                    ) : (
                      <span className="text-xs italic text-slate-400">还没有选择保存目录</span>
                    )}

                    {autoSaveConfig.directoryName && (
                      <button
                        type="button"
                        onClick={handleClearDirectory}
                        className="p-1 text-slate-400 transition-colors hover:text-red-500"
                        title="清除目录"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>

        <div className="flex justify-end border-t border-slate-100 px-5 py-4 dark:border-slate-800/50">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            <Save className="h-4 w-4" />
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export default GeneralSettingsModal;
