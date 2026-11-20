// What the Artifacts panel shows: which agents it follows, the scan of their Claude Code
// conversations (bin/artifacts.py), and the search over the result.
//
// From herdr-artifacts at 7d85899, artifacts/main.js (MIT, see NOTICE). Changed for helm: the
// pure parts taken out of the panel, and each machine's agents scanned on that machine.
import { spaces, agents, focused, exec, appHome } from "herdr";
import { machineOf } from "../lib/names.js";

export const REFRESH_MS = 4000;

// The core address without a machine prefix, as hc there knows it.
export const local = (address) => (address.includes("/") ? address.split("/")[1] : address);

export function ago(ts, now = Date.now()) {
  if (!ts) return "";
  const d = Math.max(0, now / 1000 - ts);
  if (d < 60) return "now";
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)}d`;
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// The agents of the shown space: the selected one first, then pinned, then by tab.
export function spaceAgents() {
  const space = spaces().find((s) => s.active);
  const f = focused();
  const list = agents().filter((a) => !space || a.space === space.id);
  const isSelected = (a) => a.address === f?.agent || a.address === f?.terminal || a.focused;
  list.sort((a, b) => Number(isSelected(b)) - Number(isSelected(a)) || Number(b.pinned) - Number(a.pinned) || a.tab_index - b.tab_index);
  return { list, selected: list.find(isSelected) ?? null };
}

// The agents a view shows: the selected one (or the space's first), or every agent in the space.
export function shownAgents(scope) {
  const { list, selected } = spaceAgents();
  if (scope === "space") return list;
  if (selected) return [selected];
  return list.slice(0, 1);
}

const scriptFor = (machine) => (machine
  ? '"${HERDR_APP_HOME:-$HOME/.config/herdr-app}/mods/helm/bin/artifacts.py"'
  : `"${appHome()}/mods/helm/bin/artifacts.py"`);

// Scan these agents, each machine's on that machine. Resolves with { byAddress, errors }, keyed
// by the full address ("box/t7" for another machine).
export async function scan(addresses) {
  const byMachine = new Map();
  for (const a of addresses) {
    const m = machineOf(a);
    if (!byMachine.has(m)) byMachine.set(m, []);
    byMachine.get(m).push(a);
  }
  const byAddress = {}, errors = [];
  for (const [m, list] of byMachine) {
    const r = await exec("sh", ["-c", `exec python3 -I ${scriptFor(m)} --terminals "$1"`, "artifacts", list.map(local).join(",")], m ? { on: m } : {});
    if (r.code !== 0) { errors.push((r.stderr || r.stdout).trim().split("\n").pop() || `exit ${r.code}`); continue; }
    const data = JSON.parse(r.stdout);
    for (const t of data.terminals ?? []) byAddress[m ? `${m}/${t.address}` : t.address] = t;
    if (data.errors?.length) errors.push(...data.errors);
  }
  return { byAddress, errors };
}

// Everything the view shows, matched against the query: artifacts first (the finished work), then
// links; within each, title matches before matches on a path, URL or tab, then newest first.
export function search(query, shown, byAddress, single) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const out = [];
  // Every word must appear somewhere; the best field it appears in sets the rank.
  const score = (fields) => {
    let total = 0;
    for (const w of words) {
      let best = 0;
      for (const [text, weight] of fields) {
        const i = text.indexOf(w);
        if (i < 0) continue;
        const rank = weight + (i === 0 ? 2 : text[i - 1] === " " || text[i - 1] === "/" || text[i - 1] === "-" ? 1 : 0);
        if (rank > best) best = rank;
      }
      if (!best) return 0;
      total += best;
    }
    return total;
  };
  for (const agent of shown) {
    const s = byAddress[agent.address];
    if (!s) continue;
    const tab = (agent.tab_name || agent.title || "").toLowerCase();
    for (const a of [...(s.published ?? []), ...(s.touched ?? [])]) {
      const rank = score([[a.title.toLowerCase(), 10], [(a.path || "").toLowerCase(), 5], [(a.description || "").toLowerCase(), 4], [a.url.toLowerCase(), 3], [tab, 2]]);
      if (rank) out.push({ kind: "artifact", rank: 1000 + rank, ts: a.last_ts, url: a.url, title: a.title || a.url, agent, item: a,
        detail: [single ? null : agent.tab_name || agent.title, a.path || a.url.replace(/^https:\/\//, ""), a.description].filter(Boolean) });
    }
    for (const l of s.links ?? []) {
      const rank = score([[l.title.toLowerCase(), 10], [l.url.toLowerCase(), 4], [(l.host || "").toLowerCase(), 3], [tab, 2]]);
      if (rank) out.push({ kind: "link", rank, ts: l.last_ts, url: l.url, title: l.title, agent, item: l,
        detail: [single ? null : agent.tab_name || agent.title, l.url.replace(/^https?:\/\/(www\.)?/, "")].filter(Boolean) });
    }
  }
  out.sort((a, b) => b.rank - a.rank || b.ts - a.ts);
  return out.slice(0, 60);
}

// An artifact row's tag: its version, "earlier" (published before a compaction cut the record),
// or "seen" (opened but not published here).
export function tag(a) {
  const published = a.publishes > 0 || Boolean(a.summarized);
  return published ? (a.version ? `v${a.version}` : "earlier") : "seen";
}
