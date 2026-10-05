import type { TaskCardRequest } from '../hooks/useTaskCardRequests';
import { useRequestedCards } from './multitask/useRequestedCards';
import React, { useEffect, useState } from 'react';
import CardManagerView from './cardManager/CardManagerView';
import CardManagementDialog from './cardManager/CardManagementDialog';
import { useCardManagement } from './cardManager/useCardManagement';
import { Layers, Loader2, Play, Plus, Save, Square, Trash2, X } from 'lucide-react';
import { useRunHistory } from './multitask/history/useRunHistory';
import RunHistoryPanel from './multitask/history/RunHistoryPanel';
import MultiTaskCard from './multitask/MultiTaskCard';
import { useMultiTaskWorkspace } from './multitask/useMultiTaskWorkspace';
import { useMultiTaskScheduler } from './multitask/useMultiTaskScheduler';
import { DRAFT_NAME_PLACEHOLDER } from './multitask/workspaceModel';
import type { ApiKeyEntry, AutoSaveConfig, RecentApp, Favorite } from '../types';

interface MultiTaskViewProps {
  cardRequests: TaskCardRequest[];
  onCardRequestsHandled: (ids: string[]) => void;
  active: boolean;
  managementActive?: boolean;
  onShowWorkspace?: () => void;
  apiKeys: ApiKeyEntry[];
  autoSaveConfig: AutoSaveConfig;
  recentApps: RecentApp[];
  favorites: Favorite[];
}

