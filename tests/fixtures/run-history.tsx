import React, { useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { unzipSync } from 'fflate';
import RunHistoryPanel from '../../components/multitask/history/RunHistoryPanel';
import { RunHistoryController } from '../../services/runHistory/controller';
import { createHistoryStorage } from '../../services/runHistory/storage';
import { DirectoryHandle } from '../../services/fileSystem';

const report = document.getElementById('report')!;
function check(condition: unknown, description: string) {
  if (!condition) throw new Error(description);
  report.textContent += `PASS ${description}\n`;
}
async function until(condition: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error('等待界面更新超时');
}
const db = createHistoryStorage(`rh_history_fixture_${crypto.randomUUID()}`);
const controller = new RunHistoryController(db);
const release = controller.claimOwnership();
const input = { cardId: 'card-a', appId: 'fixture-app', appName: '测试应用', batchName: '' };
const output = { fileUrl: 'https://history-fixture.test/result.txt', fileType: 'txt' };
let pickerCount = 0;
let cancelNext = false;
let permission: PermissionState = 'granted';
const written: { name: string; blob: Blob }[] = [];
const directory = {
  kind: 'directory', name: '测试目录', requestPermission: async () => permission,
  getFileHandle: async (name: string) => ({ createWritable: async () => ({
    write: async (blob: Blob) => { written.push({ name, blob }); }, close: async () => {},
  }) }),
} as unknown as FileSystemDirectoryHandle;
window.showDirectoryPicker = async () => {
  pickerCount++;
  if (cancelNext) { cancelNext = false; throw new DOMException('cancel', 'AbortError'); }
  return directory;
};
const realFetch = window.fetch.bind(window);
window.fetch = async (url, options) => String(url).startsWith('https://history-fixture.test/')
  ? new Response('fixture text', { headers: { 'content-type': 'text/plain' } }) : realFetch(url, options);
let setFilter: (value: string | null) => void;
function Harness() {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [directories, setDirectories] = useState<Record<string, DirectoryHandle>>({});
  const [filterCard, setFilterCard] = useState<string | null>(null);
  setFilter = setFilterCard;
  return <RunHistoryPanel history={{ controller, snapshot, directories, filterCard,
    setFilterCard, setDirectory: (id, dir) => setDirectories(old => ({ ...old, [id]: dir })) }} onClose={() => {}} />;
}
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('button')];
const button = (text: string) => buttons().find(button => button.textContent === text)!;
function click(text: string) { const target = button(text); if (!target || target.disabled) throw Error(`按钮不可用 ${text}`); target.click(); }
function setSearch(text: string) {
  const element = document.querySelector<HTMLInputElement>('input[placeholder="搜索应用或批次"]')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, text);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}
