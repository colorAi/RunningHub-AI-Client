import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RunRecord, RunStatus, runStatus } from '../../../services/runHistory/model';
import { historyOutputs } from '../../../services/runHistory/download';
import { useHistoryDownload } from './useHistoryDownload';
import type { useRunHistory } from './useRunHistory';

const labels: Record<RunStatus, string> = {
  running: '运行中', success: '已完成', failed: '存在失败项', stopped: '已停止追踪', untracked: '未继续追踪',
};
const button = 'rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800';
const field = 'rounded-lg border border-slate-300 bg-transparent p-2 text-sm dark:border-slate-600';
const PAGE_SIZE = 10;
export default function RunHistoryPanel({ history, onClose }: {
  history: ReturnType<typeof useRunHistory>; onClose: () => void;
}) {
  const { records, active, loading, unsaved } = history.snapshot;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(new Set<string>());
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const downloads = useHistoryDownload(history);
  useEffect(() => {
    void history.controller.load();
    const timer = setInterval(() => void history.controller.load(), 5000);
    return () => clearInterval(timer);
  }, [history.controller]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    panel.current?.focus();
    return () => previous?.focus();
  }, []);
  const filtered = records.filter(run => (!history.filterCard || run.cardId === history.filterCard)
    && `${run.appName} ${run.appId} ${run.batchName}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())
    && (status === 'all' || runStatus(run, active) === status));
  const maxPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, maxPage);
  const chosen = records.filter(run => selected.has(run.id) && !active.has(run.id));
  const downloadable = chosen.filter(run => run.units.some(unit => unit.outputs.length));
  const toggle = (id: string) => setSelected(previous => {
    const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const selectPage = () => setSelected(previous => {
    const next = new Set(previous);
    filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).filter(run => !active.has(run.id)).forEach(run => next.add(run.id));
    return next;
  });
  async function remove() {
    if (!chosen.length || !window.confirm(`删除选中的 ${chosen.length} 次本地运行记录？不会删除已下载文件或取消服务端任务。`)) return;
    setDeleting(true); setError('');
    try { await history.controller.remove(chosen.map(run => run.id)); setSelected(new Set()); }
    catch { setError('删除失败，本地记录已保留，请重试。'); }
    finally { setDeleting(false); }
  }
  const ready = (run: RunRecord) => !active.has(run.id) && run.units.some(unit => unit.outputs.length);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="run-history-title"
        className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white text-slate-800 shadow-2xl dark:bg-[#161920] dark:text-slate-100"
        onKeyDown={event => {
          if (event.key === 'Escape' && !downloads.busy) onClose();
          if (event.key !== 'Tab') return;
          const elements = [...panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select,summary')];
          const first = elements[0], last = elements.at(-1);
          if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <header className="flex items-center justify-between border-b border-slate-300 p-4 dark:border-slate-700">
          <div><h2 id="run-history-title" className="text-lg font-semibold">{history.filterCard ? '本卡片历史' : '运行记录'}</h2>
            <p className="mt-1 text-xs text-slate-500">仅保存在当前浏览器或桌面应用；记录启用此功能后的运行，文件链接可能失效。</p></div>
          <button className={button} disabled={downloads.busy || deleting} onClick={onClose} aria-label="关闭运行记录">关闭</button>
        </header>
        <div className="flex flex-wrap gap-2 p-4">
          <input className={field} aria-label="搜索应用或批次" placeholder="搜索应用或批次" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} />
          <select className={field} aria-label="筛选运行状态" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}>
            <option value="all">全部状态</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          {history.filterCard && <button className={button} onClick={() => { history.setFilterCard(null); setPage(0); }}>查看全部卡片</button>}
          <button className={button} onClick={selectPage}>选择本页</button>
          <button className={button} onClick={() => setSelected(new Set())}>清空选择</button>
        </div>
        {unsaved && <div role="alert" className="px-4 pb-3 text-sm text-amber-600">历史未保存，请勿关闭页面。<button className="ml-2 underline" onClick={() => void history.controller.retry()}>重试保存</button></div>}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          {loading && <p role="status">正在读取运行记录…</p>}
          {!loading && !filtered.length && <p className="py-12 text-center text-slate-500">暂无符合条件的运行记录</p>}
          {filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(run => {
            const state = runStatus(run, active);
            const outputs = historyOutputs([run]);
            return <article key={run.id} className="rounded-xl border border-slate-300 p-3 dark:border-slate-700">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="flex min-w-0 items-start gap-3">
                  <input type="checkbox" className="mt-1" aria-label={`选择 ${run.appName} ${run.id}`} disabled={active.has(run.id)} checked={selected.has(run.id)} onChange={() => toggle(run.id)} />
                  <span className="min-w-0"><strong className="break-words">{run.appName || run.appId}</strong>
                    <span className="ml-2 text-xs">{labels[state]}</span>
                    <span className="mt-1 block text-xs text-slate-500">{new Date(run.startedAt).toLocaleString()} · 成功 {run.units.filter(unit => unit.status === 'success').length}/{run.units.length} · {outputs.length} 个文件</span>
                    {run.batchName && <span className="block text-xs">批次：{run.batchName}</span>}
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className={button} disabled={downloads.busy} onClick={() => void downloads.chooseDirectory(run.cardId)} title={history.directories[run.cardId]?.name}>选择目录{history.directories[run.cardId] ? ' ✓' : ''}</button>
                  <button className={button} disabled={!ready(run) || downloads.busy} onClick={() => void downloads.download([run])}>下载本次 ZIP</button>
                </div>
              </div>
              {state === 'untracked' && <p className="mt-2 text-xs text-amber-600">未继续追踪，服务端状态待确认；可下载已记录的结果。</p>}
              {state === 'stopped' && <p className="mt-2 text-xs text-slate-500">已停止本地追踪，服务端任务可能仍在运行。</p>}
              <details className="mt-3 text-sm"><summary className="cursor-pointer">任务与文件明细</summary>
                <div className="mt-2 max-h-72 space-y-2 overflow-auto">
                  {run.units.map(unit => <div key={unit.index} className="rounded-lg bg-slate-100 p-2 dark:bg-slate-900">
                    <p className="break-all">任务 {unit.index + 1} · {unit.taskId || '尚无任务 ID'} · {unit.status === 'queued' ? '排队' : unit.status === 'running' ? '已提交' : labels[unit.status]}</p>
                    {unit.error && <p className="text-red-500">{unit.error}</p>}
                    {unit.usage && <p className="text-xs text-slate-500">RH 币 {unit.usage.coins} · 第三方 {unit.usage.thirdParty} · {unit.usage.taskTime}s</p>}
                    {unit.outputs.map((output, index) => <div key={index} className="mt-2 flex items-center justify-between gap-2">
                      <span>结果 {index + 1}{output.fileType ? ` (${output.fileType})` : ''}</span>
                      <button className={button} disabled={!ready(run) || downloads.busy} onClick={() => void downloads.download([run], [{ ...output }], true)}>下载文件</button>
                    </div>)}
                  </div>)}
                </div>
              </details>
            </article>;
          })}
        </div>
        <footer className="space-y-3 border-t border-slate-300 p-4 dark:border-slate-700">
          <div role="status" aria-live="polite" className="text-sm">{downloads.message || error}</div>
          {downloads.failed.length > 0 && <details className="text-sm text-amber-600"><summary>未下载的文件（{downloads.failed.length}）</summary>
            <ul className="max-h-24 overflow-auto">{downloads.failed.map((file, index) => <li key={index}>{file.archiveDirectory || '所选运行'} · 文件 {index + 1} {file.fileType || ''}</li>)}</ul>
            <button className={button} disabled={downloads.busy} onClick={() => void downloads.retry()}>重试失败文件</button>
          </details>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2"><button className={button} disabled={!downloadable.length || downloads.busy} onClick={() => void downloads.download(downloadable)}>合并下载 ZIP（{downloadable.length} 次）</button>
              <button className={button} disabled={!chosen.length || downloads.busy || deleting} onClick={() => void remove()}>删除选中记录</button>
              {downloads.busy && <button className={button} onClick={downloads.cancel}>取消下载</button>}</div>
            <div className="flex items-center gap-2 text-sm"><button className={button} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button>
              <span>{currentPage + 1}/{maxPage + 1} · {filtered.length} 条</span><button className={button} disabled={currentPage === maxPage} onClick={() => setPage(currentPage + 1)}>下一页</button></div>
          </div>
        </footer>
      </div>
    </div>, document.body);
}
