import React, { useEffect, useState } from 'react';
import { LayoutTemplate, Lock, Settings, SlidersHorizontal, Volume2 } from 'lucide-react';
import { AutoSaveConfig, DecodeConfig, HomeDefaultTab } from '../types';
import BatchReminderModal from './BatchReminderModal';
import GeneralSettingsModal from './GeneralSettingsModal';
import { isDecodeFeatureEnabled } from '../utils/decodeConfig';

type StartupView = 'home' | 'workspace' | 'multitask' | 'skills';

interface ToolsViewProps {
  onOpenDecodeSettings: () => void;
  decodeConfig: DecodeConfig;
  autoSaveConfig: AutoSaveConfig;
  onUpdateAutoSave: (config: AutoSaveConfig) => void;
  startupView: StartupView;
  onUpdateStartupView: (view: StartupView) => void;
  homeDefaultTab: HomeDefaultTab;
  onUpdateHomeDefaultTab: (tab: HomeDefaultTab) => void;
}

const STARTUP_VIEW_LABELS: Record<StartupView, string> = {
  home: '首页',
  workspace: '单任务模式',
  multitask: '多任务模式',
  skills: 'Skills 模式 (开发中)',
};

const HOME_TAB_LABELS: Record<HomeDefaultTab, string> = {
  official: '官方应用商城',
  excellent: '优秀UP应用推荐',
  support: '交流与支持',
};

const ToolsView: React.FC<ToolsViewProps> = ({
  onOpenDecodeSettings,
  decodeConfig,
  autoSaveConfig,
  onUpdateAutoSave,
  startupView,
  onUpdateStartupView,
  homeDefaultTab,
  onUpdateHomeDefaultTab,
}) => {
  const [showBatchReminderModal, setShowBatchReminderModal] = useState(false);
  const [showGeneralSettingsModal, setShowGeneralSettingsModal] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const decodeEnabled = isDecodeFeatureEnabled(decodeConfig);
  const decodeBadgeText = decodeConfig.alwaysOn ? '全局检测中' : '已启用';

  useEffect(() => {
    const enabled = localStorage.getItem('rh_batch_reminder_enabled') === 'true';
    setReminderEnabled(enabled);
  }, [showBatchReminderModal]);

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-6 dark:bg-[#0F1115]">
      <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-200">
          <Settings className="h-6 w-6 text-slate-500" />
          工具箱
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <div
          onClick={() => setShowGeneralSettingsModal(true)}
          className="group flex min-h-[160px] cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:border-brand-300 hover:shadow-lg dark:border-slate-800 dark:bg-[#1a1d24] dark:hover:border-brand-700"
        >
          <div className="relative flex h-24 items-center justify-center overflow-hidden bg-gradient-to-br from-sky-100 to-cyan-50 dark:from-sky-900/20 dark:to-slate-800">
            <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
            <SlidersHorizontal className="h-12 w-12 text-sky-600/80 transition-transform duration-300 group-hover:scale-110 dark:text-sky-400/80" />
            <div className="absolute right-2 top-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">
              {autoSaveConfig.enabled ? '自动保存已开' : '综合设置'}
            </div>
          </div>

          <div className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800 transition-colors group-hover:text-sky-700 dark:text-slate-200 dark:group-hover:text-sky-400">
                综合设置
              </h3>
            </div>
            <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
              管理自动保存、启动页和首页默认标签，让软件打开后直接进入你常用的页面，并且随时可调整。
            </p>
            <div className="mt-3 space-y-1 text-[11px] text-slate-400 dark:text-slate-500">
              <div className="flex items-center gap-2">
                <LayoutTemplate className="h-3.5 w-3.5" />
                启动页: {STARTUP_VIEW_LABELS[startupView]}
              </div>
              <div className="flex items-center gap-2">
                <LayoutTemplate className="h-3.5 w-3.5" />
                首页默认标签: {HOME_TAB_LABELS[homeDefaultTab]}
              </div>
            </div>
          </div>
        </div>

        <div
          onClick={onOpenDecodeSettings}
          className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:border-brand-300 hover:shadow-lg dark:border-slate-800 dark:bg-[#1a1d24] dark:hover:border-brand-700"
        >
          <div className="relative flex h-24 items-center justify-center overflow-hidden bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/20 dark:to-slate-800">
            <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
            <span className="select-none text-6xl drop-shadow-sm transition-transform group-hover:scale-110">🐤</span>
            {decodeEnabled && (
              <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-600 dark:text-green-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500"></span>
                {decodeBadgeText}
              </div>
            )}
          </div>

          <div className="p-4">
            <h3 className="mb-1 text-sm font-bold text-slate-800 transition-colors group-hover:text-amber-600 dark:text-slate-200 dark:group-hover:text-amber-500">
              小黄鸭解码
            </h3>
            <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
              自动识别并检测小黄鸭加密图，没有则跳过，有则直接解码，全局生效。
            </p>
          </div>
        </div>

        <div
          onClick={() => setShowBatchReminderModal(true)}
          className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:border-brand-300 hover:shadow-lg dark:border-slate-800 dark:bg-[#1a1d24] dark:hover:border-brand-700"
        >
          <div className="relative flex h-24 items-center justify-center overflow-hidden bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/20 dark:to-slate-800">
            <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
            <Volume2 className="h-12 w-12 text-purple-500/80 transition-transform duration-300 group-hover:scale-110" />
            {reminderEnabled && (
              <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-600 dark:text-green-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500"></span>
                已启用
              </div>
            )}
          </div>

          <div className="p-4">
            <h3 className="mb-1 text-sm font-bold text-slate-800 transition-colors group-hover:text-purple-600 dark:text-slate-200 dark:group-hover:text-purple-500">
              批量完成提醒
            </h3>
            <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
              批量任务全部完成后，播放指定的提示音进行通知。
            </p>
          </div>
        </div>

        <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-slate-400 dark:border-slate-800 dark:bg-slate-800/50">
          <Lock className="h-8 w-8 opacity-20" />
          <span className="text-xs">更多工具开发中...</span>
        </div>
      </div>

      <BatchReminderModal
        isOpen={showBatchReminderModal}
        onClose={() => setShowBatchReminderModal(false)}
      />

      <GeneralSettingsModal
        isOpen={showGeneralSettingsModal}
        onClose={() => setShowGeneralSettingsModal(false)}
        autoSaveConfig={autoSaveConfig}
        onUpdateAutoSave={onUpdateAutoSave}
        startupView={startupView}
        onUpdateStartupView={onUpdateStartupView}
        homeDefaultTab={homeDefaultTab}
        onUpdateHomeDefaultTab={onUpdateHomeDefaultTab}
      />
    </div>
  );
};

export default ToolsView;
