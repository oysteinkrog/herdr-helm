import { test } from "node:test";
import assert from "node:assert/strict";
import { build, step, near, NewSpaces, spaceLabels } from "../helm/engines/spaces/order.js";

const S = (id, folder, extra = {}) => ({ id, name: id, folder, machine: null, tabs: [], status: "idle", active: false, ...extra });
const base = (over = {}) => ({
  spaces: [], panes: [], known: [], layouts: [],
  foldersOf: () => ({ list: [], of: {} }), machinesFolded: new Set(), hideFrozen: false, frozen: new Set(), ...over,
});
const types = (r) => r.items.map((i) => (i.type === "space" ? i.space.id : `${i.type}:${i.folder?.id ?? i.machine ?? ""}`));

test("folders first, each with its spaces, then the spaces in none", () => {
  const fl = { list: [{ id: "w", name: "Work", match: "~/work" }, { id: "e", name: "Empty" }], of: { c: "e" } };
  const r = build(base({ spaces: [S("a", "/home/u/work/x"), S("b", "/tmp"), S("c", "/tmp"), S("d", "/home/u/work/y")], foldersOf: () => fl }));
  assert.deepEqual(types(r), ["folder:w", "a", "d", "folder:e", "c", "b"]);
  assert.deepEqual(r.seen.map((s) => s.id), ["a", "d", "c", "b"]);
});

test("a folded folder hides its spaces but keeps them in seen", () => {
  const fl = { list: [{ id: "w", match: "~/work", folded: true }], of: {} };
  const r = build(base({ spaces: [S("a", "/home/u/work/x"), S("b", "/tmp")], foldersOf: () => fl }));
  assert.deepEqual(types(r), ["folder:w", "b"]);
  assert.deepEqual(r.seen, [{ id: "a", machine: null, shown: false, folder: "w" }, { id: "b", machine: null, shown: true, folder: null }]);
});

test("hidden frozen spaces leave the list, the front one stays, an all-frozen folder goes", () => {
  const fl = { list: [{ id: "w", match: "~/work" }], of: {} };
  const sp = [S("a", "/home/u/work/x"), S("b", "/tmp"), S("c", "/tmp", { active: true })];
  const r = build(base({ spaces: sp, foldersOf: () => fl, hideFrozen: true, frozen: new Set(["a", "b", "c"]) }));
  assert.deepEqual(types(r), ["c"]);
  assert.equal(r.hiddenFrozen, 2);
  const shown = build(base({ spaces: sp, foldersOf: () => fl, hideFrozen: false, frozen: new Set(["a"]) }));
  assert.equal(shown.items.find((i) => i.space?.id === "a").frozen, true);
});

test("machines get sections once another machine is known; a folder can take one in", () => {
  const sp = [S("a", "/tmp"), S("box/b", "/home/u/x", { machine: "box" })];
  const known = [{ name: "box", state: "connected" }];
  assert.deepEqual(types(build(base({ spaces: sp, known }))), ["machine:", "a", "machine:box", "box/b"]);
  const fl = { list: [{ id: "m", match: "box" }], of: {} };
  const r = build(base({ spaces: sp, known, foldersOf: (m) => (m ? { list: [], of: {} } : fl) }));
  assert.deepEqual(types(r), ["folder:m", "machine:box", "box/b", "a"]);
});

test("a folded machine shows only its header, an empty one a new-space row", () => {
  const sp = [S("a", "/tmp"), S("box/b", "/x", { machine: "box" })];
  const known = [{ name: "box", state: "connected" }, { name: "vm", state: "asleep" }];
  const r = build(base({ spaces: sp, known, machinesFolded: new Set(["box"]) }));
  assert.deepEqual(types(r), ["machine:", "a", "machine:box", "machine:vm", "empty:vm"]);
  assert.equal(r.seen.find((s) => s.id === "box/b").shown, false);
});

test("step skips spaces that are not shown and wraps", () => {
  const seen = [{ id: "a", shown: true }, { id: "b", shown: false }, { id: "c", shown: true }];
  assert.equal(step(seen, "a", 1), "c");
  assert.equal(step(seen, "c", 1), "a");
  assert.equal(step(seen, "a", -1), "c");
  assert.equal(step(seen, "zz", 1), "a");
  assert.equal(step([], "a", 1), null);
  assert.equal(near(seen, "c"), "a");
  assert.equal(near(seen, "a"), "c");
});

