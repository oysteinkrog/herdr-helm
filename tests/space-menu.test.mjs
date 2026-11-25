import { test } from "node:test";
import assert from "node:assert/strict";
import { resetHerdr } from "./herdr-stub.mjs";
import { SpaceMenu } from "../helm/parts/space-menu.js";
import { Freeze, Thaw, what, programs, busyOnes, freezeToast, thawToast } from "../helm/parts/freeze.js";
import { KEYS } from "../helm/lib/store.js";

const H = globalThis.__herdr;
const space = { id: "sp1", name: "web", machine: null, tabs: [] };

test("the space menu offers Freeze or Thaw first, then Kill, Rename, worktree items in git, and Close", () => {
  resetHerdr({ spaces: [space] });
  const m = new SpaceMenu();
  m.init({ space: "sp1", frozen: false }, null);
  assert.deepEqual(m.items().map((i) => i.label), ["Freeze space…", "Kill space…", "Rename", "Close"]);
  m.git = "linked";
  assert.deepEqual(m.items().map((i) => i.label), ["Freeze space…", "Kill space…", "Rename", "New worktree", "Open worktree", "Remove worktree", "Close"]);
  m.frozen = true;
  m.git = "main";
  assert.deepEqual(m.items().map((i) => i.label), ["Thaw space", "Kill space…", "Rename", "New worktree", "Open worktree", "Close"]);
  m.pick(0);
  assert.equal(H.overlays.at(-1).props.part, "thaw");
  m.pick(1);
  assert.equal(H.overlays.at(-1).props.part, "kill");
  m.pick(5);
  assert.deepEqual(H.runs.at(-1), ["space.close", { id: "sp1" }]);
});

test("the freeze plan helpers name programs and find busy agents", () => {
  const plan = { terminals: [
    { kind: "shell" }, { kind: "claude", status: "idle" }, { kind: "codex", status: "working" }, { kind: "program", argv: ["sleep", "9"] },
  ] };
  assert.deepEqual(programs(plan).map(what), ["Claude Code", "Codex", "sleep 9"]);
  assert.equal(busyOnes(plan).length, 1);
  assert.equal(freezeToast("web", { frozen: 2, failed: [] }).level, "success");
  assert.match(freezeToast("web", { frozen: 1, failed: ["t3"] }).body, /Could not stop: t3/);
  assert.equal(thawToast("web", { thawed: 2, left: 0 }).body, "2 started again.");
  assert.equal(thawToast("web", { thawed: 1, left: 1 }).level, "warning");
});

// exec stand-in for freeze.sh: answers by subcommand.
const fakeScript = (answers) => async (_cmd, args) => {
  const sub = args[3];
  if (sub === "version") return { code: 0, stdout: "1\n", stderr: "" };
  return { code: 0, stdout: JSON.stringify(answers[sub] ?? []), stderr: "" };
};

test("freeze runs freeze.sh, marks the space frozen and closes with a toast", async () => {
  resetHerdr({ spaces: [space], exec: fakeScript({ freeze: { frozen: 2, failed: [] }, list: [{ space: "sp1", count: 2, frozen_at: "x", addresses: ["t1"] }] }) });
  const f = new Freeze();
  f.init({ space: "sp1" }, null);
  await f.go({ notify() {} });
  assert.equal(H.notices.at(-1).title, "Froze web");
  assert.deepEqual(Object.keys(H.store.get(KEYS.freeze)), ["sp1"]);
});

test("thaw refuses when the script on that machine is another version", async () => {
  resetHerdr({ spaces: [space], exec: async (_c, args) => (args[3] === "version" ? { code: 0, stdout: "2\n", stderr: "" } : { code: 0, stdout: "[]", stderr: "" }) });
  const t = new Thaw();
  t.init({ space: "sp1" }, null);
  await t.go({ notify() {} });
  assert.match(t.error, /version 2, this helm needs 1/);
  assert.equal(H.notices.length, 0);
});
