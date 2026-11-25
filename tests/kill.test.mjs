import { test } from "node:test";
import assert from "node:assert/strict";
import { resetHerdr } from "./herdr-stub.mjs";
import { Kill, Killed, killToast, killedLine } from "../helm/parts/kill.js";
import { mergeKilled, loadKilled, when } from "../helm/engines/kill.js";
import { KEYS } from "../helm/lib/store.js";

const H = globalThis.__herdr;
const space = { id: "sp1", name: "web", machine: null, tabs: [] };
const remote = { id: "home/sp9", name: "lab", machine: "home", tabs: [] };

// exec stand-in for the space-kill tools: answers by tool name, records each call.
const fake = (answers, calls = []) => async (_cmd, args, opts) => {
  const name = args[2], sub = args[3];
  calls.push({ name, args: args.slice(3), on: opts.on ?? null });
  const a = answers[name === "space-kill" ? sub : name];
  if (a?.code) return { code: a.code, stdout: JSON.stringify(a.out ?? {}), stderr: a.stderr ?? "" };
  return { code: 0, stdout: JSON.stringify(a ?? []), stderr: "" };
};

test("kill runs space-kill on the space's machine, closes with a toast and lists it", async () => {
  const calls = [];
  const rec = { space: "sp9", name: "lab", folder: null, killed_at: "2026-11-25T18:00:00+01:00", by: "oystein", sessions: [], worktrees: [] };
  resetHerdr({ spaces: [remote], exec: fake({ kill: { killed: "sp9", name: "lab", worktrees_queued: 1, kept: [] }, "space-killed": [rec] }, calls) });
  const k = new Kill();
  k.init({ space: "home/sp9" }, null);
  await k.go({ notify() {} });
  assert.deepEqual(calls[0], { name: "space-kill", args: ["kill", "sp9"], on: "home" });
  assert.equal(H.notices.at(-1).title, "Killed lab");
  assert.match(H.notices.at(-1).body, /worktree is removed tonight/);
  assert.deepEqual(H.store.get(KEYS.killed), [{ ...rec, machine: "home" }]);
});

test("a refused kill shows the engine's error and keeps the dialog open", async () => {
  resetHerdr({ spaces: [space], exec: fake({ kill: { code: 1, out: { error: "an agent in this space is working" } } }) });
  const k = new Kill();
  k.init({ space: "sp1" }, null);
  await k.go({ notify() {} });
  assert.equal(k.error, "an agent in this space is working");
  assert.equal(k.working, false);
  assert.equal(H.notices.length, 0);
});

test("revive runs space-revive, drops the entry and shows a toast", async () => {
  const calls = [];
  resetHerdr({ exec: fake({ "space-revive": { revived: "sp9", new_space: "sp10", name: "lab" }, "space-killed": [] }, calls) });
  H.store.set(KEYS.killed, [{ space: "sp9", name: "lab", machine: "home", killed_at: "x" }]);
  const l = new Killed();
  l.init({}, null);
  await l.revive({ space: "sp9", name: "lab", machine: "home" }, { notify() {} });
  assert.deepEqual(calls[0], { name: "space-revive", args: ["sp9"], on: "home" });
  assert.equal(H.notices.at(-1).title, "Revived lab");
  assert.deepEqual(H.store.get(KEYS.killed), []);
  assert.equal(l.reviving, null);
});

test("killed lists merge per machine, newest first, and a silent machine keeps its entries", async () => {
  const a = { space: "a", killed_at: "2026-11-25T10:00:00Z" }, b = { space: "b", killed_at: "2026-11-25T12:00:00Z" };
  const merged = mergeKilled([{ space: "old", machine: null }, { space: "h", machine: "home" }], null, [a, b]);
  assert.deepEqual(merged.map((k) => k.space), ["b", "a", "h"]);
  resetHerdr({ exec: async (_c, _a, o) => (o.on === "home" ? { code: 255, stdout: "", stderr: "ssh" } : { code: 0, stdout: JSON.stringify([a]), stderr: "" }) });
  H.store.set(KEYS.killed, [{ space: "h", machine: "home" }]);
  await loadKilled(["home"]);
  assert.deepEqual(H.store.get(KEYS.killed).map((k) => k.space), ["a", "h"]);
});

test("the killed line says where, when and by whom", () => {
  resetHerdr();
  const now = Date.parse("2026-11-25T20:00:00Z");
  assert.equal(when("2026-11-25T17:00:00Z", now), "3h ago");
  assert.equal(killedLine({ machine: "home", killed_at: "2026-11-25T19:55:00Z", by: "oystein" }, now), "home · 5m ago by oystein");
  assert.equal(killToast("web", { worktrees_queued: 0, kept: [{ root: "~", why: "main checkout" }] }).body, "Kept: ~ (main checkout). Revive it from the Killed list.");
});

test("forget runs space-kill forget and drops the entry without a revive", async () => {
  const calls = [];
  resetHerdr({ exec: fake({ forget: { forgotten: "sp9" }, "space-killed": [] }, calls) });
  H.store.set(KEYS.killed, [{ space: "sp9", name: "lab", machine: null, killed_at: "x" }]);
  const l = new Killed();
  l.init({}, null);
  await l.forget({ space: "sp9", name: "lab", machine: null }, { notify() {} });
  assert.deepEqual(calls[0], { name: "space-kill", args: ["forget", "sp9"], on: null });
  assert.deepEqual(H.store.get(KEYS.killed), []);
  assert.equal(l.error, null);
});
