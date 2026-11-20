import { test } from "node:test";
import assert from "node:assert/strict";
import { track, tree, ordered, groups, labels, kidStatus, KEEP_CHANGED_MS } from "../helm/engines/agents.js";

const ag = (address, status, more = {}) => ({ address, status, seq: 0, space: "s1", space_name: "web", tab: `tb-${address}`, ...more });

test("change times: stamped on a change, done and idle count as one, gone ones dropped after 30 days", () => {
  const first = track({}, [ag("t1", "working")], 1000);
  assert.deepEqual(first, { t1: { s: "working", at: 1000 } });
  assert.equal(track(first, [ag("t1", "working")], 2000), null);
  const done = track(first, [ag("t1", "done")], 3000);
  assert.equal(track(done, [ag("t1", "idle")], 4000), null);
  const old = { gone: { s: "idle", at: 0 }, ...done };
  const next = track(old, [ag("t1", "working")], KEEP_CHANGED_MS + 10);
  assert.equal("gone" in next, false);
});

test("sub-agents: a tree with lines, and a parent takes its most urgent child's rank", () => {
  const all = [
    { address: "t1", state: "live" },
    { address: "t2", parent: "t1", state: "live", status: "error" },
    { address: "t3", parent: "t1", state: "live", status: "working" },
    { address: "t4", parent: "t3", state: "live", status: "idle" },
  ];
  assert.deepEqual(tree(all, "t1").map((s) => [s.t.address, s.lines.join("")]), [["t2", "├"], ["t3", "└"], ["t4", "└"]]);
  assert.equal(kidStatus(all[1], new Map()), "blocked");
  const { list, urgency } = ordered([ag("t1", "idle", { seq: 1 }), ag("t9", "working", { seq: 2 })], all, {}, true, false);
  assert.equal(urgency.get("t1"), 4);
  assert.deepEqual(list.map((a) => a.address), ["t1", "t9"]);
});

test("priority order: pinned first, then rank, then the latest change", () => {
  const changed = { a: { at: 1 }, b: { at: 5 } };
  const { list, pinned, rest, urgency } = ordered([ag("a", "working"), ag("b", "working"), ag("c", "blocked"), ag("p", "idle", { pinned: true })], [], changed, true, false);
  assert.deepEqual(list.map((a) => a.address), ["p", "c", "b", "a"]);
  const g = groups(pinned, rest, urgency, true);
  assert.deepEqual(g.map((x) => [x.label, x.members.length]), [["Pinned", 1], ["Needs you", 1], ["Working", 2]]);
});

test("grouped by space: neighbours in one space make one group", () => {
  const list = [ag("a", "idle", { space: "s1", space_name: "web" }), ag("b", "idle", { space: "s1", space_name: "web" }), ag("c", "idle", { space: "s2", space_name: "api" })];
  const { pinned, rest, urgency } = ordered(list, [], {}, false, false);
  assert.deepEqual(groups(pinned, rest, urgency, false).map((x) => [x.label, x.members.length]), [["web", 2], ["api", 1]]);
});

test("labels: a named tab or a telling title; an automatic number only when two rows would read the same", () => {
  const spaces = [{ tabs: [{ id: "tb-a", name: "review", named: true }, { id: "tb-b", name: "2", named: false }, { id: "tb-c", name: "3", named: false }] }];
  const list = [ag("a", "idle"), ag("b", "idle"), ag("c", "idle")];
  const { detail } = labels(list, [], spaces);
  assert.equal(detail.get("a"), "review");
  assert.equal(detail.get("b"), "2");
  assert.equal(detail.get("c"), "3");
  const one = labels([ag("b", "idle")], [], spaces);
  assert.equal(one.detail.get("b"), null);
});
