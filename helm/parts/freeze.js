// The Freeze dialog (480 wide) and the Thaw dialog (420 wide).
//
// Freeze lists the programs that would exit, and is off while an agent there is working or
// waiting for an answer; the plan is read again every 3 s while one is busy. Thaw starts at once
// (picking Thaw in the menu is the go-ahead) and closes on full success. Every step finishes
// before the overlay closes: a closed overlay's pending work never lands.
//
// From the space-freeze mod (ours; see NOTICE). Changed for helm: two parts, the dialog frame and
// buttons from lib/ui.js, the freeze engine, and a check of the script's version first.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, spaces, closeOverlay, notify } from "herdr";
import { button, dialog } from "../lib/ui.js";
import { freezeSh, checkVersion, refresh, mark } from "../engines/freeze.js";
import { localId } from "../lib/names.js";

const machineOf = (s) => s?.machine ?? null;
export const what = (e) => (e.kind === "claude" ? "Claude Code" : e.kind === "codex" ? "Codex" : (e.argv ?? []).join(" ") || "program");
export const programs = (plan) => (plan?.terminals ?? []).filter((e) => e.kind !== "shell");
export const busyOnes = (plan) => programs(plan).filter((e) => e.status === "working" || e.status === "blocked");

export function freezeToast(name, r) {
  return {
    title: `Froze ${name}`,
    body: r.failed.length ? `${r.frozen} stopped. Could not stop: ${r.failed.join(", ")}.` : `${r.frozen} stopped. Right-click the space and pick Thaw to start them again.`,
    level: r.failed.length ? "warning" : "success",
  };
}

export function thawToast(name, r) {
  return {
    title: `Thawed ${name}`,
    body: r.left ? `${r.thawed} started again, ${r.left} could not start (their terminal is busy).` : `${r.thawed} started again.`,
    level: r.left ? "warning" : "success",
  };
}

const gone = (t) => div().p(10).bg(t.popover).text_color(t.dim).child("That space is gone.");

export class Freeze {
  static sample = { space: "sp-sample" };

  init(p, cx) {
    this.space = spaces().find((s) => s.id === p.space) ?? null;
    this.overlay = p.overlay ?? null;
    this.plan = null;
    this.error = null;
    this.working = false;
    this.handle = cx?.focus_handle?.() ?? null;
    this.handle?.focus();
    if (!this.space || !cx?.spawn) return;
    cx.spawn(async (cx) => {
      try {
        await checkVersion(machineOf(this.space));
        this.plan = await freezeSh(machineOf(this.space), "plan", localId(this.space));
      } catch (e) { this.error = String(e.message ?? e); }
      cx.notify();
    });
    // While an agent is busy, look again every 3 s, so Freeze turns on when it is idle.
    cx.timer.every(3000, (cx) => {
      if (this.working || this.polling || !busyOnes(this.plan).length) return;
      this.polling = true;
      cx.spawn(async (cx) => {
        try { this.plan = await freezeSh(machineOf(this.space), "plan", localId(this.space)); } catch { /* keep the last plan */ }
        this.polling = false;
        cx.notify();
      });
    });
  }

  async go(cx) {
    this.working = true;
    cx.notify();
    const s = this.space, m = machineOf(s);
    try {
      const r = await freezeSh(m, "freeze", localId(s), s.name);
      if (r.frozen > 0) mark(s.id, { count: r.frozen, at: new Date().toISOString() });
      await refresh(m).catch(() => null);
      notify(freezeToast(s.name, r));
      closeOverlay(this.overlay);
      return;
    } catch (e) {
      this.error = String(e.message ?? e);
      this.working = false;
    }
    await refresh(m).catch(() => null);
    cx.notify();
  }

  render() {
    const t = theme();
    if (!this.space) return gone(t);
    const progs = programs(this.plan), busy = busyOnes(this.plan);
    const can = Boolean(this.plan) && progs.length > 0 && busy.length === 0 && !this.working;
    const row = (e) => h_flex().gap(8).items_center().min_w(0)
      .child(div().flex_none().text_color(t.foreground).child(what(e)))
      .child(div().min_w(0).truncate().text_color(t.dim).child(e.name ?? e.address))
      .when(Boolean(e.status), (el) => el.child(div().flex_none().text_color(busy.includes(e) ? t.ansi1 : t.dim).child(e.status)));
    let body;
    if (this.error) body = div().text_color(t.ansi1).child(this.error);
    else if (!this.plan) body = div().text_color(t.dim).child("Looking at what runs in this space…");
    else if (!progs.length) body = div().text_color(t.dim).child("Nothing runs in this space: there is nothing to freeze.");
    else body = v_flex().gap(6)
      .child(div().text_color(t.muted).child("These programs will exit. Their shells and tabs stay. Thaw starts them again in the same panes (Claude Code with --resume)."))
      .child(v_flex().gap(4).p(10).rounded(8).bg(t.background).children(progs.map(row)))
      .when(busy.length > 0, (el) => el.child(div().text_color(t.ansi1).child("An agent here is working or waiting for an answer. Freeze is off until it is idle.")));
    return dialog(t, "freeze", {
      title: `Freeze ${this.space.name}`, iconName: "snowflake", handle: this.handle, body,
      onEscape: () => closeOverlay(this.overlay),
      buttons: [
        button(t, "freeze-cancel", "Cancel", () => closeOverlay(this.overlay)),
        button(t, "freeze-go", this.working ? "Freezing…" : "Freeze", (_e, cx) => this.go(cx), { primary: true, enabled: can }),
      ],
    });
  }
}

export class Thaw {
  static sample = { space: "sp-sample" };

  init(p, cx) {
    this.space = spaces().find((s) => s.id === p.space) ?? null;
    this.overlay = p.overlay ?? null;
    this.result = null;
    this.error = null;
    this.handle = cx?.focus_handle?.() ?? null;
    this.handle?.focus();
    if (this.space && cx?.spawn) cx.spawn(async (cx) => this.go(cx));
  }

  async go(cx) {
    const s = this.space, m = machineOf(s);
    try {
      await checkVersion(m);
      const r = await freezeSh(m, "thaw", localId(s));
      if (!r.left) mark(s.id, null);
      await refresh(m).catch(() => null);
      notify(thawToast(s.name, r));
      if (!r.left) { closeOverlay(this.overlay); return; }
      this.result = r;
    } catch (e) {
      this.error = String(e.message ?? e);
      await refresh(m).catch(() => null);
    }
    cx.notify();
  }

  render() {
    const t = theme();
    if (!this.space) return gone(t);
    let body;
    if (this.error) body = div().text_color(t.ansi1).child(this.error);
    else if (this.result) body = div().text_color(t.muted).child(`${this.result.thawed} started again. ${this.result.left} could not start because something else runs in their terminal now. The space stays frozen for those: pick Thaw again when the terminal is free.`);
    else body = div().text_color(t.dim).child("Starting the programs again…");
    return dialog(t, "thaw", {
      title: `Thaw ${this.space.name}`, iconName: "snowflake", handle: this.handle, body,
      onEscape: () => closeOverlay(this.overlay),
      buttons: this.error || this.result ? [button(t, "thaw-close", "Close", () => closeOverlay(this.overlay))] : [],
    });
  }
}
