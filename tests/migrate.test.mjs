import { test } from "node:test";
import assert from "node:assert/strict";
import { resetHerdr } from "./herdr-stub.mjs";
import { plan, migrate, VERSION } from "../helm/engines/migrate.js";
import { KEYS, PREF_DEFAULTS } from "../helm/lib/store.js";

const H = globalThis.__herdr;
const stores = {
  "space-folders": { "machines.folded": "[\"box\"]", "frozen.hidden": "1" },
  "tabs-asks": { panels: "{\"sp1\":\"claude-artifacts\",\"sp2\":null}" },
  agents: { changed: "{\"t1\":{\"s\":\"idle\",\"at\":5}}", pins: "[\"t3\"]" },
  asks: { scope: "all" },
  "claude-artifacts": { "artifacts.scope": "space" },
};
const sharedState = { "agents.sort": "grouped", "asks.state": { schema: 1, asks: [{ id: "a" }] }, "space-folders": { "": { list: [], of: {} } } };
const fresh = { prefs: { ...PREF_DEFAULTS }, changed: {}, asks: null, folders: null };

test("every row of the migration table", () => {
  const out = plan(stores, sharedState, fresh);
  assert.deepEqual(out.prefs, {
    hideFrozen: true, agentsSort: "grouped", asksScope: "all", artifactsScope: "space",
    machinesFolded: ["box"], panels: { sp1: "claude-artifacts", sp2: null },
  });
  assert.deepEqual(out.changed, { t1: { s: "idle", at: 5 } });
  assert.deepEqual(out.asks, sharedState["asks.state"]);
  assert.deepEqual(out.folders, sharedState["space-folders"]);
  assert.deepEqual(out.pins, ["t3"]);
});

test("what helm already has wins, and missing stores change nothing", () => {
  const out = plan(stores, sharedState, { prefs: { ...PREF_DEFAULTS, asksScope: "space", hideFrozen: false, agentsSort: "priority", panels: { sp9: "files" } }, changed: { t1: { s: "working", at: 9 } }, asks: { schema: 1, asks: [] }, folders: null });
  assert.deepEqual(out.prefs.panels, { sp9: "files" });
  assert.equal(out.changed.t1.s, "working");
  assert.deepEqual(out.asks.asks, []);
  assert.deepEqual(plan({}, {}, fresh).prefs, PREF_DEFAULTS);
});

test("migrate runs once, copies, and pins live terminals from old pins", async () => {
  const files = new Map(Object.entries(stores).map(([m, v]) => [`/sbx/herdr-app/data/${m}/store.json`, JSON.stringify(v)]));
  resetHerdr({ files, store: new Map(Object.entries(sharedState)), terminals: [{ address: "t3", state: "live", labels: {} }] });
  assert.equal(await migrate(), true);
  assert.equal(H.store.get(KEYS.migrated), VERSION);
  assert.equal(H.store.get(KEYS.prefs).asksScope, "all");
  assert.deepEqual(H.runs, [["terminal.pin", { terminal: "t3", pinned: true }]]);
  assert.ok(H.store.get("asks.state"), "the old key stays");
  assert.equal(await migrate(), false);
});
