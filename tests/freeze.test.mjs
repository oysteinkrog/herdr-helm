import { test } from "node:test";
import assert from "node:assert/strict";
import { resetHerdr } from "./herdr-stub.mjs";
import { frozenSpaces, frozenTerminals, mergeList, freezeSh, checkVersion, loadAll, mark } from "../helm/engines/freeze.js";
import { KEYS, read } from "../helm/lib/store.js";

const H = globalThis.__herdr;
const T = (address, space, frozen, state = "live") => ({ address, state, labels: { "herdr.space": space, ...(frozen ? { "herdr.frozen": "claude" } : {}) } });

test("labels on live terminals freeze their space, with the machine prefix", () => {
  const f = frozenSpaces([T("t1", "sp1", true), T("t2", "sp2", false), T("box/t3", "sp3", true), T("t4", "sp4", true, "finished")], {});
  assert.deepEqual([...f].sort(), ["box/sp3", "sp1"]);
  assert.deepEqual([...frozenTerminals([T("t1", "sp1", true), T("t2", "sp2", false)])], ["t1"]);
});

test("the mirror counts only when a listed terminal is gone", () => {
  const terms = [T("t1", "sp1", false)];
  assert.equal(frozenSpaces(terms, { sp1: { addresses: ["t1"] } }).has("sp1"), false);
  assert.equal(frozenSpaces(terms, { sp1: { addresses: ["t9"] } }).has("sp1"), true);
  assert.equal(frozenSpaces([T("box/t1", "x", false)], { "box/sp2": { addresses: ["t1"] } }).has("box/sp2"), false);
});

test("mergeList replaces one machine's entries", () => {
  const m = mergeList({ sp1: { count: 1 }, "box/sp2": { count: 1 } }, "box", [{ space: "sp5", count: 2, frozen_at: "x", addresses: ["t1"] }]);
  assert.deepEqual(Object.keys(m).sort(), ["box/sp5", "sp1"]);
  assert.deepEqual(mergeList(m, null, []), { "box/sp5": { count: 2, at: "x", addresses: ["t1"] } });
});

test("freezeSh runs helm's script on the space's machine and reports its error", async () => {
  resetHerdr();
  const calls = [];
  H.exec = async (cmd, args, opts) => {
    calls.push([args[1], args.slice(3), opts.on]);
    if (args[3] === "version") return { code: 0, stdout: "2\n", stderr: "" };
    return { code: 1, stdout: '{"error":"this space is not frozen"}', stderr: "" };
  };
  await assert.rejects(freezeSh("box", "thaw", "sp1"), /not frozen/);
  assert.match(calls[0][0], /mods\/helm\/bin\/freeze\.sh/);
  assert.equal(calls[0][2], "box");
  await assert.rejects(checkVersion("box"), /version 2, this helm needs 1/);
});

test("a background read drops its result when a freeze happened meanwhile", async () => {
  resetHerdr();
  H.exec = async () => { mark("sp9", { count: 1 }); return { code: 0, stdout: "[]", stderr: "" }; };
  assert.equal(await loadAll([]), false);
  assert.ok(read(KEYS.freeze).sp9);
  resetHerdr();
  H.exec = async () => ({ code: 0, stdout: '[{"space":"sp1","count":1,"frozen_at":"t","addresses":["t1"]}]', stderr: "" });
  assert.equal(await loadAll([]), true);
  assert.deepEqual(read(KEYS.freeze), { sp1: { count: 1, at: "t", addresses: ["t1"] } });
});
