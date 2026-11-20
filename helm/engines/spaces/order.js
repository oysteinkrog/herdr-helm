// The spaces list as data: which rows the sidebar shows, in which order, and where each space
// sits (machine, folder). The sidebar draws build()'s items; the next and previous keys and the
// "space above" rule use its `seen` list, so they follow the list as shown even when the sidebar
// is folded. Also the new-space rules: a space made from a folder goes in it, a space made from
// the front space goes under it, and when the front space closes the one above it is shown.
//
// From herdr-space-folders at 63a78b2 (MIT, see NOTICE). Changed for helm: the list is built as
// plain data by pure functions (the old mod built it while drawing), and worktree nesting is
// dropped (PLAN.md 9).
import { folderOf, machineFolder } from "./folders.js";

// A machine's spaces are still coming in.
export function machineLoading(m, known, layouts) {
  const layout = layouts.find((k) => k.name === m)?.layout;
  return layout === "loading" || (!layout && known.some((k) => k.name === m && k.state === "connected"));
}

// in: { spaces, panes, known (hc machine ls, no temporary ones), layouts (machines()),
//       foldersOf(machine), machinesFolded (Set), hideFrozen, frozen (Set of space ids) }
// out: { items, seen, hiddenFrozen }
//   items: { type: "machine" | "folder" | "space" | "loading" | "empty", ... } in drawing order
//   seen:  every space in list order: { id, machine, shown, folder }
export function build(input) {
  const { spaces: sp, panes: ps, known, layouts, foldersOf, machinesFolded, hideFrozen, frozen } = input;
  const seen = [];
  let hiddenFrozen = 0;
  // A frozen space the list leaves out now: hiding is on and it is not the one in front.
  const away = (w) => hideFrozen && !w.active && frozen.has(w.id);

  const foldered = (rows, machine, { guests = [], nested = false, hidden = false } = {}) => {
    const draw = (r, gone) => {
      const frozenAway = away(r.w);
      if (frozenAway && !hidden) hiddenFrozen++;
      const out = gone || frozenAway;
      seen.push({ id: r.w.id, machine: r.w.machine ?? null, shown: !out, folder: r.folder });
      return out ? [] : [{ type: "space", key: `space-${r.w.id}`, space: r.w, index: r.i, folder: r.folder, nested, frozen: frozen.has(r.w.id) }];
    };
    const f = foldersOf(machine);
    const placed = rows.map((r) => ({ ...r, folder: folderOf(r.w, f, ps), nested }));
    return [
      ...f.list.flatMap((folder, n) => {
        const inside = placed.filter((r) => r.folder === folder.id);
        const visitors = guests.filter((g) => g.folder === folder.id);
        const counted = [...inside, ...visitors.flatMap((g) => g.rows)];
        const gone = hidden || folder.folded;
        // A folder that holds only hidden frozen spaces goes too.
        const allAway = counted.length > 0 && counted.every((r) => away(r.w));
        return [
          ...(hidden || allAway ? [] : [{ type: "folder", key: `folder-${key(machine)}-${folder.id}`, folder, machine, n, nested, spaces: counted.map((r) => r.w) }]),
          ...inside.flatMap((r) => draw(r, gone)),
          ...visitors.flatMap((g) => machineSection(g.m, g.rows, { nested: true, hidden: gone })),
        ];
      }),
      ...placed.filter((r) => !r.folder).flatMap((r) => draw(r, hidden)),
    ];
  };

  const machineSection = (m, mine, { nested = false, guests = [], hidden = false } = {}) => {
    const machine = known.find((k) => k.name === m);
    const connected = !m || machine?.state === "connected";
    const folded = machinesFolded.has(m);
    const head = { type: "machine", key: `machine-${m ?? "local"}`, machine: m, nested, connected, state: machine?.state ?? null, folded };
    // Always built, so `seen` has every space even when the machine is folded.
    const body = mine.length || guests.length ? foldered(mine, m, { guests, nested, hidden: hidden || folded })
      : [machineLoading(m, known, layouts) ? { type: "loading", key: `loading-${m ?? "local"}`, machine: m } : { type: "empty", key: `empty-${m ?? "local"}`, machine: m, nested }];
    return hidden ? [] : [head, ...(folded ? [] : body)];
  };

  const rows = sp.map((w, i) => ({ w, i }));
  const remote = [...new Set([...rows.map((r) => r.w.machine).filter(Boolean), ...known.map((m) => m.name)])].sort();
  const local = foldersOf(null);
  const guests = remote.map((m) => {
    const mine = rows.filter((r) => r.w.machine === m);
    return { m, rows: mine, folder: machineFolder(local, m, mine, ps) };
  });
  const housed = guests.filter((g) => g.folder);
  const loose = guests.filter((g) => !g.folder);
  const here = rows.filter((r) => !r.w.machine);
  let items;
  if (!loose.length) {
    items = machineLoading(null, known, layouts) && !here.length && !housed.length
      ? [{ type: "loading", key: "loading-local", machine: null }]
      : foldered(here, null, { guests: housed });
  } else {
    items = [...machineSection(null, here, { guests: housed }), ...loose.flatMap((g) => machineSection(g.m, g.rows))];
  }
  return { items, seen, hiddenFrozen };
}

