// The one-time copy of the old mods' saved state into helm's keys (PLAN.md 3.1). The host runs it
// at start when helm.migrated is below VERSION. It only copies: the old data stays as it was, so
// switching back to the old layout loses nothing.
//
// The old mods kept their localStorage in data/<mod>/store.json under the app folder: one JSON
// object whose values are strings (JSON for lists and maps).
import { readTextFile, appHome, shared, terminals, run } from "herdr";
import { KEYS, read, write, prefs, PREF_DEFAULTS } from "../lib/store.js";

export const VERSION = 1;

const parse = (text, fallback) => { try { return JSON.parse(text); } catch { return fallback; } };

// One old store as an object, or {} when it is missing or unreadable.
async function store(mod) {
  try { return parse(await readTextFile(`${appHome()}/data/${mod}/store.json`), {}) ?? {}; } catch { return {}; }
}

// What to write, from the old stores and shared state. Pure, so the tests check every row of the
// table. A value helm already has (set by hand, or a later run) wins over the old one.
export function plan(stores, sharedState, current) {
  const sf = stores["space-folders"] ?? {}, ta = stores["tabs-asks"] ?? {};
  const ag = stores.agents ?? {}, as = stores.asks ?? {}, ar = stores["claude-artifacts"] ?? {};
  const old = {};
  const folded = parse(sf["machines.folded"], null);
  if (Array.isArray(folded)) old.machinesFolded = folded;
  if (sf["frozen.hidden"] != null) old.hideFrozen = sf["frozen.hidden"] === "1";
  const panels = parse(ta.panels, null);
  if (panels && typeof panels === "object" && !Array.isArray(panels)) old.panels = panels;
  if (sharedState["agents.sort"] === "priority" || sharedState["agents.sort"] === "grouped") old.agentsSort = sharedState["agents.sort"];
  if (as.scope === "all" || as.scope === "space") old.asksScope = as.scope;
  if (ar["artifacts.scope"] === "space" || ar["artifacts.scope"] === "agent") old.artifactsScope = ar["artifacts.scope"];
  // Only the prefs helm still has at their defaults take the old value.
  const prefsOut = { ...current.prefs };
  for (const [k, v] of Object.entries(old)) if (JSON.stringify(current.prefs[k]) === JSON.stringify(PREF_DEFAULTS[k])) prefsOut[k] = v;
  const changedOld = parse(ag.changed, null);
  const changed = { ...(changedOld && typeof changedOld === "object" ? changedOld : {}), ...current.changed };
  const asksOld = sharedState["asks.state"];
  const asks = current.asks ?? (asksOld && Array.isArray(asksOld.asks) ? asksOld : null);
  const folders = current.folders ?? sharedState["space-folders"] ?? null;
  const pins = parse(ag.pins, []);
  return { prefs: prefsOut, changed, asks, folders, pins: Array.isArray(pins) ? pins : [] };
}

export async function migrate() {
  if ((read(KEYS.migrated, 0) ?? 0) >= VERSION) return false;
  const stores = {};
  for (const mod of ["space-folders", "tabs-asks", "agents", "asks", "claude-artifacts"]) stores[mod] = await store(mod);
  const sharedState = { "agents.sort": shared("agents.sort"), "asks.state": shared("asks.state"), "space-folders": shared("space-folders") };
  const out = plan(stores, sharedState, { prefs: prefs(), changed: read(KEYS.changed, {}), asks: shared(KEYS.asks), folders: shared(KEYS.folders) });
  write(KEYS.prefs, out.prefs);
  write(KEYS.changed, out.changed);
  if (out.asks) write(KEYS.asks, out.asks);
  if (out.folders) write(KEYS.folders, out.folders);
  // Old pins that never made it to a label: pin the ones that are live now.
  const live = new Set(terminals().filter((t) => t.state === "live" && !t.labels?.["herdr.pinned"]).map((t) => t.address));
  for (const address of out.pins) if (live.has(address)) run("terminal.pin", { terminal: address, pinned: true });
  write(KEYS.migrated, VERSION);
  return true;
}
