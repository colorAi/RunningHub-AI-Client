import {
  decodeGroup,
  decodeSavedCard,
  importDrafts,
  normalizeOrganization,
  type CardGroup,
  type CardOrganization,
  type LibraryData,
  type SavedCard,
} from "./model";

export function createCardLibraryStorage(name = "rh_card_library_v1") {
  let opening: Promise<IDBDatabase> | undefined;
  const open = () =>
    (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        for (const store of ["cards", "groups", "meta"])
          request.result.createObjectStore(store, { keyPath: "id" });
      };
      request.onerror = request.onblocked = () => {
        opening = undefined;
        reject(new Error("卡片库存储暂不可用，请重试"));
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          opening = undefined;
        };
        resolve(request.result);
      };
    }));
  async function transaction<T>(
    mode: IDBTransactionMode,
    work: (
      tx: IDBTransaction,
      done: (value: T) => void,
      fail: (message: string) => void,
    ) => void,
  ): Promise<T> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["cards", "groups", "meta"], mode);
      let result: T;
      let error = "";
      const fail = (message: string) => {
        error = message;
        tx.abort();
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(new Error(error || "卡片库保存失败，请检查存储空间后重试"));
      tx.onerror = () => {
        /* onabort reports the transaction failure once. */
      };
      try {
        work(
          tx,
          (value) => {
            result = value;
          },
          fail,
        );
      } catch {
        fail("卡片库操作失败，请重试");
      }
    });
  }
  return {
    async load(readDrafts: () => unknown): Promise<LibraryData> {
      // The migration marker and all imported records share one transaction across tabs.
      await transaction<void>("readwrite", (tx, done, fail) => {
        const meta = tx.objectStore("meta");
        meta.get("draft-import-v1").onsuccess = (event) => {
          if ((event.target as IDBRequest).result) {
            done();
            return;
          }
          try {
            const imported = importDrafts(readDrafts());
            imported.groups.forEach((group) =>
              tx.objectStore("groups").put(group),
            );
            imported.cards.forEach((card) => tx.objectStore("cards").put(card));
            meta.put({ id: "draft-import-v1", completed: true });
            done();
          } catch {
            fail("旧草稿读取失败，已保留原数据，请重试");
          }
        };
      });
      return transaction<LibraryData>("readonly", (tx, done) => {
        let cards: SavedCard[] = [];
        let groups: CardGroup[] = [];
        let count = 0;
        const finish = () => {
          if (++count === 2) done({ cards, groups });
        };
        tx.objectStore("cards").getAll().onsuccess = (event) => {
          cards = (event.target as IDBRequest).result
            .map(decodeSavedCard)
            .filter(Boolean);
          finish();
        };
        tx.objectStore("groups").getAll().onsuccess = (event) => {
          groups = (event.target as IDBRequest).result
            .map(decodeGroup)
            .filter(Boolean);
          finish();
        };
      });
    },
    save(card: SavedCard, update: boolean) {
      return transaction<void>("readwrite", (tx, done, fail) => {
        const decoded = decodeSavedCard(card);
        if (!decoded) {
          fail("卡片配置无效");
          return;
        }
        const store = tx.objectStore("cards");
        store.get(card.id).onsuccess = (event) => {
          const existing = (event.target as IDBRequest).result;
          if (update && !existing) {
            fail("原卡片已被删除，请另存为新卡片");
            return;
          }
          tx.objectStore("groups").getAllKeys().onsuccess = (groupEvent) => {
            const ids = new Set((groupEvent.target as IDBRequest).result);
            decoded.organization.groupIds =
              decoded.organization.groupIds.filter((id) => ids.has(id));
            store.put(decoded);
            done();
          };
        };
      });
    },
    editOrganization(id: string, organization: CardOrganization) {
      return transaction<void>("readwrite", (tx, done, fail) => {
        const store = tx.objectStore("cards");
        store.get(id).onsuccess = (event) => {
          const card = decodeSavedCard((event.target as IDBRequest).result);
          if (!card) {
            fail("卡片已被删除，请刷新后重试");
            return;
          }
          tx.objectStore("groups").getAllKeys().onsuccess = (groupEvent) => {
            const groups = new Set((groupEvent.target as IDBRequest).result);
            const next = normalizeOrganization(organization);
            next.groupIds = next.groupIds.filter((group) => groups.has(group));
            store.put({ ...card, organization: next, updatedAt: Date.now() });
            done();
          };
        };
      });
    },
    removeCard(id: string) {
      return transaction<void>("readwrite", (tx, done) => {
        tx.objectStore("cards").delete(id);
        done();
      });
    },
    saveGroup(group: CardGroup, update = false) {
      return transaction<void>("readwrite", (tx, done, fail) => {
        const decoded = decodeGroup(group);
        if (!decoded) {
          fail("请输入分组名称");
          return;
        }
        const store = tx.objectStore("groups");
        store.getAll().onsuccess = (event) => {
          const groups: CardGroup[] = (event.target as IDBRequest).result
            .map(decodeGroup)
            .filter(Boolean);
          if (update && !groups.some((item) => item.id === group.id)) {
            fail("分组已被删除");
            return;
          }
          if (
            groups.some(
              (item) =>
                item.id !== group.id &&
                item.name.toLocaleLowerCase() ===
                  decoded.name.toLocaleLowerCase(),
            )
          ) {
            fail("分组名称已存在");
            return;
          }
          store.put(decoded);
          done();
        };
      });
    },
    removeGroup(id: string) {
      return transaction<void>("readwrite", (tx, done) => {
        tx.objectStore("groups").delete(id);
        const store = tx.objectStore("cards");
        store.getAll().onsuccess = (event) => {
          for (const raw of (event.target as IDBRequest).result) {
            const card = decodeSavedCard(raw);
            if (card?.organization.groupIds.includes(id))
              store.put({
                ...card,
                organization: {
                  ...card.organization,
                  groupIds: card.organization.groupIds.filter(
                    (group) => group !== id,
                  ),
                },
              });
          }
          done();
        };
      });
    },
  };
}
