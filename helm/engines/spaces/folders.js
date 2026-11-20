// Space folders: each machine keeps its folders in ~/.config/herdr-space-folders.json in its own
// home, so every screen that shows its spaces shows the same folders:
//   { list: [{ id, name, folded, color, path, match }], of: { spaceId: folderId | "" }, at }
// with space ids as that machine knows them. helm mirrors the files in shared "helm.folders",
// keyed by machine ("" is this computer), so every part sees a change at once. The file keeps
// its path and format from the old space-folders mod, so both can run on it during the switch;
// helm adds no top-level fields to it (PLAN.md 3.1).
//
// From herdr-space-folders at 63a78b2 (MIT, see NOTICE), itself built on the Herdr app's
// spaces mod (Apache-2.0). Changed for helm: split out of the sidebar into a module of
// functions, the mirror moved to helm.folders, and worktree nesting dropped.
import { exec, spaces, run, setShared } from "herdr";
import { KEYS, read, write } from "../../lib/store.js";
import { localId } from "../../lib/names.js";

export const FILE = "~/.config/herdr-space-folders.json";
export const key = (machine) => machine ?? "";
export const all = () => read(KEYS.folders, {});
export const folders = (machine) => all()[key(machine)] ?? { list: [], of: {} };

// Where a space works now: its first terminal's live folder, else where it was made.
// `ps` is panes(), read once by the caller (every read copies every pane).
export function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}

// One rule of "Collect spaces from": a folder and everything in it. "~" is any home, "*" any
// one folder name, and a rule that starts with neither "/" nor "~" is a folder name at any depth.
export function rule(pattern) {
  const p = pattern.trim().replace(/\/+$/, "");
  if (!p) return null;
  const body = p.replace(/^~/, "\u0000").split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")
    .replace("\u0000", "(?:/home/[^/]+|/Users/[^/]+|/root)");
  return new RegExp(`${/^[/~]/.test(p) ? "^" : "(?:^|/)"}${body}(?:/|$)`);
}

export const collects = (f, path) => Boolean(path) && (f.match ?? "").split(",").some((p) => rule(p)?.test(path));

// How deep into the path a folder's rules reach; 0 when none match.
export const reach = (f, path) => !path ? 0 : Math.max(0, ...(f.match ?? "").split(",").map((p) => {
  const m = rule(p)?.exec(path);
  return m ? 1 + m.index + m[0].replace(/\/$/, "").length : 0;
}));

// The folder whose rules reach deepest; the first one on a tie.
export function deepest(list, score) {
  let best = null, most = 0;
  for (const f of list) { const n = score(f); if (n > most) { best = f; most = n; } }
  return best?.id ?? null;
}

// Where a space goes: where it was dragged ("" means out of every folder), else the folder
// whose rules reach deepest into the folder it works in.
export function folderOf(s, { list, of }, ps) {
  const id = of[localId(s)];
  if (id !== undefined) return list.some((f) => f.id === id) ? id : null;
  return deepest(list, (f) => reach(f, place(s, ps)));
}

// The folder on this computer that takes in another machine: the first whose rules match the
// machine's name or the folder one of its spaces works in.
export function machineFolder(localFolders, m, rows, ps) {
  return localFolders.list.find((f) => collects(f, m) || rows.some((r) => collects(f, place(r.w, ps))))?.id ?? null;
}

export function parse(text) {
  try {
    const d = JSON.parse(text);
    return { list: d.list ?? [], of: d.of ?? {}, at: d.at ?? 0 };
  } catch { return null; }
}

export async function readFile(machine) {
  const r = await exec("sh", ["-c", `cat ${FILE} 2>/dev/null`], { on: machine });
  return parse(r.stdout);
}

// Save one machine's folders: the mirror at once, the file in the background.
export function save(machine, data) {
  const next = { list: data.list, of: data.of, at: Date.now() };
  write(KEYS.folders, { ...all(), [key(machine)]: next });
  exec("sh", ["-c", `mkdir -p ~/.config && printf '%s\\n' "$1" > ${FILE}.tmp && mv ${FILE}.tmp ${FILE}`, "sh", JSON.stringify(next)], { on: machine })
    .catch(() => null);
}

// Merge freshly read files into the mirror: a file wins only when it is newer than the mirror
// (a save on its way here is newer still). `reads` maps machine key to the parsed file or null.
export function merge(mirror, reads) {
  const out = { ...mirror };
  for (const [k, file] of Object.entries(reads)) if (file && (!out[k] || file.at > (out[k].at ?? 0))) out[k] = file;
  return out;
}

// A machine's home, asked once, for a start folder written with "~".
const homes = {};
async function expand(machine, path) {
  if (!path?.startsWith("~")) return path;
  homes[key(machine)] ??= (await exec("sh", ["-c", 'printf %s "$HOME"'], { on: machine })).stdout.trim();
  return homes[key(machine)] + path.slice(1);
}

// A new space for a folder, in its start folder; with no folder (id null), one in none. Herdr
// names no id back, so the spaces engine gives the first space that appears on that machine
// its place (see adopt in order.js).
export async function newSpaceIn(machine, id) {
  setShared(KEYS.foldersNew, { machine, id, before: spaces().map((s) => s.id), until: Date.now() + 60000 });
  const path = id && folders(machine).list.find((f) => f.id === id)?.path;
  const folder = path ? await expand(machine, path).catch(() => null) : null;
  run("space.new", { ...(machine ? { machine } : {}), ...(folder ? { folder } : {}) });
}

// Edits, each one save.
export function reorder(machine, from, to) {
  const f = folders(machine), list = [...f.list];
  const i = list.findIndex((x) => x.id === from), j = list.findIndex((x) => x.id === to);
  if (i < 0 || j < 0) return;
  list.splice(j, 0, ...list.splice(i, 1));
  save(machine, { ...f, list });
}

export function paint(machine, id, color) {
  const f = folders(machine);
  save(machine, { ...f, list: f.list.map((x) => (x.id === id ? { ...x, color } : x)) });
}

export function toggle(machine, id) {
  const f = folders(machine);
  save(machine, { ...f, list: f.list.map((x) => (x.id === id ? { ...x, folded: !x.folded } : x)) });
}

export function remove(machine, id) {
  const f = folders(machine);
  save(machine, { list: f.list.filter((x) => x.id !== id), of: Object.fromEntries(Object.entries(f.of).filter(([, v]) => v !== id)) });
}

// A space dropped into folder `id`, or out of every folder (id null). Out of a folder its
// rules would put it in, it is stored as "" so it stays out.
export function drop(space, id, ps) {
  const machine = space?.machine ?? null, f = folders(machine);
  if (!space || (id && !f.list.some((x) => x.id === id))) return;
  const of = { ...f.of };
  if (id) of[localId(space)] = id;
  else if (folderOf(space, f, ps)) of[localId(space)] = "";
  else delete of[localId(space)];
  save(machine, { ...f, of });
}

// Save the edit dialog: a new folder (fresh) is made only now; one deleted while its dialog
// was open is not made again.
export function saveEdit(machine, id, fresh, { name, path, match }, defaultName) {
  const f = folders(machine);
  const list = fresh && !f.list.some((x) => x.id === id) ? [...f.list, { id, name: defaultName, folded: false }] : f.list;
  save(machine, { ...f, list: list.map((x) => (x.id === id ? { ...x, name: name || x.name, path, match } : x)) });
}
