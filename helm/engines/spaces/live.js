// The spaces list built from the live app data: what the sidebar draws and what the next and
// previous keys follow. Every caller (the spaces part, the host's commands and tick) gets the
// same list from the same inputs.
import { spaces, panes, machines, terminals } from "herdr";
import { build } from "./order.js";
import { folders } from "./folders.js";
import { frozenSpaces } from "../freeze.js";
import { KEYS, read, prefs } from "../../lib/store.js";

export function liveList() {
  const p = prefs();
  const frozen = frozenSpaces(terminals(), read(KEYS.freeze, {}));
  const list = build({
    spaces: spaces(),
    panes: panes(),
    known: read(KEYS.machines, []),
    layouts: machines(),
    foldersOf: folders,
    machinesFolded: new Set(p.machinesFolded ?? []),
    hideFrozen: Boolean(p.hideFrozen),
    frozen,
  });
  return { ...list, frozen };
}

// The avatar colour of every space: kept in shared "space.colors" (Herdr's picker and spaces
// mods read it too). A new space gets the colour fewest spaces have; spaces named "~" get none.
export const PALETTE = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
export function assignColors(sp, colors) {
  const ids = new Set(sp.map((s) => s.id));
  const kept = Object.fromEntries(Object.entries(colors ?? {}).filter(([id]) => ids.has(id)));
  for (const s of sp) {
    if (kept[s.id] || s.name === "~") continue;
    const uses = (c) => Object.values(kept).filter((v) => v === c).length;
    kept[s.id] = PALETTE.reduce((best, c) => (uses(c) < uses(best) ? c : best));
  }
  return kept;
}