test("a space made from a folder goes in it", () => {
  const ns = new NewSpaces(["a"]);
  const want = { machine: null, id: "w", before: ["a"], until: 100 };
  const acts = ns.tick([S("a", "/tmp", { active: true }), S("n", "/tmp")], [], 10, want, () => null);
  assert.deepEqual(acts.map((x) => x.type), ["clear-new", "put"]);
  assert.equal(acts[1].space.id, "n");
});

test("a space made from the front space goes right under it and into its folder", () => {
  const ns = new NewSpaces(["a", "b", "c"]);
  const seen = [{ id: "a", shown: true, folder: "w" }, { id: "b", shown: true, folder: null }, { id: "c", shown: true, folder: null }];
  ns.tick([S("a", "/t", { active: true }), S("b", "/t"), S("c", "/t")], seen, 0, null, () => "w");
  const acts = ns.tick([S("a", "/t"), S("b", "/t"), S("c", "/t"), S("n", "/t", { active: true })], seen, 1000, null, () => null);
  assert.deepEqual(acts, [
    { type: "put-if-unset", machine: null, space: S("n", "/t", { active: true }), folder: "w" },
    { type: "move", id: "n", index: 2 },
  ]);
});

test("an agent's space goes in the folder and after the space its labels name, once", () => {
  const ns = new NewSpaces(["a", "b", "c"]);
  const sp = [S("a", "/t", { active: true }), S("b", "/t"), S("c", "/t"), S("n", "/t")];
  let labels = null;
  // Labels arrive a tick after the space: it waits for them.
  assert.deepEqual(ns.tick(sp, [], 0, null, () => null, () => labels), []);
  labels = { "herdr.space-folder": "w", "herdr.space-after": "b" };
  assert.deepEqual(ns.tick(sp, [], 250, null, () => null, () => labels), [
    { type: "put-if-unset", machine: null, space: sp[3], folder: "w" },
    { type: "move", id: "n", index: 3 },
  ]);
  // Done once: a later drag is never undone.
  assert.deepEqual(ns.tick([sp[0], sp[3], sp[1], sp[2]], [], 500, null, () => null, () => labels), []);
});

test("space-folder none files nowhere; space-after of a closed space moves nothing", () => {
  const ns = new NewSpaces(["a"]);
  const acts = ns.tick([S("a", "/t", { active: true }), S("n", "/t")], [], 0, null, () => null,
    () => ({ "herdr.space-folder": "none", "herdr.space-after": "gone" }));
  assert.deepEqual(acts, []);
});

test("labels are not read for another machine's spaces, nor after 60 s", () => {
  const ns = new NewSpaces(["a"]);
  const l = () => ({ "herdr.space-folder": "w" });
  assert.deepEqual(ns.tick([S("a", "/t"), S("box/n", "/t", { machine: "box" })], [], 0, null, () => null, l), []);
  ns.tick([S("a", "/t"), S("m", "/t")], [], 0, null, () => null, () => null);
  assert.deepEqual(ns.tick([S("a", "/t"), S("m", "/t")], [], 61000, null, () => null, l), []);
});

test("spaceLabels: a live local terminal's labels, by its space", () => {
  const get = spaceLabels(() => [
    { address: "t1", state: "live", labels: { "herdr.space": "sp1" } },
    { address: "t2", state: "live", labels: { "herdr.space": "sp1", "herdr.space-folder": "w" } },
    { address: "home/t3", state: "live", labels: { "herdr.space": "sp2", "herdr.space-folder": "w" } },
    { address: "t4", state: "exited", labels: { "herdr.space": "sp3", "herdr.space-after": "sp1" } },
  ]);
  assert.equal(get("sp1")["herdr.space-folder"], "w");
  assert.equal(get("sp2"), null);
  assert.equal(get("sp3"), null);
});

test("when the front space closes, the one above it is shown", () => {
  const ns = new NewSpaces(["a", "b", "c"]);
  const seen = [{ id: "a", shown: true }, { id: "b", shown: true }, { id: "c", shown: true }];
  ns.tick([S("a", "/t"), S("b", "/t", { active: true }), S("c", "/t")], seen, 0, null, () => null);
  const acts = ns.tick([S("a", "/t"), S("c", "/t", { active: true })], seen, 100, null, () => null);
  assert.deepEqual(acts, [{ type: "select", id: "a" }]);
});
