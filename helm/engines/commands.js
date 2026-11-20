// The key commands that act on the whole window (PLAN.md 2.5). The status part owns them: the
// krog layout always shows the status bar, and a key reaches only shown copies (PLAN.md 2.9).
import { spaces, notify, run } from "herdr";
import { prefs, setPref } from "../lib/store.js";
import { togglePanel } from "../lib/layout.js";
import { liveList } from "./spaces/live.js";
import { step } from "./spaces/order.js";

export class Commands {
  constructor() {
    this.cur = null;
    this.prev = null;
    this.extra = {}; // name -> handler, added by other engines (asks)
  }

  // Remember the space shown before this one, for space-back (like alt-tab between two spaces).
  track() {
    const id = spaces().find((s) => s.active)?.id ?? null;
    if (!id || id === this.cur) return;
    if (this.cur) this.prev = this.cur;
    this.cur = id;
  }

  // Select a space from a key. The spaces list sees the front space change without a click on its
  // row, and brings it into view if it is off screen (PLAN.md 2.6a).
  select(id) {
    run("space.select", { id });
  }

  run(c) {
    this.track();
    const active = spaces().find((s) => s.active)?.id ?? null;
    switch (c) {
      case "space-next":
      case "space-prev": {
        const id = step(liveList().seen, active, c === "space-next" ? 1 : -1);
        if (id && id !== active) this.select(id);
        return true;
      }
      case "space-back":
        if (!this.prev || !spaces().some((s) => s.id === this.prev)) notify({ title: "No previous space", timeout: 2500 });
        else this.select(this.prev);
        return true;
      case "hide-frozen":
        setPref("hideFrozen", !prefs().hideFrozen);
        return true;
      case "panel-asks": togglePanel("asks"); return true;
      case "asks-open": togglePanel("asks", true); return true;
      case "panel-files": togglePanel("files"); return true;
      case "panel-changes": togglePanel("changes"); return true;
      case "panel-artifacts": togglePanel("claude-artifacts"); return true;
      default:
        if (this.extra[c]) { this.extra[c](); return true; }
        return false;
    }
  }
}
