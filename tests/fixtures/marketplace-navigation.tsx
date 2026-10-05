// Run only on a separate Vite origin: npx vite --host 127.0.0.1 --port 5184 --strictPort
import React, { StrictMode, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../services/i18n';
import { useMultiTaskWorkspace } from '../../components/multitask/useMultiTaskWorkspace';
import { useRequestedCards } from '../../components/multitask/useRequestedCards';
import { useTaskCardRequests, TaskCardRequest } from '../../hooks/useTaskCardRequests';

const report = document.getElementById('report')!;
function check(condition: unknown, description: string) {
  if (!condition) throw Error(description);
  report.textContent += `PASS ${description}\n`;
}
async function until(condition: () => boolean, label: string) {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw Error(`timeout: ${label}`);
}
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const nodeData = (id: string) => ({ code: 0, data: { webappName: `测试应用 ${id}`, nodeInfoList: [
  { nodeId: '1', nodeName: '输入', fieldName: 'prompt', fieldValue: '测试参数', fieldType: 'STRING' },
] } });
const calls: string[] = [];
let submissions = 0;
let failApp = '';
const pending = new Map<string, (response: Response) => void>();
const delayed = new Set<string>();
const keys = [{ id: 'test', apiKey: 'fixture-consumer-key', concurrency: 1 }];
let workspace: ReturnType<typeof useMultiTaskWorkspace>;
let enqueue: (id: string) => boolean;
let setKeys: React.Dispatch<React.SetStateAction<typeof keys>>;
const initialRequests: TaskCardRequest[] = [
  { requestId: 'initial-one', webappId: '501' }, { requestId: 'initial-two', webappId: '501' },
];
function HookCases() {
  const [apiKeys, updateKeys] = useState(keys);
  const [initial, setInitial] = useState(initialRequests);
  const queue = useTaskCardRequests();
  const w = useMultiTaskWorkspace(apiKeys);
  workspace = w; enqueue = queue.enqueue; setKeys = updateKeys;
  const acknowledge = useCallback((ids: string[]) => {
    setInitial(old => old.filter(request => !ids.includes(request.requestId)));
    queue.acknowledge(ids);
  }, [queue.acknowledge]);
  const ref = useRequestedCards([...initial, ...queue.requests], acknowledge, w, true);
  return <div ref={ref}>{w.cards.map(card => <div key={card.id} data-task-card-id={card.id}>{card.webappId}</div>)}</div>;
}
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('button')];
function click(text: string) {
  const target = buttons().find(button => button.textContent?.trim() === text && !button.disabled);
  if (!target) throw Error(`missing button: ${text}`);
  target.click();
}
async function run() {
  if (location.port !== '5184') throw Error('Use isolated fixture origin on port 5184');
  for (const [key, value] of Object.entries({ rh_terms_agreed: 'true', rh_startup_view: 'home', rh_home_default_tab: 'official',
    rh_runninghub_region_mode: 'cn', rh_api_keys_v2: JSON.stringify(keys), rh_enterprise_api_v1: JSON.stringify({ id: 'enterprise', apiKey: 'fixture-enterprise-key', concurrency: 1 }),
    rh_favorites: '[]', rh_recent_apps: '[]', rh_multitask_drafts_v1: '[]', rh_autosave_config: '{}', rh_refresh_store_startup: 'true',
  })) localStorage.setItem(key, value);
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.origin === location.origin) return realFetch(input, init);
    if (url.pathname.endsWith('/webapp/list')) return json({ code: 0, data: { total: 2, records: [
      { id: '101', name: '商城应用一', intro: '', covers: [] }, { id: '102', name: '商城应用二', intro: '', covers: [] },
    ] } });
    if (url.pathname.endsWith('/apiCallDemo')) {
      const id = url.searchParams.get('webappId')!;
      check(url.searchParams.get('apiKey') === 'fixture-consumer-key', 'loads with consumer API');
      calls.push(id);
      if (delayed.has(id)) return new Promise(resolve => pending.set(id, resolve));
      if (failApp === id) return json({ code: 1, msg: '模拟加载失败' });
      return json(nodeData(id));
    }
    if (/\/run$/.test(url.pathname)) submissions++;
    throw Error(`unexpected external endpoint: ${url.pathname}`);
  };
  const { default: App } = await import('../../App');
  let root = createRoot(document.getElementById('root')!);
  root.render(<LanguageProvider><App /></LanguageProvider>);
  await until(() => buttons().some(b => b.textContent?.trim() === '立即使用'), 'store loads');
  click('立即使用');
  await until(() => document.querySelectorAll('[data-task-card-id]').length === 2 && document.body.textContent!.includes('测试应用 101'), 'card loaded');
  check(document.querySelector('[data-task-card-id]')!.parentElement!.parentElement!.getBoundingClientRect().height > 0, 'multitask visible after store selection');
  check([...document.querySelectorAll<HTMLInputElement>('[data-task-card-id] input')].some(input => input.value === '101'), 'new card has selected app ID');
  click('首页'); await until(() => buttons().some(b => b.textContent?.trim() === '立即使用'), 'return home');
  click('立即使用');
  await until(() => document.querySelectorAll('[data-task-card-id]').length === 3 && calls.length === 2, 'same app creates another card');
  check(true, 'same app selection always adds a new card');
  click('首页'); await until(() => buttons().filter(b => b.textContent?.trim() === '立即使用').length === 2, 'store again');
  buttons().filter(b => b.textContent?.trim() === '立即使用')[1].click();
  await until(() => document.body.textContent!.includes('测试应用 102'), 'different app loaded');
  check(document.querySelectorAll('[data-task-card-id]').length === 4, 'different app preserves existing cards');
  const newest = [...document.querySelectorAll<HTMLElement>('[data-task-card-id]')].at(-1)!;
  const bounds = newest.getBoundingClientRect();
  const viewport = newest.parentElement!.parentElement!.getBoundingClientRect();
  check(bounds.bottom > viewport.top && bounds.top < viewport.bottom, 'new card is scrolled into view');
  click('首页'); click('多任务模式');
  await until(() => document.querySelectorAll('[data-task-card-id]').length === 4, 'switch back');
  check(submissions === 0, 'navigation and loading submit no paid tasks');
  root.unmount();
  root = createRoot(document.getElementById('root')!);
  const before = calls.length;
  root.render(<StrictMode><HookCases /></StrictMode>);
  await until(() => workspace?.cards.filter(card => card.isConnected).length === 2, 'pending mount requests');
  check(workspace.cards.length === 3 && calls.length === before + 2, 'StrictMode consumes pending requests exactly once');
  workspace.updateCard('initial-one', card => ({ ...card, run: { ...card.run, status: 'running' } }));
  enqueue('601'); enqueue('602');
  await until(() => workspace.cards.filter(card => card.isConnected).length === 4, 'batched intents');
  check(workspace.cards.length === 5, 'two selections in one render are both retained');
  check(workspace.cards.find(card => card.id === 'initial-one')?.run.status === 'running', 'creating cards preserves existing run state');
  failApp = '701'; enqueue('701');
  await until(() => !!workspace.cards.find(card => card.webappId === '701')?.loadError, 'load failure');
  const failedId = workspace.cards.find(card => card.webappId === '701')!.id;
  check(true, 'failed load keeps card and ID');
  failApp = ''; await workspace.handleLoadCard(failedId);
  await until(() => !!workspace.cards.find(card => card.id === failedId)?.isConnected, 'retry');
  check(true, 'manual retry loads existing failed card');
  delayed.add('801'); enqueue('801'); await until(() => pending.has('801'), 'delayed load');
  const editedId = workspace.cards.find(card => card.webappId === '801')!.id;
  workspace.handleWebappIdChange(editedId, '802'); pending.get('801')!(json(nodeData('801')));
  await until(() => workspace.cards.find(card => card.id === editedId)?.webappId === '802', 'edited card');
  await new Promise(resolve => setTimeout(resolve, 60));
  check(!workspace.cards.find(card => card.id === editedId)!.isConnected, 'stale response cannot replace edited ID');
  delayed.add('901'); enqueue('901'); await until(() => pending.has('901'), 'delete during load');
  workspace.handleRemoveCard(workspace.cards.find(card => card.webappId === '901')!.id);
  pending.get('901')!(json(nodeData('901')));
  await until(() => !workspace.cards.some(card => card.webappId === '901'), 'removed card');
  check(true, 'late response does not restore deleted card');
  setKeys([]); await until(() => workspace.validApiKeys.length === 0, 'missing key');
  const beforeNoKey = calls.length; enqueue('1001');
  await until(() => !!workspace.cards.find(card => card.webappId === '1001')?.loadError, 'missing key feedback');
  check(calls.length === beforeNoKey, 'missing API creates card without issuing request');
  check(submissions === 0, 'all cases avoid task submission');
  document.title = 'ALL PASS — marketplace navigation';
  report.textContent = 'ALL PASS — marketplace navigation\n' + report.textContent;
}
run().catch(error => { document.title = `FAIL — ${error.message}`; report.textContent = `FAIL ${error.message}\n` + report.textContent; });
