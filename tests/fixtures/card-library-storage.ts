import { createCardLibraryStorage } from "../../services/cardLibrary/storage";
export async function storageCases(
  oldDrafts: unknown,
  check: (ok: unknown, text: string) => void,
) {
  const dbName = `fixture-library-${crypto.randomUUID()}`;
  const one = createCardLibraryStorage(dbName);
  const two = createCardLibraryStorage(dbName);
  let imports = 0;
  await Promise.all([
    one.load(() => {
      imports++;
      return oldDrafts;
    }),
    two.load(() => {
      imports++;
      return oldDrafts;
    }),
  ]);
  const read = () =>
    one.load(() => {
      throw Error("migration repeated");
    });
  let data = await read();
  check(
    imports === 1 && data.cards.length === 2,
    "concurrent first import is atomic and idempotent",
  );
  await one.saveGroup({ id: "g2", name: "第二组" });
  const original = data.cards[0];
  await one.editOrganization(original.id, {
    title: "语音模板",
    groupIds: ["draft:fixture-draft", "g2"],
    tags: ["字幕", "识别"],
  });
  await two.saveGroup({ id: "g2", name: "新组名" }, true);
  data = await read();
  check(
    data.cards.find((c) => c.id === original.id)!.organization.groupIds
      .length === 2 && data.groups.some((g) => g.name === "新组名"),
    "multi-group membership and shared group rename persist",
  );
  await one.removeGroup("g2");
  data = await read();
  check(
    data.cards.length === 2 &&
      data.cards.every((c) => !c.organization.groupIds.includes("g2")),
    "group deletion detaches cards atomically without deleting cards",
  );
  let failed = false;
  try {
    await one.saveGroup({ id: "duplicate", name: "旧草稿组" });
  } catch {
    failed = true;
  }
  check(
    failed && (await read()).groups.length === 1,
    "failed write leaves existing data intact",
  );
  await one.removeCard(original.id);
  failed = false;
  try {
    await two.save(original, true);
  } catch {
    failed = true;
  }
  check(
    failed && (await read()).cards.length === 1,
    "stale update cannot resurrect a deleted template",
  );
  const bad = createCardLibraryStorage(`fixture-bad-${crypto.randomUUID()}`);
  failed = false;
  try {
    await bad.load(() => {
      throw Error("corrupt draft");
    });
  } catch {
    failed = true;
  }
  check(
    failed && (await bad.load(() => oldDrafts)).cards.length === 2,
    "failed migration can retry without losing legacy data",
  );
}
