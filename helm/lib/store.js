// helm's shared state: every key helm owns, and writes that happen only when something changed.
// Every setShared() redraws every mod in the window, so a write that changes nothing must not
// happen (PLAN.md 2.4). Durable state lives here or in files, never only in localStorage,
// because localStorage is per copy of the mod (PLAN.md 2.9).
import { shared, setShared } from "herdr";

export const KEYS = {
  asks: "helm.asks",
  folders: "helm.folders",
  foldersNew: "helm.folders.new",
  freeze: "helm.freeze",
  freezeRev: "helm.freeze.rev",
  order: "helm.spaces.order",
  changed: "helm.agents.changed",
  prefs: "helm.prefs",
  migrated: "helm.migrated",
  timeline: "helm.timeline",
  machines: "helm.machines",
};

// Keys owned by Herdr or by other layouts' mods. helm reads them, and writes space.colors and
// the sidebar keys in the same format so Herdr's picker and spaces mods keep working.
export const FOREIGN = {
  spaceColors: "space.colors",
  panels: "workspace.panels",
  layout: "layout",
  sidebarWidth: "sidebar.width",
  sidebarCollapsed: "sidebar.collapsed",
};

export const PREF_DEFAULTS = {
  hideFrozen: false,
  agentsSort: "priority",
  asksScope: "space",
  artifactsScope: "agent",
  machinesFolded: [],
  panels: {},
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export function read(key, fallback = null) {
  const v = shared(key);
  return v ?? clone(fallback);
}

// Writes `value` under `key` unless it is already there. Returns true when it wrote.
export function write(key, value) {
  if (same(shared(key), value)) return false;
  setShared(key, value);
  return true;
}

// Reads `key` (or a copy of `fallback`), lets `fn` change that copy in place, and writes it
// back only if it differs. Returns what `fn` returned. To replace a value, use write().
export function update(key, fallback, fn) {
  const draft = read(key, fallback);
  const before = JSON.stringify(draft);
  const out = fn(draft);
  if (JSON.stringify(draft) !== before) setShared(key, draft);
  return out;
}

export function prefs() {
  return { ...PREF_DEFAULTS, ...(shared(KEYS.prefs) ?? {}) };
}

export function setPref(name, value) {
  return update(KEYS.prefs, {}, (p) => { p[name] = value; });
}