const key = (machine) => machine ?? "local";

// One space down (dir 1) or up (dir -1) from `activeId` in `seen`, past spaces that are not
// shown, round from the end to the top. Returns the id to select, or null.
export function step(seen, activeId, dir) {
  const len = seen.length;
  if (!len) return null;
  const at = seen.findIndex((s) => s.id === activeId);
  const from = at >= 0 ? at : dir > 0 ? -1 : len;
  for (let n = 1; n <= len; n++) {
    const s = seen[(((from + dir * n) % len) + len) % len];
    if (s.shown) return s.id;
  }
  return null;
}

// The space to show when `id` closes: the one above it in the list, else the one below.
export function near(seen, id) {
  const list = seen.filter((e) => e.shown || e.id === id), i = list.findIndex((e) => e.id === id);
  return i < 0 ? null : (list[i - 1] ?? list[i + 1])?.id ?? null;
}

// Tracks new spaces between ticks and decides what to do with them. It returns actions; the
// host carries them out (saving folders, space.move, space.select), so this stays testable.
export class NewSpaces {
  constructor(ids = []) {
    this.known = new Set(ids);
    this.front = null;   // { id, machine, folder, near } of the space in front at the last tick
    this.coming = {};    // new space id -> { at, from: front then }
  }

  // sp: spaces(); seen: build().seen; want: shared helm.folders.new; folderAt(space): its folder now.
  tick(sp, seen, now, want, folderAt) {
    const actions = [];
    // The front space closed: show the space above it in the list.
    const was = this.front;
    if (was?.id && !sp.some((s) => s.id === was.id)) {
      this.front = null;
      if (was.near && sp.some((s) => s.id === was.near)) actions.push({ type: "select", id: was.near });
    }
    // A space made from a folder (its + or menu): the first new space on that machine.
    let made = null;
    if (want) {
      const on = (s) => !want.id || (s.machine ?? null) === (want.machine ?? null);
      const before = new Set(want.before);
      const fresh = sp.find((s) => !before.has(s.id) && on(s));
      if (fresh || now > want.until) actions.push({ type: "clear-new" });
      if (fresh) {
        made = fresh.id;
        if (want.id) actions.push({ type: "put", machine: want.machine ?? null, space: fresh, folder: want.id });
      }
    }
    // A space made from the front space (keys, palette) goes under it: a single new space that
    // comes to the front within 3 s, on the same machine, not one a + made.
    const fresh = sp.filter((s) => !this.known.has(s.id));
    for (const s of fresh) {
      this.known.add(s.id);
      if (fresh.length === 1 && s.id !== made && this.front) this.coming[s.id] = { at: now, from: this.front };
    }
    for (const [id, c] of Object.entries(this.coming)) if (now - c.at > 3000) delete this.coming[id];
    const front = sp.find((s) => s.active), c = front && this.coming[front.id];
    if (c) {
      delete this.coming[front.id];
      if ((front.machine ?? null) === c.from.machine) {
        if (c.from.folder) actions.push({ type: "put-if-unset", machine: c.from.machine, space: front, folder: c.from.folder });
        const i = sp.findIndex((w) => w.id === c.from.id), j = sp.findIndex((w) => w.id === front.id);
        if (i >= 0 && j >= 0 && j !== i + 1) actions.push({ type: "move", id: front.id, index: j > i ? i + 2 : i + 1 });
      }
    }
    // A space just made is not where the next one comes from until it shows.
    if (front && !fresh.some((s) => s.id === front.id)) {
      const shown = seen.find((e) => e.id === front.id);
      this.front = { id: front.id, machine: front.machine ?? null, folder: shown ? shown.folder : folderAt(front), near: near(seen, front.id) };
    }
    return actions;
  }
}
