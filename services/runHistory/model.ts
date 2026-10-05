import type { TaskOutput } from '../../types';

export type UnitStatus = 'queued' | 'running' | 'success' | 'failed' | 'stopped';
export interface RunUnitRecord {
  index: number;
  status: UnitStatus;
  taskId?: string;
  outputs: TaskOutput[];
  error?: string;
  usage?: { coins: number; thirdParty: number; taskTime: number };
}
export interface RunRecord {
  version: 1;
  id: string;
  owner: string;
  cardId: string;
  appId: string;
  appName: string;
  batchName: string;
  startedAt: number;
  endedAt?: number;
  units: RunUnitRecord[];
}
export type RunStatus = 'running' | 'success' | 'failed' | 'stopped' | 'untracked';
export function runStatus(run: RunRecord, active: ReadonlySet<string>): RunStatus {
  if (!run.endedAt) return active.has(run.id) ? 'running' : 'untracked';
  if (run.units.some(unit => unit.status === 'stopped')) return 'stopped';
  return run.units.some(unit => unit.status === 'failed') ? 'failed' : 'success';
}
export type UnitEvent =
  | { type: 'submitted'; taskId: string }
  | { type: 'success'; taskId: string; outputs: TaskOutput[]; usage?: RunUnitRecord['usage'] }
  | { type: 'failed'; error: string };

export function safeError(error: unknown): string {
  // Never persist server messages: they may contain prompts, credentials or signed URLs.
  const value = error instanceof Error ? error.message : String(error);
  const code = ['NOT_ENOUGH_BALANCE', 'WEBAPP_NOT_EXISTS', 'TASK_TIMEOUT', 'API_KEY_INVALID']
    .find(code => value === code);
  return code || '任务执行失败，请查看当前运行日志或使用任务 ID 排查';
}
export function updateUnit(run: RunRecord, index: number, event: UnitEvent, now = Date.now()): RunRecord {
  const current = run.units[index];
  if (run.endedAt || !current || ['success', 'failed', 'stopped'].includes(current.status)) return run;
  const unit: RunUnitRecord = event.type === 'submitted'
    ? { ...current, status: 'running', taskId: event.taskId }
    : event.type === 'success'
      ? { ...current, status: 'success', taskId: event.taskId, outputs: cleanOutputs(event.outputs), usage: event.usage }
      : { ...current, status: 'failed', error: safeError(event.error) };
  const units = run.units.map((old, i) => i === index ? unit : old);
  return { ...run, units, endedAt: units.every(u => ['success', 'failed'].includes(u.status)) ? now : undefined };
}
export function stopRun(run: RunRecord, now = Date.now()): RunRecord {
  if (run.endedAt) return run;
  return { ...run, endedAt: now, units: run.units.map(unit =>
    ['queued', 'running'].includes(unit.status) ? { ...unit, status: 'stopped' } : unit) };
}
const httpUrl = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? value : ''; }
  catch { return ''; }
};
export function cleanOutputs(outputs: TaskOutput[]): TaskOutput[] {
  return outputs.map(output => ({ fileUrl: httpUrl(output.fileUrl), downloadUrl: httpUrl(output.downloadUrl),
    fileType: typeof output.fileType === 'string' ? output.fileType.slice(0, 80) : undefined }))
    .filter(output => output.fileUrl || output.downloadUrl);
}
/** Versioned, explicit conversion at the persistence boundary; unknown fields are discarded. */
export function decodeRun(value: unknown): RunRecord | null {
  const r = value as RunRecord;
  if (!r || r.version !== 1 || !['id', 'owner', 'cardId', 'appId', 'appName', 'batchName'].every(key => typeof r[key] === 'string')
    || !Number.isFinite(r.startedAt) || (r.endedAt !== undefined && !Number.isFinite(r.endedAt))
    || !Array.isArray(r.units) || !r.units.length) return null;
  const units: RunUnitRecord[] = [];
  for (const [index, u] of r.units.entries()) {
    if (!u || u.index !== index || !['queued', 'running', 'success', 'failed', 'stopped'].includes(u.status)
      || !Array.isArray(u.outputs) || u.outputs.some(output => !output || typeof output !== 'object')) return null;
    units.push({ index, status: u.status, taskId: typeof u.taskId === 'string' ? u.taskId : undefined,
      outputs: cleanOutputs(u.outputs), error: u.error ? safeError(u.error) : undefined,
      usage: u.usage && ['coins', 'thirdParty', 'taskTime'].every(key => Number.isFinite(u.usage[key]))
        ? { coins: u.usage.coins, thirdParty: u.usage.thirdParty, taskTime: u.usage.taskTime } : undefined });
  }
  return { version: 1, id: r.id, owner: r.owner, cardId: r.cardId, appId: r.appId,
    appName: r.appName, batchName: r.batchName, startedAt: r.startedAt, endedAt: r.endedAt, units };
}
