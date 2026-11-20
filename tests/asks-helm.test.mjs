// helm's own Asks pieces: the next-waiting order, the panel's scope, the toast action, accept.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resetHerdr } from "./herdr-stub.mjs";
import { nextWaiting } from "../helm/engines/index.js";
import { sortAsks } from "../helm/parts/asks.js";
import { Engine } from "../helm/engines/asks/detect.js";
import { Delivery } from "../helm/engines/asks/deliver.js";
import { update } from "../helm/engines/asks/state.js";
import { ownerOf } from "../helm/engines/host.js";

const H = globalThis.__herdr;
const ask = (id, address, at, more = {}) => ({ id, address, detected_at: at, state: "pending", options: [], ...more });

test("next waiting: oldest first, one per agent, then round again", () => {
  const asks = [ask("a", "t1", 30), ask("b", "t2", 10), ask("c", "t2", 20), ask("d", "t3", 40, { state: "delivered" })];
  assert.equal(nextWaiting(asks, null), "t2");
  assert.equal(nextWaiting(asks, "t2"), "t1");
  assert.equal(nextWaiting(asks, "t1"), "t2");
  assert.equal(nextWaiting([], null), null);
});

test("the panel's scope: this space or all, finished cards apart, answered today counted", () => {
  const now = 100000000;
  const asks = [
    ask("a", "t1", 1, { space: "s1" }), ask("b", "t2", 1, { space: "s2" }),
    ask("c", "t1", 1, { space: "s1", state: "delivered", answered_at: now - 1000 }),
    ask("d", "t1", 1, { space: "s1", state: "dismissed" }),
  ];
  const here = sortAsks(asks, "s1", false, now);
  assert.deepEqual(here.pending.map((a) => a.id), ["a"]);
  assert.deepEqual(here.done.map((a) => a.id), ["c"]);
  assert.equal(here.today, 1);
  assert.deepEqual(sortAsks(asks, "s1", true, now).pending.map((a) => a.id), ["a", "b"]);
});

test("an ask toast opens helm's Asks panel, a command the status part owns", () => {
  resetHerdr({ terminals: [{ address: "t1", state: "live", turn: 1, labels: {}, status: { app: "claude-code", state: "blocked", msg: "answer: Tabs? (Yes · No)" } }] });
  const e = Object.assign(new Engine(), { config: { classify: "off", toast: true } });
  e.tick({ spawn() {}, notify() {} });
  assert.equal(H.notices.length, 1);
  assert.equal(H.notices[0].action.name, "helm.asks-open");
  assert.equal(ownerOf("asks-open"), "status");
});

test("accept answers the newest waiting ask in scope with its recommended option", () => {
  resetHerdr();
  update((s) => { s.asks = [ask("x", "t9", 1, { space: "s2", kind: "DECISION", options: [{ n: 1, label: "A" }] }), ask("y", "t1", 2, { space: "s1", kind: "DECISION", delivery: "send", options: [{ n: 1, label: "A" }, { n: 2, label: "B" }], recommended: 1 })]; });
  const d = new Delivery();
  const sent = [];
  d.sendText = (a, text) => sent.push([a.id, text]);
  d.accept("s1", {});
  assert.deepEqual(sent, [["y", "B"]]);
  d.accept("s3", {});
  assert.equal(sent.length, 1);
});

test("the tab bar counts waiting asks here and elsewhere, and restores a space's panel", async () => {
  const { askCounts, wantedPanel } = await import("../helm/parts/tabbar.js");
  const asks = [ask("a", "t1", 1, { space: "s1" }), ask("b", "t2", 1, { space: "s2" }), ask("c", "t3", 1, { space: "s1", notice: true }), ask("d", "t4", 1, { space: "s1", state: "failed" })];
  assert.deepEqual(askCounts(asks, "s1"), { here: 1, elsewhere: 1 });
  assert.equal(wantedPanel({ s1: "files" }, "s1", ["files", "asks"]), "files");
  assert.equal(wantedPanel({ s1: "changes" }, "s1", ["files", "asks"]), null);
  assert.equal(wantedPanel({}, "s2", ["files"]), null);
});
