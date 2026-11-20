// The tab bar over the work area: the shown space's tabs as pills, + for a new tab, the panel
// buttons (Asks/Agents with a count of waiting asks, Artifacts, Files, Changes) and, where the
// system draws none, window buttons. The right panel's choice is remembered per space.
//
// From the Herdr app's tabs mod at v0.1.16 (Apache-2.0) and herdr-agent-ask's tabs-asks at
// 764155f (MIT); see NOTICE. Changed for helm: no Asks engine here (the status part hosts it),
// the panel choice kept in helm.prefs, the hover rule, helm's icons, no macOS padding.
import { div, svg, image } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, layout, focused, checking } from "herdr";
import { icon, hoverBg, spinner } from "../lib/ui.js";
import { find } from "../lib/layout.js";
import { prefs, setPref, FOREIGN } from "../lib/store.js";
import { readState, loadConfig } from "../engines/asks/state.js";
import { tabName } from "../lib/names.js";

// Asks waiting in the shown space, and elsewhere.
export function askCounts(asks, spaceId) {
  const pending = asks.filter((a) => a.state === "pending" && !a.notice);
  const here = pending.filter((a) => a.space === spaceId).length;
  return { here, elsewhere: pending.length - here };
}

// What the panel should show when space `id` comes to the front: its stored choice if that
// panel is enabled, else nothing (closed).
export const wantedPanel = (panels, id, enabled) => (enabled.includes(panels[id]) ? panels[id] : null);

export class Tabbar {
  init(_p, cx) {
    this.pressed = null;
    this.scroll = ScrollHandle.new();
    this.label = "Asks";
    if (checking()) return;
    const config = (cx) => cx.spawn(async (cx) => { this.label = (await loadConfig()).label ?? "Asks"; cx.notify(); });
    config(cx);
    cx.timer.every(30000, config);
  }

  close() { this.scroll.release(); }

  // The side panel is remembered per space: switching shows that space's choice (closed if it
  // never had one), and opening or closing it records it. While a switch is on its way the
  // layout still shows the old panel for a moment, so that is not recorded as a choice.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    const panels = prefs().panels ?? {};
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in panels))) {
        const want = wantedPanel(panels, space.id, enabled);
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (panels[space.id] === now) return;
    setPref("panels", { ...panels, [space.id]: now });
  }

  render() {
    const t = theme();
    const space = spaces().find((p) => p.active);
    const shown = space?.tabs ?? [];
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
      .hover((s) => s.bg(hoverBg(t, "chrome")).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const ps = panes();
    const item = (c, i) => {
      const program = ps.find((p) => p.tab === c.id && p.program?.agent)?.program ?? ps.find((p) => p.tab === c.id)?.program;
      const name = tabName(c, program);
      return h_flex().id(`tab-${c.id}`).h(29).px(10).gap(7).rounded(7).items_center().flex_none().text_size(12.8)
        .border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover((s) => s.bg(hoverBg(t, c.active ? "raised" : "chrome")))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex((x) => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), (el) => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", (el) => el.child(spinner(t, 12)))
        .when(c.status === "blocked" || c.status === "done", (el) => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(c.active, (el) => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop)
          .on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg(icon("close")).size(12))));
    };
    const root = layout(), w = window();
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = [...(shared(FOREIGN.panels) ?? ["files", "changes"]), "asks", "claude-artifacts"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, iconName, badge) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover((s) => s.bg(hoverBg(t, on ? "selected" : "chrome"))).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon(iconName)).size(14)).child(label)
        .when(Boolean(badge), (el) => el.child(badge));
    };
    // Waiting asks: a count for the shown space, and a dim one when other spaces have some too.
    const { here, elsewhere } = askCounts(readState().asks, space?.id ?? focused()?.space);
    const badge = here + elsewhere ? h_flex().gap(3).items_center()
      .when(here > 0, (el) => el.child(div().h(16).min_w(16).px(5).rounded(8).flex().items_center().justify_center().text_size(10.5).font_semibold().bg(t.blocked).text_color(t.background).child(String(here))))
      .when(elsewhere > 0, (el) => el.child(div().text_size(10.5).text_color(t.dim).child(here ? `+${elsewhere}` : `${elsewhere} elsewhere`))) : null;
    return h_flex().id("tabbar").size_full().min_w(0).px(10).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel((e) => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().track_scroll(this.scroll).children(shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .child(panelButton("asks", `${this.label}/Agents`, "asks", badge))
      .child(panelButton("claude-artifacts", "Artifacts", "artifact"))
      .when(enabled.includes("files"), (el) => el.child(panelButton("files", "Files", "file")))
      .when(enabled.includes("changes"), (el) => el.child(panelButton("changes", "Changes", "changes")))
      .when(Boolean(w?.buttons), (el) => el.child(button("minimize", w.platform === "windows" ? svg(icon("win-min")).size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(icon(w.maximized ? "win-restore" : "win-max")).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg(icon("win-close")).size(16) : svg(icon("close")).size(13), () => run("window.close"))));
  }
}