async function run() {
  for (let i = 0; i < 12; i++) {
    const id = controller.start({ ...input, cardId: i % 2 ? 'card-b' : 'card-a', appName: `测试应用 ${i}` }, 2);
    controller.event(id, 1, { type: 'success', taskId: `${i}-2`, outputs: [output] });
    if (i === 0) controller.stopCard('card-a');
    else controller.event(id, 0, { type: 'success', taskId: `${i}-1`, outputs: [output] });
  }
  await controller.flush();
  const restored = new RunHistoryController(db);
  await restored.load();
  check(restored.getSnapshot().records.length === 12, 'IndexedDB reload preserves twelve historical runs');
  check(restored.getSnapshot().records.some(run => run.units[0].status === 'stopped' && run.units[1].outputs.length === 1), 'stopped history retains partial outputs');
  const running = controller.start({ ...input, appName: '运行中测试' }, 1); await controller.flush();
  await restored.load();
  check(restored.getSnapshot().active.has(running), 'another controller protects runs owned by a live tab lock');
  await restored.remove([running]); check((await db.list()).some(run => run.id === running), 'active run cannot be deleted from another controller');
  controller.stopCard('card-a'); await controller.flush();
  await controller.load();
  createRoot(document.getElementById('root')!).render(<Harness />);
  await until(() => document.querySelectorAll('article').length === 10);
  check(document.querySelectorAll('article').length === 10, 'list paginates to ten records');
  const statusFilter = document.querySelector<HTMLSelectElement>('select[aria-label="筛选运行状态"]')!;
  statusFilter.value = 'stopped'; statusFilter.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => document.querySelectorAll('article').length === 1);
  check(document.querySelector('article')?.textContent?.includes('已停止追踪') === true, 'status filter isolates stopped records');
  statusFilter.value = 'all'; statusFilter.dispatchEvent(new Event('change', { bubbles: true }));
  click('下一页'); await until(() => document.querySelectorAll('article').length === 3);
  check(true, 'next page contains remaining records'); click('上一页');
  setSearch('测试应用 1'); await until(() => document.querySelectorAll('article').length === 3);
  check(true, 'search narrows the list'); setSearch('');
  setFilter('card-b'); await until(() => document.querySelectorAll('article').length === 6);
  check(true, 'card history filters independently of current card existence');
  const zipButton = () => buttons().find(button => button.textContent === '下载本次 ZIP' && !button.disabled)!;
  zipButton().click(); await until(() => written.length === 1 && !zipButton().disabled);
  check(pickerCount === 1, 'first historical download chooses a directory');
  const entries = Object.keys(unzipSync(new Uint8Array(await written[0].blob.arrayBuffer())));
  check(entries.length === 2 && entries.every(name => name.includes('/')), 'ZIP contains unique files inside its run folder');
  zipButton().click(); await until(() => written.length === 2 && !zipButton().disabled);
  check(pickerCount === 1, 'same-card download reuses the directory');
  click('选择本页'); await until(() => !!button('合并下载 ZIP（6 次）'));
  click('合并下载 ZIP（6 次）'); await until(() => written.length === 3 && !button('合并下载 ZIP（6 次）').disabled);
  check(pickerCount === 1, 'same-card multi-run ZIP reuses card directory');
  click('清空选择'); click('查看全部卡片');
  await until(() => document.querySelectorAll('article').length === 10);
  click('选择本页'); await until(() => buttons().some(b => b.textContent?.startsWith('合并下载 ZIP（') && !b.disabled));
  buttons().find(b => b.textContent?.startsWith('合并下载 ZIP（'))!.click();
  await until(() => written.length === 4 && !buttons().find(b => b.textContent?.startsWith('合并下载 ZIP（'))!.disabled);
  check(pickerCount === 2, 'cross-card multi-run download asks for its own directory');
  const grouped = Object.keys(unzipSync(new Uint8Array(await written[3].blob.arrayBuffer())));
  check(new Set(grouped.map(path => path.split('/')[0])).size > 1, 'merged ZIP separates historical runs');
  cancelNext = true;
  buttons().find(b => b.textContent?.startsWith('合并下载 ZIP（'))!.click();
  await until(() => document.body.textContent!.includes('已取消选择目录'));
  check(written.length === 4, 'cancelled picker writes nothing');
  permission = 'denied'; setFilter('card-b');
  await until(() => document.querySelectorAll('article').length === 6);
  zipButton().click(); await until(() => document.body.textContent!.includes('下载或保存失败'));
  check(written.length === 4, 'revoked directory permission prevents writes');
  permission = 'granted';
  click('重试失败文件'); await until(() => written.length === 5 && !zipButton().disabled);
  check(true, 'failed download retry succeeds after permission restoration');
  const summary = document.querySelector('article summary') as HTMLElement; summary.click();
  buttons().find(b => b.textContent === '下载文件' && !b.disabled)!.click();
  await until(() => written.length === 6 && !zipButton().disabled);
  check(await written[5].blob.text() === 'fixture text' && !written[5].name.endsWith('.zip'), 'individual historical file downloads without ZIP');
  document.title = 'ALL PASS — history fixture';
  report.textContent = 'ALL PASS — history fixture complete\n' + report.textContent;
}
run().catch(error => { document.title = `FAIL ${error.message}`; report.textContent = `FAIL ${error.message}\n` + report.textContent; }).finally(release);
