// Local-only layout regression fixture: no credentials, uploads or task submissions.
// Open /tests/fixtures/card-layout.html while Vite is running.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import MultiTaskCard from '../../components/multitask/MultiTaskCard';
import type { MultiTaskCardData } from '../../components/multitask/cardTypes';
import StepEditor from '../../components/StepEditor';

const dimensions = [[1440, 900], [1062, 900], [1024, 600], [390, 844]];
const noop = () => {};
const nodes = Array.from({ length: 12 }, (_, i) => ({
  nodeId: String(i), nodeName: `测试节点 ${i}`, fieldName: `参数 ${i + 1}`, fieldType: 'STRING' as const,
  fieldValue: '本地测试参数', description: `参数 ${i + 1}`,
}));
const states = ['success', 'failed', 'running', 'cancelled', 'idle', 'queued'] as const;
const makeCard = (status: typeof states[number], index: number): MultiTaskCardData => ({
  id: `fixture-${index}`, webappId: `测试卡片 ${index + 1}`, webAppInfo: null,
  nodes, isConnected: true, loading: false, loadError: null, instanceType: 'default',
  run: {
    mode: 'batch', status, totalUnits: 2, completedUnits: status === 'success' ? 2 : 0,
    failedUnits: status === 'failed' ? 2 : 0, activeUnits: 0, progressPercent: 100,
    progressText: `本地测试：${status}`, currentTaskId: null, taskIds: [],
    logs: Array.from({ length: 50 }, (_, i) => `[测试日志 ${i}] ` + '长日志内容 '.repeat(20)),
    outputs: status === 'success' ? [1, 2].map(i => ({fileUrl: `data:text/plain,local-result-${i}`, fileType: 'txt'})) : [],
    error: status === 'failed' ? '测试错误信息 '.repeat(30) : null,
    failedBatchIndices: new Set(), usage: { coins: 0, thirdParty: 0, taskTime: 0 },
  },
});

function Cases() {
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // Wait for the same runtime Tailwind stylesheet used by the app.
      const started = performance.now();
      while (performance.now() - started < 15000) {
        const region = document.querySelector<HTMLElement>('[role="region"]');
        if (region && getComputedStyle(region).overflowY === 'auto' && region.scrollHeight > region.clientHeight) break;
        await new Promise(r => setTimeout(r, 100));
      }
      if (cancelled) return;
      const errors: string[] = [];
      const check = (ok: boolean, message: string) => { if (!ok) errors.push(message); };
      const regions = [...document.querySelectorAll<HTMLElement>('[role="region"]')];
      check(regions.length === 6, '六种状态卡片均应渲染');
      for (const [i, region] of regions.entries()) {
        const card = region.parentElement!;
        const footer = card.lastElementChild as HTMLElement;
        const before = footer.getBoundingClientRect();
        check(region.scrollHeight > region.clientHeight && region.clientHeight > 40, `卡片 ${i}: 内容可滚动`);
        check(region.scrollWidth <= region.clientWidth + 1, `卡片 ${i}: 内容无横向溢出`);
        region.scrollTop = region.scrollHeight;
        const after = footer.getBoundingClientRect();
        check(region.scrollTop > 0, `卡片 ${i}: 滚动生效`);
        check(Math.abs(before.top - after.top) < 1, `卡片 ${i}: 底栏保持固定`);
        check(after.bottom <= card.getBoundingClientRect().bottom + 1, `卡片 ${i}: 底栏在卡片内`);
        const button = [...footer.querySelectorAll('button')].find(b => b.textContent?.includes('批量下载'))!;
        const rect = button.getBoundingClientRect();
        check(rect.left >= after.left && rect.right <= after.right + 1, `卡片 ${i}: 下载按钮无溢出`);
        check(region.querySelectorAll('textarea').length === 12, `卡片 ${i}: 参数完整`);
        if (i === 0) check(regions[1].scrollTop === 0, '两张卡片滚动互不影响');
        region.scrollTop = 0;
      }
      const first = regions[0];
      const previewButton = [...first.querySelectorAll('button')].find(b => b.textContent === '预览大图');
      previewButton?.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const closePreview = document.querySelector<HTMLButtonElement>('[aria-label="Close preview"]');
      check(closePreview?.closest('.fixed')?.parentElement === document.body, '结果弹窗不受卡片裁切');
      closePreview?.click();
      first.querySelector<HTMLButtonElement>('[aria-label="Next output"]')?.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      check(first.textContent?.includes('local-result-2') === true, '结果切换正常');
      const editor = document.querySelector<HTMLElement>('[data-editor-check] > div')!;
      check(getComputedStyle(editor).overflowY === 'hidden', '普通编辑器仍采用内部滚动');
      check([...editor.querySelectorAll('div')].some(el => getComputedStyle(el).overflowY === 'auto' && el.scrollHeight > el.clientHeight), '普通编辑器参数区可以滚动');
      window.parent.postMessage({ type: 'card-layout-result', size: `${innerWidth}×${innerHeight}`, errors }, location.origin);
    };
    void run().catch(error => window.parent.postMessage({ type: 'card-layout-result', size: `${innerWidth}×${innerHeight}`, errors: [String(error)] }, location.origin));
    return () => { cancelled = true; };
  }, []);
  return <>
    <main className="h-screen flex flex-col bg-slate-950 text-slate-100">
      <header className="h-14 shrink-0 p-4">卡片布局回归：模拟顶栏</header>
      <div className="shrink-0 p-4">多任务模式：固定底栏 + 独立滚动</div>
      <div className="min-h-0 flex-1 overflow-auto p-6 [container-type:size]">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {states.map((status, i) => <MultiTaskCard key={status} card={makeCard(status, i)} apiKeys={[]} editorRef={null}
            isBusy={status === 'running' || status === 'queued'} onRunOptionsChange={noop} onWebappIdChange={noop}
            onLoad={noop} onRemove={noop} onDuplicate={noop} onRun={noop} onCancel={noop} onInstanceTypeChange={noop}
            directory={null} onDirectoryChange={noop} onHistory={noop} />)}
        </div>
      </div>
      <footer className="h-7 shrink-0">模拟页脚</footer>
    </main>
    <div data-editor-check className="h-96">
      <StepEditor nodes={nodes} apiKeys={[]} isConnected runType="none" onBack={noop} onRun={noop} onCancel={noop} />
    </div>
  </>;
}

function Suite() {
  const [results, setResults] = useState<Record<string, string[]>>({});
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin === location.origin && event.data?.type === 'card-layout-result') {
        setResults(current => ({ ...current, [event.data.size]: event.data.errors }));
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  return <div className="p-4 bg-slate-950 text-white min-h-screen">
    <h1>卡片布局回归检查（本地模拟，不提交任务）</h1>
    {dimensions.map(([w, h]) => <div key={w}>
      <h2>{w}×{h}: {results[`${w}×${h}`] ? (results[`${w}×${h}`].length ? 'FAIL: ' + results[`${w}×${h}`].join('；') : 'PASS') : '检查中'}</h2>
      <iframe title={`${w}×${h} 布局`} src="?case=1" width={w} height={h} style={{ maxWidth: 'none', boxSizing: 'content-box', border: '1px solid #475569' }} />
    </div>)}
  </div>;
}
document.documentElement.classList.add('dark');
createRoot(document.getElementById('root')!).render(location.search ? <Cases /> : <Suite />);