const MultiTaskView: React.FC<MultiTaskViewProps> = ({ apiKeys, autoSaveConfig, recentApps, favorites, cardRequests, onCardRequestsHandled, active, managementActive = false, onShowWorkspace }) => {
  const history = useRunHistory();
  const workspace = useMultiTaskWorkspace(apiKeys);
  const cardListRef = useRequestedCards(cardRequests, onCardRequestsHandled, workspace, active);
  const [revealCardId, setRevealCardId] = useState<string | null>(null);
  const openTask = (id: string) => { setRevealCardId(id); onShowWorkspace?.(); };
  const management = useCardManagement(workspace, managementActive, openTask);
  useEffect(() => {
    if (!active || !revealCardId) return;
    const frame = requestAnimationFrame(() => {
      const target = [...(cardListRef.current?.querySelectorAll<HTMLElement>('[data-task-card-id]') || [])]
        .find(element => element.dataset.taskCardId === revealCardId);
      if (target) { target.scrollIntoView({ block: 'nearest' }); target.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true }); setRevealCardId(null); }
    });
    return () => cancelAnimationFrame(frame);
  }, [active, revealCardId, workspace.cards, cardListRef]);
  const { stopTrackingCard, stopAllTracking, handleRunCard, handleRunAll } = useMultiTaskScheduler(workspace, history, autoSaveConfig);
  const { cards, showAppPicker, setShowAppPicker, sessionActive, sessionNotice, drafts, isSaveDraftModalOpen, setIsSaveDraftModalOpen, draftNameInput, setDraftNameInput, draftModalError, setDraftModalError, confirmOverwriteDraftId, setConfirmOverwriteDraftId, draftPendingDelete, setDraftPendingDelete, editorRefs, sessionRef, totalConfiguredSlots, validApiKeys, updateCard, openSaveDraftModal, handleSaveDraft, handleLoadDraft, openDeleteDraftModal, handleConfirmDeleteDraft, handleCreateCard, handleCreateCardFromPreset, handleRemoveCard, handleDuplicateCard, handleWebappIdChange, handleLoadCard } = workspace;
  return (<>
    <div className={managementActive ? 'flex h-full min-h-0 w-full' : 'hidden'}>
      {(managementActive || management.library.ready) && <CardManagerView workspace={workspace} management={management} openTask={openTask} />}
    </div>
    <CardManagementDialog management={management} cards={cards} />
    <div className={`${managementActive ? 'hidden' : 'flex'} h-full min-h-0 w-full flex-col bg-slate-50 dark:bg-[#0F1115]`}>
      <div className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-[#161920]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-brand-500" />
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">多任务模式</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              每张卡片都是一个完整任务工作区，统一按 API 并发能力调度执行。当前并发槽位 {totalConfiguredSlots}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => history.setFilterCard(null)} className="rounded-lg border px-4 py-2 text-sm">运行记录{history.snapshot.unsaved ? " · 历史未保存" : ""}</button>
            <button
              onClick={() => setShowAppPicker(prev => !prev)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-300 hover:text-brand-500 dark:border-slate-700 dark:bg-[#1a1d24] dark:text-slate-300"
            >
              <Plus className="h-4 w-4" />
              新建卡片
            </button>

            <button
              onClick={openSaveDraftModal}
              disabled={cards.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-300 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-[#1a1d24] dark:text-slate-300"
            >
              <Save className="h-4 w-4" />
              {'\u4fdd\u5b58\u8349\u7a3f'}
            </button>

            {sessionActive ? (
              <button
                onClick={stopAllTracking}
                className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600"
              >
                <Square className="h-4 w-4" />
                停止追踪
              </button>
            ) : (
              <button
                onClick={handleRunAll}
                disabled={cards.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Play className="h-4 w-4" />
                全部运行
              </button>
            )}
          </div>
        </div>

        {showAppPicker && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-800 dark:bg-[#0F1115]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">快速创建卡片</h3>
              <button
                onClick={() => setShowAppPicker(false)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">空白卡片</div>
                <button
                  onClick={() => handleCreateCard()}
                  className="w-full rounded-xl border border-dashed border-brand-300 bg-white px-4 py-3 text-sm font-medium text-brand-600 transition hover:bg-brand-50 dark:border-brand-800 dark:bg-[#161920] dark:text-brand-300"
                >
                  创建空白卡片
                </button>
                <div className="mt-3 max-h-44 space-y-2 overflow-y-auto">
                  {drafts.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-400 dark:border-slate-800 dark:bg-[#161920]">
                      {'\u6682\u65e0\u8349\u7a3f'}
                    </div>
                  ) : (
                    drafts.map(draft => (
                      <div
                        key={draft.id}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-[#161920]"
                      >
                        <button
                          onClick={() => handleLoadDraft(draft)}
                          className="min-w-0 flex-1 text-left text-sm text-slate-700 transition hover:text-brand-500 dark:text-slate-200"
                        >
                          <div className="truncate font-medium">{draft.name}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {draft.cards.length} {'\u5f20\u5361\u7247'}
                          </div>
                        </button>
                        <button
                          onClick={() => openDeleteDraftModal(draft.id)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                          title="\u5220\u9664\u8349\u7a3f"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">收藏应用</div>
                <div className="max-h-44 space-y-2 overflow-y-auto">
                  {favorites.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-400 dark:border-slate-800 dark:bg-[#161920]">
                      暂无收藏
                    </div>
                  ) : (
                    favorites.map(item => (
                      <button
                        key={`fav-${item.webappId}`}
                        onClick={() => handleCreateCardFromPreset({ webappId: item.webappId, nodes: item.nodes, appInfo: item.appInfo, name: item.name })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm text-slate-700 transition hover:border-brand-300 hover:text-brand-500 dark:border-slate-800 dark:bg-[#161920] dark:text-slate-200"
                      >
                        {item.appInfo?.webappName || item.name || item.webappId}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">最近使用</div>
                <div className="max-h-44 space-y-2 overflow-y-auto">
                  {recentApps.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-400 dark:border-slate-800 dark:bg-[#161920]">
                      暂无记录
                    </div>
                  ) : (
                    recentApps.map(item => (
                      <button
                        key={`recent-${item.id}`}
                        onClick={() => handleCreateCardFromPreset({ webappId: item.id, name: item.name })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm text-slate-700 transition hover:border-brand-300 hover:text-brand-500 dark:border-slate-800 dark:bg-[#161920] dark:text-slate-200"
                      >
                        {item.name || item.id}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {sessionNotice && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
            {sessionNotice}
          </div>
        )}
      </div>

      <div ref={cardListRef} className="min-h-0 flex-1 overflow-auto p-6 [container-type:size]">
        {cards.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-12 text-center dark:border-slate-700 dark:bg-[#161920]">
              <Layers className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="mt-4 text-base font-medium text-slate-600 dark:text-slate-300">还没有任务卡片</p>
              <p className="mt-2 text-sm text-slate-400">先创建一个卡片，多任务调度会根据 API 并发能力自动并行。</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {cards.map(card => (
              <MultiTaskCard
                key={card.id}
                card={card}
                onManage={() => management.edit('live', card.id)}
                onSaveToLibrary={() => management.edit('save', card.id)}
                groupNames={management.library.groups.filter(group => card.organization?.groupIds.includes(group.id)).map(group => group.name)}
                directory={history.directories[card.id] || null}
                onDirectoryChange={directory => history.setDirectory(card.id, directory)}
                onHistory={() => history.setFilterCard(card.id)}
                apiKeys={validApiKeys}
                editorRef={ref => {
                  editorRefs.current[card.id] = ref;
                }}
                isBusy={!!sessionRef.current?.runningCardIds.has(card.id)}
                onRunOptionsChange={(cardId, runOptions) => {
                  if (sessionRef.current?.runningCardIds.has(cardId)) return;
                  updateCard(cardId, current => ({ ...current, runOptions }));
                }}
                onWebappIdChange={handleWebappIdChange}
                onLoad={handleLoadCard}
                onRemove={handleRemoveCard}
                onDuplicate={handleDuplicateCard}
                onRun={handleRunCard}
                onCancel={stopTrackingCard}
                onInstanceTypeChange={(cardId, nextType) => {
                  updateCard(cardId, current => ({
                    ...current,
                    instanceType: nextType,
                  }));
                }}
              />
            ))}
          </div>
        )}
      </div>

      {history.filterCard !== undefined && <RunHistoryPanel history={history} onClose={() => history.setFilterCard(undefined)} />}

      {isSaveDraftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#161920]">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">
                {'\u4fdd\u5b58\u591a\u4efb\u52a1\u8349\u7a3f'}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {'\u7ed9\u5f53\u524d\u5361\u7247\u7ec4\u5408\u8d77\u4e2a\u540d\u5b57\uff0c\u65b9\u4fbf\u540e\u7eed\u5feb\u901f\u6062\u590d\u3002'}
              </p>
            </div>

            <div className="px-5 py-4">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                {'\u8349\u7a3f\u540d\u79f0'}
              </label>
              <input
                autoFocus
                value={draftNameInput}
                onChange={event => {
                  setDraftNameInput(event.target.value);
                  setDraftModalError(null);
                  setConfirmOverwriteDraftId(null);
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    handleSaveDraft();
                  }
                }}
                placeholder={DRAFT_NAME_PLACEHOLDER}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-[#0F1115] dark:text-slate-200"
              />

              {draftModalError && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
                  {draftModalError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
              <button
                onClick={() => {
                  setIsSaveDraftModalOpen(false);
                  setDraftNameInput('');
                  setDraftModalError(null);
                  setConfirmOverwriteDraftId(null);
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white"
              >
                {'\u53d6\u6d88'}
              </button>
              <button
                onClick={handleSaveDraft}
                className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
              >
                {confirmOverwriteDraftId ? '\u8986\u76d6\u4fdd\u5b58' : '\u4fdd\u5b58\u8349\u7a3f'}
              </button>
            </div>
          </div>
        </div>
      )}

      {draftPendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          onClick={() => setDraftPendingDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#161920]"
            onClick={event => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">
                确认删除草稿
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                草稿“{draftPendingDelete.name}”删除后将无法恢复，确定要继续吗？
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
              <button
                onClick={() => setDraftPendingDelete(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDeleteDraft}
                className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600"
              >
                删除草稿
              </button>
            </div>
          </div>
        </div>
      )}

      {sessionActive && (
        <div className="border-t border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-[#161920]">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
            调度进行中，按并发槽位 {totalConfiguredSlots} 自动分配卡片任务与轮询。
          </div>
        </div>
      )}
    </div>
  </>);
};

export default MultiTaskView;
