import { decodeRun, RunRecord } from './model';

export interface HistoryStorage {
  list(): Promise<RunRecord[]>;
  put(run: RunRecord): Promise<void>;
  remove(ids: string[]): Promise<void>;
}
// Separate from ordinary history and directory handles. Never store API configuration here.
export function createHistoryStorage(name = 'rh_multitask_runs_v1'): HistoryStorage {
  let opening: Promise<IDBDatabase> | undefined;
  const open = () => opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('runs', { keyPath: 'id' });
    request.onerror = () => { opening = undefined; reject(new Error('无法打开历史存储')); };
    request.onblocked = () => { opening = undefined; reject(new Error('历史存储被其他窗口占用')); };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); opening = undefined; };
      resolve(request.result);
    };
  });
  async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('runs', mode);
      const request = work(tx.objectStore('runs'));
      tx.oncomplete = () => resolve(request ? request.result : undefined as T);
      tx.onabort = tx.onerror = () => reject(new Error('历史存储操作失败'));
    });
  }
  return {
    list: async () => (await transaction<unknown[]>('readonly', store => store.getAll())).map(decodeRun).filter(Boolean),
    put: async run => { await transaction('readwrite', store => store.put(run)); },
    remove: async ids => { await transaction('readwrite', store => { ids.forEach(id => store.delete(id)); }); },
  };
}
