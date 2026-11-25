// A space's right-click menu (popup, 210 x 320): Freeze space… or Thaw space, Kill space…, Rename, the
// worktree items when the space is in a git repo, and Close. Up and down move the selection,
// Enter picks, Escape closes; the selection follows the pointer.
//
// From the space-freeze mod (ours; see NOTICE for the Herdr parts it was built on). Changed for
// helm: a part of its own, menu rows from lib/ui.js, the freeze engine.
import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { theme, spaces, panes, run, exec, openOverlay, closeOverlay } from "herdr";
import { menuKey, menuRows } from "../lib/ui.js";
import { place } from "../engines/spaces/folders.js";
import { refresh } from "../engines/freeze.js";

// "main" for a repo's own checkout, "linked" for a worktree, null outside git.
export async function checkout(folder, on) {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder, on });
  const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder, on });
  if (top.code !== 0 || common.code !== 0) return null;
  return common.stdout.trim() === `${top.stdout.trim()}/.git` ? "main" : "linked";
}

export class SpaceMenu {
  static sample = { space: "sp-sample", frozen: false };

  init(p, cx) {
    this.space = spaces().find((s) => s.id === p.space) ?? null;
    this.frozen = Boolean(p.frozen);
    this.overlay = p.overlay ?? null;
    this.git = null;
    this.state = { at: 0 };
    this.handle = cx?.focus_handle?.() ?? null;
    this.handle?.focus();
    if (!this.space || !cx?.spawn) return;
    const folder = place(this.space, panes());
    const machine = this.space.machine ?? null;
    cx.spawn(async (cx) => {
      if (folder) this.git = await checkout(folder, machine).catch(() => null);
      // Another window or a manager session may have frozen or thawed it.
      await refresh(machine).catch(() => null);
      cx.notify();
    });
  }

  close() { closeOverlay(this.overlay); }

  items() {
    const s = this.space;
    if (!s) return [];
    const worktree = (action) => () => openOverlay({ mod: "worktree", kind: "dialog", ...(action === "open" ? { width: 560, height: 480 } : { width: 440, height: 260 }), props: { space: s.id, action } });
    return [
      this.frozen
        ? { label: "Thaw space", icon: "snowflake", act: () => openOverlay({ mod: "helm", kind: "dialog", width: 420, props: { part: "thaw", space: s.id } }) }
        : { label: "Freeze space…", icon: "snowflake", act: () => openOverlay({ mod: "helm", kind: "dialog", width: 480, props: { part: "freeze", space: s.id } }) },
      { label: "Kill space…", icon: "power", act: () => openOverlay({ mod: "helm", kind: "dialog", width: 460, props: { part: "kill", space: s.id } }) },
      { label: "Rename", sep: true, act: () => run("space.rename", { id: s.id }) },
      ...(this.git ? [{ label: "New worktree", act: worktree("new") }, { label: "Open worktree", act: worktree("open") }] : []),
      ...(this.git === "linked" ? [{ label: "Remove worktree", act: worktree("remove") }] : []),
      { label: "Close", sep: true, act: () => run("space.close", { id: s.id }) },
    ];
  }

  pick(i) {
    const it = this.items()[i];
    if (!it) return;
    this.close();
    it.act();
  }

  render() {
    const t = theme();
    if (!this.space) return div().p(10).bg(t.popover).text_color(t.dim).child("That space is gone.");
    const items = this.items().map((it) => (it.icon ? { ...it, iconColor: t.ansi4 ?? t.muted } : it));
    return v_flex().id("space-menu").when(Boolean(this.handle), (el) => el.track_focus(this.handle)).w_full().min_h(0).p(5)
      .bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => { if (menuKey(e.key, this.state, items.length, (i) => this.pick(i), () => this.close())) { cx.stop_propagation(); cx.notify(); } })
      .children(menuRows(t, "space-item", items, this.state, (i) => this.pick(i)));
  }
}
