import { RunRecord, UnitEvent, updateUnit, stopRun } from './model';
import { HistoryStorage, createHistoryStorage } from './storage';

export class RunHistoryController {
  private records = new Map<string, RunRecord>();
  private dirty = new Set<string>();
  private listeners = new Set<() => void>();
  private pending: Promise<void> = Promise.resolve();
  private active = new Set<string>();
  private deleted = new Set<string>();
  private loadError = false;
  private snapshot = { records: [] as RunRecord[], active: new Set<string>(), unsaved: false, loading: true };
  private foreignActive = new Set<string>();
  readonly owner = crypto.randomUUID();
  constructor(private storage: HistoryStorage = createHistoryStorage()) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private publish(loading = this.snapshot.loading) {
    this.snapshot = { records: [...this.records.values()].sort((a, b) => b.startedAt - a.startedAt),
      active: new Set([...this.active, ...this.foreignActive]), unsaved: this.loadError || this.dirty.size > 0, loading };
    this.listeners.forEach(listener => listener());
  }
  claimOwnership(): () => void {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    if (typeof navigator !== 'undefined' && navigator.locks) {
      void navigator.locks.request(`rh-history-${this.owner}`, () => held).catch(() => {});
    }
    return release;
  }
  private async refreshOwners() {
    const locks = typeof navigator !== 'undefined' && navigator.locks ? await navigator.locks.query() : null;
    const owners = new Set(locks?.held?.map(lock => lock.name));
    this.foreignActive = new Set([...this.records.values()].filter(run => !run.endedAt && run.owner !== this.owner
      && (!locks || owners.has(`rh-history-${run.owner}`))).map(run => run.id));
  }
  async load() {
    try {
      const records = await this.storage.list();
      const storedIds = new Set(records.map(run => run.id));
      this.records.forEach((_, id) => {
        if (!storedIds.has(id) && !this.active.has(id) && !this.dirty.has(id)) this.records.delete(id);
      });
      // Loading can overlap enqueue/completion: local mutations always win.
      records.forEach(run => { if (!this.active.has(run.id) && !this.dirty.has(run.id) && !this.deleted.has(run.id)) this.records.set(run.id, run); });
      await this.refreshOwners();
      this.loadError = false;
    } catch { this.loadError = true; }
    this.publish(false);
  }
  private save(run: RunRecord) {
    this.records.set(run.id, run);
    this.dirty.add(run.id);
    this.publish();
    this.pending = this.pending.then(async () => {
      if (this.deleted.has(run.id)) return;
      try {
        await this.storage.put(run);
        if (this.records.get(run.id) === run) this.dirty.delete(run.id);
      } catch { /* Keep the latest snapshot in memory; retry is explicit in the UI. */ }
      this.publish();
    });
  }
  start(input: Pick<RunRecord, 'cardId' | 'appId' | 'appName' | 'batchName'>, total: number): string {
    const id = crypto.randomUUID();
    this.active.add(id);
    this.save({ ...input, version: 1, id, owner: this.owner, startedAt: Date.now(),
      units: Array.from({ length: total }, (_, index) => ({ index, status: 'queued', outputs: [] })) });
    return id;
  }
  event(id: string, index: number, event: UnitEvent) {
    const run = this.records.get(id);
    if (!run || !this.active.has(id)) return;
    const next = updateUnit(run, index, event);
    if (next === run) return;
    if (next.endedAt) this.active.delete(id);
    this.save(next);
  }
  stopCard(cardId: string) {
    this.records.forEach(run => {
      if (run.cardId === cardId && this.active.has(run.id)) {
        this.active.delete(run.id);
        this.save(stopRun(run));
      }
    });
  }
  stopAll() { [...this.active].forEach(id => this.stopCard(this.records.get(id)!.cardId)); }
  async retry() {
    await this.load();
    [...this.dirty].forEach(id => { const run = this.records.get(id); if (run) this.save(run); });
    await this.pending;
  }
  async remove(ids: string[]) {
    await this.refreshOwners();
    const safe = ids.filter(id => this.records.has(id) && !this.active.has(id) && !this.foreignActive.has(id));
    await this.pending;
    await this.storage.remove(safe);
    safe.forEach(id => { this.deleted.add(id); this.records.delete(id); this.dirty.delete(id); });
    this.publish();
  }
  flush() { return this.pending; }
}
