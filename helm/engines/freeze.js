// Freeze and Thaw of whole spaces. The work is done by bin/freeze.sh on the machine that owns the
// space; it puts the label herdr.frozen on every terminal it stops and keeps its state in
// ~/.local/state/space-freeze/ there. herdr-core syncs labels between machines and terminals()
// is live, so the labels are the main source. The state files, mirrored in shared "helm.freeze"
// ({ spaceId: { count, at, addresses } }), are the fallback for a frozen terminal that is gone.
//
// From the space-freeze mod and herdr-space-folders' frozen-space code (ours, and MIT, see
// NOTICE). Changed for helm: one module, the script inside helm, and a version check.
import { exec, appHome, shared } from "herdr";
import { KEYS, read, write } from "../lib/store.js";

export const SCRIPT_VERSION = "1";

// Frozen spaces as app space ids ("box/sp1" for another machine). A label on a live terminal
// counts; the mirror counts only when a terminal it lists is no longer live, so an old copy of
// it never shows a space as frozen while its terminals live.
export function frozenSpaces(terms, mirror) {
  const frozen = new Set(), live = new Set();
  for (const t of terms) {
    if (t.state !== "live") continue;
    live.add(t.address);
    const sp = t.labels?.["herdr.space"];
    if (!sp || !t.labels?.["herdr.frozen"]) continue;
    const slash = t.address.indexOf("/");
    frozen.add(slash > 0 ? `${t.address.slice(0, slash)}/${sp}` : sp);
  }
  for (const [id, f] of Object.entries(mirror ?? {})) {
    if (frozen.has(id)) continue;
    const m = id.includes("/") ? id.split("/")[0] : null;
    if ((f?.addresses ?? []).some((a) => !live.has(m ? `${m}/${a}` : a))) frozen.add(id);
  }
  return frozen;
}

// Frozen terminals by address: every live terminal with the herdr.frozen label (later, for the
// agent and tab rows; PLAN.md 2.7).
export function frozenTerminals(terms) {
  return new Set(terms.filter((t) => t.state === "live" && t.labels?.["herdr.frozen"]).map((t) => t.address));
}

const scriptFor = (machine) => (machine
  ? '"${HERDR_APP_HOME:-$HOME/.config/herdr-app}/mods/helm/bin/freeze.sh"'
  : `"${appHome()}/mods/helm/bin/freeze.sh"`);

// One machine's `freeze.sh list` folded into the mirror, replacing that machine's entries.
export function mergeList(mirror, machine, list) {
  const out = Object.fromEntries(Object.entries(mirror ?? {}).filter(([id]) => (id.includes("/") ? id.split("/")[0] : null) !== machine));
  for (const f of list) out[(machine ? `${machine}/` : "") + f.space] = { count: f.count, at: f.frozen_at, addresses: f.addresses ?? [] };
  return out;
}

// freeze.sh on a machine; resolves with its JSON output or throws with its error.
export async function freezeSh(machine, ...args) {
  const r = await exec("bash", ["-c", `bash ${scriptFor(machine)} "$@"`, "freeze.sh", ...args], { on: machine, timeout: 120000 });
  if (args[0] === "version") {
    if (r.code !== 0) throw new Error(`helm is not installed on ${machine ?? "this computer"}: no freeze.sh there`);
    return r.stdout.trim();
  }
  let out = null;
  try { out = JSON.parse(r.stdout); } catch { /* not JSON */ }
  if (r.code !== 0 || out === null) throw new Error(out?.error ?? (r.stderr.trim() || `freeze.sh ${args[0]} failed`));
  return out;
}

// Freeze and Thaw only run when the script on that machine is the version this helm expects:
// the office and the other desktop each run their own copy.
export async function checkVersion(machine) {
  const v = await freezeSh(machine, "version");
  if (v !== SCRIPT_VERSION) throw new Error(`freeze.sh on ${machine ?? "this computer"} is version ${v}, this helm needs ${SCRIPT_VERSION}: install the same helm there`);
}

// Every change made here bumps a revision, so a slower background read that started before it
// can tell its result is older and drop it.
export const bump = () => write(KEYS.freezeRev, (shared(KEYS.freezeRev) ?? 0) + 1);

// Re-read one machine's frozen spaces into the mirror.
export async function refresh(machine) {
  const list = await freezeSh(machine, "list");
  write(KEYS.freeze, mergeList(read(KEYS.freeze, {}), machine, list));
  bump();
}

// Mark one space frozen or thawed in the mirror at once, before freeze.sh is read again.
export function mark(spaceId, frozen) {
  const mirror = { ...read(KEYS.freeze, {}) };
  if (frozen) mirror[spaceId] = frozen; else delete mirror[spaceId];
  write(KEYS.freeze, mirror);
  bump();
}

// The background read of every machine (the host runs it at start, every 60 s, and when this
// machine's state folder changes). A machine that does not answer keeps what it had.
export async function loadAll(machineNames) {
  const rev = shared(KEYS.freezeRev) ?? 0;
  let mirror = read(KEYS.freeze, {});
  for (const m of [null, ...machineNames]) {
    const r = await exec("bash", ["-c", `bash ${scriptFor(m)} list`], { on: m }).catch(() => null);
    let list = null;
    try { list = r?.code === 0 ? JSON.parse(r.stdout) : null; } catch { list = null; }
    if (list) mirror = mergeList(mirror, m, list);
  }
  if ((shared(KEYS.freezeRev) ?? 0) !== rev) return false;
  return write(KEYS.freeze, mirror);
}
