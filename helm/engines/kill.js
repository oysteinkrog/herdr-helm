// Kill and Revive of whole spaces, the deeper sleep below Freeze and Thaw. The work is done by
// space-kill (dotfiles bin/) on the machine that owns the space: `space-kill kill SPACE` closes
// the space and keeps its Claude sessions, name, folder and worktree record; `space-revive SPACE`
// makes a new space from that record; `space-killed` lists the records. helm keeps the lists of
// every machine in shared "helm.killed" (an array of records, each with its `machine`).
import { exec, shared } from "herdr";
import { KEYS, read, write } from "../lib/store.js";

// Run from the user's own bin folder: `exec ... { on }` does not always have ~/bin on PATH.
const tool = (name) => `"$HOME/bin/${name}"`;

// One of the space-kill commands on a machine; resolves with its JSON output or throws with its
// error text ({error} on stdout, else stderr).
export async function killSh(machine, name, ...args) {
  const r = await exec("bash", ["-c", `${tool(name)} "$@"`, name, ...args], { on: machine, timeout: 300000 });
  let out = null;
  try { out = JSON.parse(r.stdout); } catch { /* not JSON */ }
  if (out?.error) throw new Error(out.error);
  if (r.code !== 0 || out === null) {
    if (r.code === 127) throw new Error(`${name} is not installed on ${machine ?? "this computer"}`);
    throw new Error(r.stderr.trim().split("\n").at(-1) || `${name} failed`);
  }
  return out;
}

export const kill = (machine, space) => killSh(machine, "space-kill", "kill", space);
export const revive = (machine, space) => killSh(machine, "space-revive", space);
// Takes a record off the killed list without reviving it (the engine keeps it under revived/).
export const forgetRecord = (machine, space) => killSh(machine, "space-kill", "forget", space);

// One machine's `space-killed` folded into the list, replacing that machine's records. Newest
// kill first.
export function mergeKilled(list, machine, records) {
  const out = (list ?? []).filter((k) => (k.machine ?? null) !== machine);
  for (const k of records ?? []) out.push({ ...k, machine });
  return out.sort((a, b) => String(b.killed_at ?? "").localeCompare(String(a.killed_at ?? "")));
}

export const bumpKilled = () => write(KEYS.killedRev, (shared(KEYS.killedRev) ?? 0) + 1);

// Re-read one machine's killed spaces.
export async function refreshKilled(machine) {
  const records = await killSh(machine, "space-killed");
  write(KEYS.killed, mergeKilled(read(KEYS.killed, []), machine, records));
  bumpKilled();
}

// Drop one record at once, before space-killed is read again.
export function dropKilled(machine, space) {
  write(KEYS.killed, read(KEYS.killed, []).filter((k) => !((k.machine ?? null) === machine && k.space === space)));
  bumpKilled();
}

// The background read of every machine. A machine that does not answer keeps what it had.
export async function loadKilled(machineNames) {
  const rev = shared(KEYS.killedRev) ?? 0;
  let list = read(KEYS.killed, []);
  for (const m of [null, ...machineNames]) {
    const records = await killSh(m, "space-killed").catch(() => null);
    if (Array.isArray(records)) list = mergeKilled(list, m, records);
  }
  if ((shared(KEYS.killedRev) ?? 0) !== rev) return false;
  return write(KEYS.killed, list);
}

// "5m ago", "3h ago", "2d ago", or the date, for an ISO time.
export function when(iso, now = Date.now()) {
  const at = Date.parse(iso ?? "");
  if (!Number.isFinite(at)) return "";
  const d = Math.max(0, (now - at) / 1000);
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
