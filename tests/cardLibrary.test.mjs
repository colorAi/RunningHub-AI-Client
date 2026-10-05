import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
const dir = await mkdtemp(join(tmpdir(), "rh-card-library-"));
const outfile = join(dir, "model.mjs");
await build({
  stdin: {
    contents:
      "export * from './services/cardLibrary/model'; export { createCard } from './components/multitask/workspaceModel';",
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
});
const {
  captureConfiguration,
  decodeSavedCard,
  normalizeOrganization,
  importDrafts,
  matchesCard,
  safeCover,
  createCard,
} = await import(pathToFileURL(outfile));
after(() => rm(dir, { recursive: true, force: true }));
const node = {
  nodeId: "1",
  nodeName: "输入",
  fieldName: "prompt",
  fieldType: "STRING",
  fieldValue: "hello",
  fieldData: { options: ["x", "y"] },
};
const card = {
  webappId: "123",
  webAppInfo: {
    webappName: "应用",
    description: "",
    covers: [
      {
        thumbnailUri: "javascript:alert(1)",
        uri: "https://example.test/cover.jpg",
      },
    ],
  },
  runOptions: { retainSeconds: 60, accessPassword: "secret" },
  apiKey: "secret",
};
const snapshot = () => ({
  nodes: [structuredClone(node)],
  batchList: [],
  instanceType: "plus",
  batchTaskName: "批量一",
  pendingFiles: {},
});
test("snapshots are independent and persist only configuration fields", () => {
  const source = snapshot();
  const saved = captureConfiguration(card, source);
  source.nodes[0].fieldValue = "changed";
  source.nodes[0].fieldData.options.push("z");
  assert.equal(saved.configuration.nodes[0].fieldValue, "hello");
  assert.deepEqual(saved.configuration.nodes[0].fieldData.options, ["x", "y"]);
  assert.equal(saved.configuration.instanceType, "plus");
  assert.deepEqual(saved.configuration.runOptions, { retainSeconds: 60 });
  assert.ok(!JSON.stringify(saved).includes("secret"));
  assert.equal(saved.configuration.webAppInfo.covers[0].thumbnailUri, "");
});
test("pending batch file names and local URLs are cleared without dropping text parameters", () => {
  const source = snapshot();
  source.batchList = [
    [
      {
        ...node,
        fieldName: "audio",
        fieldType: "AUDIO",
        fieldValue: "local.wav",
        _taskId: "row-7",
      },
      node,
    ],
  ];
  source.pendingFiles = { "row-7|1|audio": { name: "local.wav" } };
  source.nodes.push({
    ...node,
    fieldType: "IMAGE",
    fieldValue: "blob:https://example.test/id",
  });
  const saved = captureConfiguration(card, source);
  assert.equal(saved.requiresFiles, true);
  assert.equal(saved.configuration.initialBatchList[0][0].fieldValue, "");
  assert.equal(saved.configuration.initialBatchList[0][1].fieldValue, "hello");
  assert.equal(saved.configuration.nodes[1].fieldValue, "");
  assert.ok(!JSON.stringify(saved).includes("_taskId"));
});
test("incomplete upload and missing application cannot be saved", () => {
  assert.throws(
    () =>
      captureConfiguration(card, { ...snapshot(), hasUploadingFiles: true }),
    /正在上传/,
  );
  assert.throws(
    () => captureConfiguration({ ...card, webappId: "  " }, snapshot()),
    /应用 ID/,
  );
});
test("groups/tags normalize and filters intersect without duplicating multi-group cards", () => {
  const org = normalizeOrganization({
    title: " 用途 ",
    groupIds: ["a", "b", "a"],
    tags: [" 语音 ", "语音", "", 1, "字幕"],
  });
  assert.deepEqual(org, {
    title: "用途",
    groupIds: ["a", "b"],
    tags: ["语音", "字幕"],
  });
  const config = captureConfiguration(card, snapshot()).configuration;
  assert.equal(matchesCard(config, org, "用途", "a", ["语音", "字幕"]), true);
  assert.equal(matchesCard(config, org, "123", "b", ["语音"]), true);
  assert.equal(matchesCard(config, org, "", "ungrouped", []), false);
  assert.equal(matchesCard(config, org, "", "all", ["不存在"]), false);
});
test("draft import preserves identical-app variants with deterministic IDs and tolerates bad rows", () => {
  const drafts = [
    null,
    {
      id: "d1",
      name: "语音组",
      cards: [
        { ...card, nodes: [node], initialBatchList: [] },
        { ...card, nodes: [{ ...node, fieldValue: "variant" }] },
        null,
      ],
    },
    {
      id: "d2",
      name: "坏数据",
      cards: [
        {
          webappId: "42",
          nodes: { broken: true },
          initialBatchList: [null, [null]],
        },
      ],
    },
  ];
  const first = importDrafts(drafts);
  const second = importDrafts(drafts);
  assert.deepEqual(
    first.cards.map((c) => c.id),
    second.cards.map((c) => c.id),
  );
  assert.equal(first.cards.length, 3);
  assert.equal(first.cards[1].configuration.nodes[0].fieldValue, "variant");
  assert.deepEqual(first.cards[0].organization.groupIds, ["draft:d1"]);
  assert.deepEqual(first.cards[2].configuration.nodes, []);
});
test("decoding rejects invalid saved cards and strips runtime data and unsafe covers", () => {
  assert.equal(decodeSavedCard({ id: "bad" }), null);
  const saved = decodeSavedCard({
    id: "good",
    configuration: { ...card, nodes: [node] },
    run: { status: "running" },
    directory: { path: "/tmp/private" },
    organization: { tags: ["a"] },
  });
  assert.ok(!("run" in saved));
  assert.ok(!("directory" in saved));
  assert.equal(safeCover("file:///etc/passwd"), "");
});
test("new tasks preserve organization but have independent IDs and idle run states", () => {
  const captured = captureConfiguration(card, snapshot());
  const partial = {
    ...captured.configuration,
    organization: { title: "模板", groupIds: ["a", "b"], tags: ["字幕"] },
  };
  const a = createCard(partial);
  const b = createCard(partial);
  assert.notEqual(a.id, b.id);
  assert.equal(a.run.status, "idle");
  a.organization.tags.push("新标签");
  a.nodes[0].fieldValue = "改动";
  assert.deepEqual(b.organization.tags, ["字幕"]);
  assert.equal(b.nodes[0].fieldValue, "hello");
});
