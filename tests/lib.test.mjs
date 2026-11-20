import { test } from "node:test";
import assert from "node:assert/strict";
import { resetHerdr } from "./herdr-stub.mjs";
import { find, narrow, panelShown, togglePanel, paneFrame } from "../helm/lib/layout.js";
import { age, duration } from "../helm/lib/time.js";
import { clean, tilde, localId, machineOf, tabTitle, agentName, tabName, lastPart, leadPanes } from "../helm/lib/names.js";

const H = globalThis.__herdr;
const tree = (panelHidden, active) => ({ id: "root", children: [
  { id: "sidebar", size: { px: 268 }, children: [] },
  { id: "work", children: [{ id: "main", content: { tab: "active", pane: { header: { position: "top" } } } },
    { id: "panel", hidden: panelHidden, children: [{ id: "panel-body", type: "stack", active, children: [] }] }] }] });

test("layout helpers read the tree", () => {
  const root = tree(false, "asks");
  assert.equal(find(root, "panel-body").active, "asks");
  assert.equal(narrow(root), false);
  assert.equal(narrow({ id: "root", children: [{ id: "sidebar", size: { px: 44 } }] }), true);
  assert.equal(panelShown(root), "asks");
  assert.equal(panelShown(tree(true, "asks")), null);
  assert.equal(paneFrame(root).header.position, "top");
});

test("togglePanel hides the shown child and shows another", () => {
  resetHerdr({ layout: tree(false, "files") });
  togglePanel("files");
  assert.deepEqual(H.runs, [["layout.hide", { id: "panel" }]]);
  resetHerdr({ layout: tree(false, "files") });
  togglePanel("asks");
  assert.deepEqual(H.runs.map((r) => r[0]), ["layout.select", "layout.show"]);
  resetHerdr({ layout: tree(false, "files") });
  togglePanel("files", true);
  assert.deepEqual(H.runs.map((r) => r[0]), ["layout.select", "layout.show"]);
});

test("ages", () => {
  assert.equal(age(30000), "now");
  assert.equal(age(5 * 60000), "5m");
  assert.equal(age(3 * 3600000), "3h");
  assert.equal(age(50 * 3600000), "2d");
  assert.equal(duration(1000), "<1m");
});

test("names", () => {
  assert.equal(clean("⠋ - Thinking"), "Thinking");
  assert.equal(clean("[web] login"), "[web] login");
  assert.equal(clean("[ ! ] codex task"), "codex task");
  assert.equal(tilde("/h/u/x", "/h/u"), "~/x");
  assert.equal(localId({ id: "home/sp1", machine: "home" }), "sp1");
  assert.equal(localId({ id: "sp1", machine: null }), "sp1");
  assert.equal(machineOf("home/t7"), "home");
  assert.equal(machineOf("t7"), null);
  assert.equal(tabTitle({ name: "2", named: false }, { title: "✦ Fixing tests", program: { name: "Claude Code", key: "claude" } }), "Fixing tests");
  assert.equal(tabTitle({ name: "2", named: false }, { title: "~/work", program: { name: "Claude Code" } }), "2");
  assert.equal(tabTitle({ name: "deploy", named: true }, { title: "Fixing", program: { name: "Claude Code" } }), "deploy");
  assert.equal(agentName({ tab_name: "fix login", title: "x" }), "fix login");
  assert.equal(agentName({ tab_name: "2", title: "✦ Reading", program: { name: "Claude Code" } }), "Reading");
  assert.equal(tabName({ name: "tb12" }, { name: "Codex" }), "Codex");
  assert.equal(tabName({ name: "work" }, { name: "Codex" }), "work");
  assert.equal(lastPart("~/Projects/herdr/"), "herdr");
  assert.equal(lastPart("~"), "");
  const leads = leadPanes([{ tab: "a", terminal: "t1", program: { shell: true } }, { tab: "a", terminal: "t2", program: { agent: true } }]);
  assert.equal(leads.get("a").terminal, "t2");
});
