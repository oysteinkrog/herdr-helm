import { test } from "node:test";
import assert from "node:assert/strict";
import { GitTracker, where, parseStatus, tail, FALLBACK } from "../helm/engines/spaces/git.js";

const s = (id, folder, machine = null) => ({ id, folder, machine, tabs: [{ id: `tb-${id}` }] });

test("new places are due once, and again after a cd", () => {
  const g = new GitTracker();
  const sp = [s("a", "/r1"), s("b", "/r2")];
  const due = g.due(0, sp, [], [], false, new Set());
  assert.equal(due.size, 2);
  for (const k of due) g.git[k] = null;
  assert.equal(g.due(1, sp, [], [], false, new Set()).size, 0);
  sp[0].folder = "/r1/sub";
  g.git[where(sp[0], [])] = null; // a known place, but the space just moved there
  assert.deepEqual([...g.due(2, sp, [], [], false, new Set())], [where(sp[0], [])]);
});

test("a turn that ended makes its repo due", () => {
  const g = new GitTracker();
  const sp = [s("a", "/r1")];
  const k = where(sp[0], []);
  g.git[k] = { repo: "x" };
  g.due(0, sp, [{ pane: "p1", tab: "tb-a", terminal: "t1", status: "working", program: { agent: true } }], [], false, new Set());
  const due = g.due(1, sp, [{ pane: "p1", tab: "tb-a", terminal: "t1", status: "idle", program: { agent: true } }], [], false, new Set());
  assert.deepEqual([...due], [k]);
});

test("the fallback runs only while the window is active and the machine is not folded", () => {
  const g = new GitTracker();
  const sp = [s("a", "/r1", "box")];
  const k = where(sp[0], []);
  g.git[k] = { repo: "x" }; g.checked[k] = 0;
  assert.equal(g.due(FALLBACK + 1, sp, [], [], false, new Set()).size, 0);
  assert.equal(g.due(FALLBACK + 1, sp, [], [], true, new Set(["box"])).size, 0);
  assert.equal(g.due(FALLBACK + 1, sp, [], [], true, new Set()).size, 1);
});

test("a machine coming back makes its places due", () => {
  const g = new GitTracker();
  const sp = [s("a", "/r1", "box")];
  g.git[where(sp[0], [])] = null;
  g.due(0, sp, [], [{ name: "box", layout: "unavailable" }], false, new Set());
  assert.equal(g.due(1, sp, [], [{ name: "box", layout: "ready" }], false, new Set()).size, 1);
});

test("status parsing and the tail", () => {
  const out = "# branch.oid abc\n# branch.head spike\n# branch.upstream origin/spike\n# branch.ab +2 -1\n";
  const g = parseStatus(out, "/home/u/herdr/.git", "/home/u/herdr");
  assert.deepEqual({ name: g.name, branch: g.branch, ahead: g.ahead, behind: g.behind, linked: g.linked }, { name: "herdr", branch: "spike", ahead: 2, behind: 1, linked: false });
  assert.equal(parseStatus(out, "/home/u/herdr/.git", "/home/u/wt/x").linked, true);
  assert.equal(tail(g, "other").where, "herdr · spike");
  assert.equal(tail(g, "herdr").where, "spike");
  assert.equal(tail({ ...g, branch: "main" }, "herdr").where, "");
});
