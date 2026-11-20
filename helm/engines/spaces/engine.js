// The spaces engine, run by the host copy: it keeps the machine list, the folder files and the
// frozen-space mirror up to date, gives new spaces their colour and place, and shows the space
// above when the front one closes.
//
// Intervals, as in the old space-folders mod: machines and folder files every 15 s, frozen
// state every 60 s and when this machine's state folder changes, new-space rules every 250 ms.
import { hc, spaces, panes, run, watchFolder, home, shared } from "herdr";
import { KEYS, FOREIGN, read, write } from "../../lib/store.js";
import { folders, readFile, merge, save, folderOf, key } from "./folders.js";
import { NewSpaces } from "./order.js";
import { liveList, assignColors } from "./live.js";
import { loadAll } from "../freeze.js";
import { localId } from "../../lib/names.js";

export class SpacesEngine {
  start(cx) {
    this.news = new NewSpaces(spaces().map((s) => s.id));
    this.machines(cx);
    cx.timer.every(15000, (cx) => this.machines(cx));
    this.folders(cx);
    cx.timer.every(15000, (cx) => this.folders(cx));
    this.frozen(cx);
    cx.timer.every(60000, (cx) => this.frozen(cx));
    cx.spawn(async (cx) => {
      try {
        for (;;) { const got = await watchFolder(`${home()}/.local/state/space-freeze`); if (!got?.length) break; this.frozen(cx); }
      } catch { /* no such folder yet: the 60 s timer covers it */ }
    });
    cx.timer.every(250, () => this.tick());
  }

  machines(cx) {
    cx.spawn(async () => {
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code === 0) write(KEYS.machines, (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary).map((m) => ({ name: m.name, state: m.state })));
      } catch { /* keep the last list */ }
    });
  }

  // Each connected machine's folder file, read again; a newer copy here (a save on its way) wins.
  folders(cx) {
    const names = [null, ...read(KEYS.machines, []).filter((m) => m.state === "connected").map((m) => m.name)];
    cx.spawn(async () => {
      const reads = {};
      for (const m of names) reads[key(m)] = await readFile(m).catch(() => null);
      write(KEYS.folders, merge(read(KEYS.folders, {}), reads));
    });
  }

  frozen(cx) {
    cx.spawn(async () => { await loadAll(read(KEYS.machines, []).map((m) => m.name)).catch(() => null); });
  }

  tick() {
    const sp = spaces();
    write(FOREIGN.spaceColors, assignColors(sp, shared(FOREIGN.spaceColors)));
    const { seen } = liveList();
    const ps = panes();
    const actions = this.news.tick(sp, seen, Date.now(), read(KEYS.foldersNew, null), (s) => folderOf(s, folders(s.machine ?? null), ps));
    for (const a of actions) {
      if (a.type === "select") run("space.select", { id: a.id });
      else if (a.type === "move") run("space.move", { id: a.id, index: a.index });
      else if (a.type === "clear-new") write(KEYS.foldersNew, null);
      else if (a.type === "put" || a.type === "put-if-unset") {
        const f = folders(a.machine);
        if (!f.list.some((x) => x.id === a.folder)) continue;
        if (a.type === "put-if-unset" && f.of[localId(a.space)] !== undefined) continue;
        save(a.machine, { ...f, of: { ...f.of, [localId(a.space)]: a.folder } });
      }
    }
  }
}
