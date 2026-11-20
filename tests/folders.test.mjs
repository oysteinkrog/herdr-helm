import { test } from "node:test";
import assert from "node:assert/strict";
import { resetHerdr } from "./herdr-stub.mjs";
import { rule, reach, deepest, folderOf, machineFolder, merge, parse, drop, folders, save, place } from "../helm/engines/spaces/folders.js";
import { KEYS, read } from "../helm/lib/store.js";

const H = globalThis.__herdr;
const sp = (id, folder, machine = null, tabs = []) => ({ id, folder, machine, tabs });

test("rules", () => {
  assert.ok(rule("~/code").test("/home/u/code/x"));
  assert.ok(rule("~/code").test("/Users/u/code"));
  assert.ok(!rule("~/code").test("/home/u/codex"));
  assert.ok(rule("wbso-ai").test("/home/u/work/wbso-ai/src"));
  assert.ok(!rule("wbso-ai").test("/home/u/work/wbso-ai2"));
  assert.ok(rule("~/code/client-*").test("/home/u/code/client-acme/app"));
  assert.equal(rule("  "), null);
});

test("the deepest rule wins, first on a tie", () => {
  const list = [{ id: "a", match: "~/code" }, { id: "b", match: "~/code/client" }, { id: "c", match: "~/code" }];
  assert.equal(deepest(list, (f) => reach(f, "/home/u/code/client/x")), "b");
  assert.equal(deepest(list, (f) => reach(f, "/home/u/code/other")), "a");
  assert.equal(deepest(list, (f) => reach(f, "/tmp")), null);
});

test("a dragged place wins over rules; '' keeps a space out", () => {
  const f = { list: [{ id: "a", match: "~/code" }, { id: "b" }], of: { s2: "b", s3: "" , s4: "gone" } };
  assert.equal(folderOf(sp("s1", "/home/u/code/x"), f, []), "a");
  assert.equal(folderOf(sp("s2", "/home/u/code/x"), f, []), "b");
  assert.equal(folderOf(sp("s3", "/home/u/code/x"), f, []), null);
  assert.equal(folderOf(sp("s4", "/home/u/code/x"), f, []), null);
});

test("a space works where its first terminal is now", () => {
  const s = sp("s1", "/home/u", null, [{ id: "tb1" }]);
  assert.equal(place(s, [{ tab: "tb1", cwd: "/home/u/code/x" }]), "/home/u/code/x");
  assert.equal(place(s, []), "/home/u");
});

test("a local folder takes in a machine by its name or its spaces' folders", () => {
  const local = { list: [{ id: "a", match: "vm-*" }, { id: "b", match: "~/remote" }], of: {} };
  assert.equal(machineFolder(local, "vm-1", [], []), "a");
  assert.equal(machineFolder(local, "box", [{ w: sp("x", "/home/u/remote/y", "box") }], []), "b");
  assert.equal(machineFolder(local, "box", [], []), null);
});

test("merge takes a file only when it is newer", () => {
  const mirror = { "": { list: [], of: {}, at: 10 } };
  assert.equal(merge(mirror, { "": { list: [1], of: {}, at: 5 } })[""].at, 10);
  assert.equal(merge(mirror, { "": { list: [1], of: {}, at: 20 } })[""].at, 20);
  assert.equal(merge(mirror, { box: { list: [], of: {}, at: 1 }, vm: null }).box.at, 1);
  assert.equal(parse("not json"), null);
  assert.deepEqual(parse('{"list":[]}'), { list: [], of: {}, at: 0 });
});

test("drop puts a space in and out, writing the mirror and the file", () => {
  resetHerdr();
  const execs = [];
  H.exec = async (cmd, args, opts) => { execs.push([cmd, args, opts]); return { code: 0, stdout: "", stderr: "" }; };
  save(null, { list: [{ id: "a", match: "~/code" }], of: {} });
  const s = sp("s1", "/home/u/code/x");
  drop(s, null, []);
  assert.equal(folders(null).of.s1, "");
  drop(s, "a", []);
  assert.equal(folders(null).of.s1, "a");
  drop(sp("s2", "/tmp"), null, []);
  assert.equal("s2" in folders(null).of, false);
  assert.ok(read(KEYS.folders)[""].at > 0);
  assert.ok(execs.every(([cmd, args]) => cmd === "sh" && args[1].includes("herdr-space-folders.json.tmp")));
  // Only list, of and at go into the file (the old mod rewrites it with these three).
  assert.deepEqual(Object.keys(JSON.parse(execs.at(-1)[1][3])).sort(), ["at", "list", "of"]);
});
