// The Kill dialog (460 wide) and the Killed list (520 wide).
//
// Kill asks once, then runs space-kill on the space's machine, which closes the space; the
// engine there refuses what must not be killed (a protected space, a busy agent, a /loop or
// /goal, a jobd job) and its error is shown here. The Killed list shows every machine's killed
// spaces, newest first, each with Revive and Forget (off the list, not revived): space-revive makes a new space with the same name in the
// same folder and resumes its Claude sessions. Every step finishes before the overlay closes.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, spaces, closeOverlay, notify, shared } from "herdr";
import { button, dialog } from "../lib/ui.js";
import { KEYS, read } from "../lib/store.js";
import { kill, revive, forgetRecord, refreshKilled, loadKilled, dropKilled, when } from "../engines/kill.js";
import { refresh as refreshFrozen, mark } from "../engines/freeze.js";
import { folders, key } from "../engines/spaces/folders.js";
import { localId } from "../lib/names.js";

const machineOf = (s) => s?.machine ?? null;

export function killToast(name, r) {
  const kept = r.kept ?? [];
  const wt = r.worktrees_queued === 1 ? "Its worktree is removed tonight." : r.worktrees_queued > 1 ? `Its ${r.worktrees_queued} worktrees are removed tonight.` : "";
  return {
    title: `Killed ${name}`,
    body: [wt, kept.length ? `Kept: ${kept.map((k) => `${k.root} (${k.why})`).join(", ")}.` : "", "Revive it from the Killed list."].filter(Boolean).join(" "),
    level: "success",
  };
}

export const reviveToast = (name) => ({ title: `Revived ${name}`, body: "A new space with the same name is in the same folder, with its Claude sessions resumed.", level: "success" });

// "home · Agents · 3h ago by oystein": where it was and who killed it, when.
export function killedLine(k, now = Date.now()) {
  // The folder's name from helm's folders, or from the space-folders mod's when the krog layout
  // (not helm) draws the sidebar. Both keep the same format.
  const m = k.machine ?? null;
  const list = folders(m).list.length ? folders(m).list : (shared("space-folders") ?? {})[key(m)]?.list ?? [];
  const folder = k.folder ? list.find((f) => f.id === k.folder)?.name : null;
  const ago = when(k.killed_at, now);
  return [k.machine, folder, [ago, k.by ? `by ${k.by}` : ""].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
}

const gone = (t) => div().p(10).bg(t.popover).text_color(t.dim).child("That space is gone.");

export class Kill {
  static sample = { space: "sp-sample" };

  init(p, cx) {
    this.space = spaces().find((s) => s.id === p.space) ?? null;
    this.overlay = p.overlay ?? null;
    this.error = null;
    this.working = false;
    this.handle = cx?.focus_handle?.() ?? null;
    this.handle?.focus();
  }

  async go(cx) {
    this.working = true;
    this.error = null;
    cx.notify();
    const s = this.space, m = machineOf(s);
    try {
      const r = await kill(m, localId(s));
      mark(s.id, null);
      await refreshKilled(m).catch(() => null);
      await refreshFrozen(m).catch(() => null);
      notify(killToast(s.name, r));
      closeOverlay(this.overlay);
      return;
    } catch (e) {
      this.error = String(e.message ?? e);
      this.working = false;
    }
    cx.notify();
  }

  render() {
    const t = theme();
    if (!this.space) return gone(t);
    const body = v_flex().gap(8)
      .child(div().text_color(t.muted).child(`Kill ${this.space.name}? The space closes with its shells; the Claude session and branch stay, the worktree is removed tonight.`))
      .child(div().text_color(t.dim).child("Uncommitted changes are saved first. Revive it later from the Killed list in the sidebar."))
      .when(Boolean(this.error), (el) => el.child(div().text_color(t.ansi1).child(this.error)));
    return dialog(t, "kill", {
      title: `Kill ${this.space.name}`, iconName: "power", handle: this.handle, body,
      onEscape: () => closeOverlay(this.overlay),
      buttons: [
        button(t, "kill-cancel", this.error ? "Close" : "Cancel", () => closeOverlay(this.overlay)),
        button(t, "kill-go", this.working ? "Killing…" : "Kill", (_e, cx) => this.go(cx), { primary: true, enabled: !this.working }),
      ],
    });
  }
}

export class Killed {
  static sample = {};

  init(p, cx) {
    this.overlay = p.overlay ?? null;
    this.error = null;
    this.reviving = null;
    this.handle = cx?.focus_handle?.() ?? null;
    this.handle?.focus();
    if (!cx?.spawn) return;
    cx.spawn(async (cx) => {
      await loadKilled(read(KEYS.machines, []).map((m) => m.name)).catch(() => null);
      cx.notify();
    });
  }

  async revive(k, cx) {
    this.reviving = `${k.machine ?? ""}/${k.space}`;
    this.error = null;
    cx.notify();
    try {
      await revive(k.machine ?? null, k.space);
      dropKilled(k.machine ?? null, k.space);
      notify(reviveToast(k.name));
    } catch (e) {
      this.error = `${k.name}: ${String(e.message ?? e)}`;
    }
    await refreshKilled(k.machine ?? null).catch(() => null);
    this.reviving = null;
    cx.notify();
  }

  // Forget: off the list, not revived. No question: the engine keeps the record under revived/.
  async forget(k, cx) {
    this.reviving = `${k.machine ?? ""}/${k.space}`;
    this.error = null;
    cx.notify();
    try {
      await forgetRecord(k.machine ?? null, k.space);
      dropKilled(k.machine ?? null, k.space);
    } catch (e) {
      this.error = `${k.name}: ${String(e.message ?? e)}`;
    }
    await refreshKilled(k.machine ?? null).catch(() => null);
    this.reviving = null;
    cx.notify();
  }

  render() {
    const t = theme();
    const list = read(KEYS.killed, []);
    const now = Date.now();
    const row = (k, n) => h_flex().id(`killed-${n}`).gap(10).items_center().min_w(0).py(4)
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().font_medium().text_color(t.foreground).child(k.name ?? k.space))
        .child(div().truncate().text_size(11.5).text_color(t.dim).child(killedLine(k, now))))
      .child(button(t, `revive-${n}`, this.reviving === `${k.machine ?? ""}/${k.space}` ? "Reviving…" : "Revive",
        (_e, cx) => this.revive(k, cx), { enabled: this.reviving === null }))
      .child(button(t, `forget-${n}`, "Forget", (_e, cx) => this.forget(k, cx), { enabled: this.reviving === null }));
    const body = v_flex().gap(8)
      .when(Boolean(this.error), (el) => el.child(div().text_color(t.ansi1).child(this.error)))
      .child(list.length
        ? v_flex().id("killed-list").max_h(380).overflow_y_scrollbar().px(10).py(6).rounded(8).bg(t.background).children(list.map(row))
        : div().text_color(t.dim).child("No killed spaces. Right-click a space and pick Kill to close it and keep its Claude sessions."));
    return dialog(t, "killed", {
      title: "Killed spaces", iconName: "power", handle: this.handle, body,
      onEscape: () => closeOverlay(this.overlay),
      buttons: [button(t, "killed-close", "Close", () => closeOverlay(this.overlay))],
    });
  }
}
