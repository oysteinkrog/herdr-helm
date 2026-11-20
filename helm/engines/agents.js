// The agents list as data: ranks, sub-agent trees, sections or space groups, row labels, and
// when each agent's state last changed. The agents part draws it; the host keeps the change times
// in helm.agents.changed, so they are right even while the panel is closed.
//
// From the Herdr app's agents mod at v0.1.16 (Apache-2.0); see NOTICE. Changed for helm: pure
// functions apart from the drawing, change times in shared state, the sort in helm.prefs.
import { agents } from "herdr";
import { KEYS, read, write } from "../lib/store.js";
import { leadPanes, tabTitle } from "../lib/names.js";

export const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
export const SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
];
export const SECTION = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
export const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };
export const KEEP_CHANGED_MS = 30 * 86400000;

// A sub-agent without a pane is not in agents(): its raw word, error counting as blocked. It is
// never done: it reports to its parent, and the parent's done is the news.
export const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};

// Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
export function tree(all, addr, lead = []) {
  const kids = all.filter((k) => k.parent === addr && k.state === "live");
  return kids.flatMap((k, i) => {
    const last = i === kids.length - 1;
    return [{ t: k, lines: [...lead, last ? "└" : "├"] }, ...tree(all, k.address, [...lead, last ? "" : "│"])];
  });
}

// Stamps agents whose state changed, and drops gone agents after 30 days. Done and idle count
// as one: looking at a finished agent turns done into idle, and looking is not the agent doing
// anything. Returns the new map, or null when nothing changed.
export function track(changed, list, now) {
  const next = { ...changed };
  let dirty = false;
  for (const a of list) {
    const s = a.status === "done" ? "idle" : a.status;
    if (next[a.address]?.s === s) continue;
    next[a.address] = { s, at: now };
    dirty = true;
  }
  if (!dirty) return null;
  // Gone and old only: the list alone is empty right after a start.
  const listed = new Set(list.map((a) => a.address));
  for (const [k, c] of Object.entries(next)) if (!listed.has(k) && now - c.at > KEEP_CHANGED_MS) delete next[k];
  return next;
}

// The host's part: stamp the change times every second.
export class AgentsEngine {
  start(cx) {
    this.tick();
    cx.timer.every(1000, () => this.tick());
  }

  tick() {
    const next = track(read(KEYS.changed, {}), agents(), Date.now());
    if (next) write(KEYS.changed, next);
  }
}

// The list in order: pinned first, then by urgency (priority sort) or as agents() has them
// (grouped by space). A kept sub-agent with a pane is in agents() too: where a tree shows it,
// it gets no row of its own unless it is pinned.
export function ordered(list, all, changed, byPriority, rail) {
  const listed = new Map(list.map((a) => [a.address, a.status]));
  const nested = new Set(rail ? [] : list.flatMap((a) => tree(all, a.address).map((s) => s.t.address)));
  list = list.filter((a) => a.pinned || !nested.has(a.address));
  const urgency = new Map(list.map((a) => [a.address, Math.max(RANK[a.status] ?? 0, ...tree(all, a.address).map((s) => RANK[kidStatus(s.t, listed)] ?? 0))]));
  const since = (a) => changed[a.address]?.at ?? 0;
  if (byPriority) list = [...list].sort((x, y) => urgency.get(y.address) - urgency.get(x.address) || since(y) - since(x) || y.seq - x.seq);
  const pinned = list.filter((a) => a.pinned), rest = list.filter((a) => !a.pinned);
  return { list: [...pinned, ...rest], pinned, rest, urgency, listed };
}

// Groups in list order: priority sections or spaces. Agents of a space are next to each other in
// agents(), so neighbours make a group.
export function groups(pinned, rest, urgency, byPriority) {
  const out = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
  for (const a of rest) {
    const r = urgency.get(a.address) || RANK.idle;
    const id = byPriority ? `sec-${r}` : `sp-${a.space}`;
    if (out.at(-1)?.id === id) out.at(-1).members.push(a);
    else out.push({ id, label: byPriority ? SECTION[r] : a.space_name || "", status: byPriority ? SECTION_STATUS[r] : null, members: [a] });
  }
  return out;
}

// Each row's label (its tab's name or the agent's title) and detail: a tab someone named or the
// agent's own title, never an automatic tab number unless two rows would read the same.
export function labels(list, panes, spaces) {
  const tabCounts = new Map();
  for (const a of list) tabCounts.set(a.tab, (tabCounts.get(a.tab) ?? 0) + 1);
  const leads = leadPanes(panes);
  const tabs = new Map(spaces.flatMap((s) => s.tabs ?? []).map((tab) => [tab.id, tab]));
  const label = new Map(list.map((a) => {
    const tab = tabs.get(a.tab);
    const many = tabCounts.get(a.tab) > 1;
    return [a.address, tab ? tabTitle(many ? { ...tab, named: false } : tab, many ? a : leads.get(a.tab)) : (a.title || a.program?.name || "")];
  }));
  const detail = new Map(list.map((a) => [a.address, /^\d+$/.test(label.get(a.address)) ? null : label.get(a.address)]));
  const seen = {};
  for (const a of list) { const k = `${a.space_name}\u0000${detail.get(a.address) ?? ""}`; seen[k] = (seen[k] ?? 0) + 1; }
  for (const a of list) if (detail.get(a.address) == null && seen[`${a.space_name}\u0000`] > 1) detail.set(a.address, label.get(a.address));
  return { label, detail };
}
