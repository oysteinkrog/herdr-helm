import { test } from "node:test";
import assert from "node:assert/strict";
import { resetHerdr } from "./herdr-stub.mjs";
import { KEYS, read, write, update, prefs, setPref, PREF_DEFAULTS } from "../helm/lib/store.js";

const H = globalThis.__herdr;

test("every helm key starts with helm.", () => {
  for (const k of Object.values(KEYS)) assert.match(k, /^helm\./);
});

test("write skips a value that is already there", () => {
  resetHerdr();
  assert.equal(write(KEYS.prefs, { a: 1 }), true);
  assert.equal(write(KEYS.prefs, { a: 1 }), false);
  assert.deepEqual(H.writes, [KEYS.prefs]);
});

test("update writes only when the draft changed, and returns fn's result", () => {
  resetHerdr();
  const r = update(KEYS.asks, { asks: [] }, (s) => s.asks.length);
  assert.equal(r, 0);
  assert.deepEqual(H.writes, []); // reading the fallback writes nothing
  update(KEYS.asks, { asks: [] }, (s) => { s.asks.push({ id: "x" }); });
  assert.equal(H.writes.length, 1);
  update(KEYS.asks, { asks: [] }, () => {});
  assert.equal(H.writes.length, 1);
  assert.deepEqual(read(KEYS.asks), { asks: [{ id: "x" }] });
});

test("read never hands out the stored object or the fallback itself", () => {
  resetHerdr();
  const fallback = { list: [] };
  const a = read(KEYS.folders, fallback);
  a.list.push(1);
  assert.deepEqual(fallback, { list: [] });
});

test("prefs fill in defaults and setPref keeps the others", () => {
  resetHerdr();
  assert.deepEqual(prefs(), PREF_DEFAULTS);
  setPref("hideFrozen", true);
  setPref("agentsSort", "grouped");
  assert.equal(prefs().hideFrozen, true);
  assert.equal(prefs().agentsSort, "grouped");
  assert.deepEqual(prefs().panels, {});
  const n = H.writes.length;
  setPref("hideFrozen", true);
  assert.equal(H.writes.length, n);
});
