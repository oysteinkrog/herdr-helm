// The status bar: the shown space's machine and branch, how many agents and how many need you,
// a slot on the right for later numbers (PLAN.md 2.7), and the palette key as really bound.
// This part is also the host (it runs the engines) and owns the window-wide key commands.
// From the Herdr app's shipped workspace-status mod v0.1.16 (Apache-2.0, see NOTICE).
// Changed for helm: a helm part with helm's icons and a right-side slot.
import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys, checking } from "herdr";
import { icon } from "../lib/ui.js";
import { claimHost, releaseHost } from "../engines/host.js";
import { startEngines } from "../engines/index.js";
import { Commands } from "../engines/commands.js";

// The palette key from keys.json, written for this platform ("Ctrl+Shift+P").
export function paletteHint(list, platform) {
  const mac = platform === "macos";
  const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
  const b = list.find((k) => k.section === "global" && k.action === "app.palette");
  const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
  const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
  return key ? `${key}  commands` : "commands";
}

export class Status {
  init(_p, cx) {
    this.commands = new Commands();
    if (checking()) return;
    this.token = {};
    if (claimHost(this.token)) this.engines = startEngines(cx, this.commands);
  }

  command(c, cx) {
    this.commands.run(c, cx);
  }

  close() {
    if (this.token) releaseHost(this.token);
  }

  render() {
    this.commands.track();
    const t = theme();
    const space = spaces().find((s) => s.active);
    const list = agents();
    const needs = list.filter((a) => a.status === "blocked").length;
    const label = (name, text) => h_flex().gap(6).items_center().child(svg(icon(name)).size(13)).child(text);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), (el) => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, (el) => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      // Later items (the aiolos number) go in this slot, left of the palette hint.
      .child(h_flex().id("status-slot").gap(12).items_center())
      .child(div().id("palette").text_color(t.dim).cursor_pointer().on_click(() => run("app.palette")).child(paletteHint(keys(), window()?.platform)));
  }
}
