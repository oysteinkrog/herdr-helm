// The Agents list (bottom half of the panel's asks child): Priority (Needs you, Done, Working,
// Idle) or Grouped by space, pinned agents on top, sub-agents as a tree under their parent, and a
// rail with numbers when the sidebar is narrow. Also the sort menu popup.
//
// From the Herdr app's agents mod at v0.1.16 (Apache-2.0); see NOTICE. Changed for helm: the list
// logic in engines/agents.js, change times from the host, the sort in helm.prefs, the scroll
// rule (PLAN.md 2.6a), the hover rule, the menu with keys, helm's icons. The one-time move of
// old localStorage pins to labels is left to the migration (PLAN.md 3.1).
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { agents, terminals, panes, focused, spaces, run, theme, setAgentOrder, openOverlay, closeOverlay, checking } from "herdr";
import { icon, hoverBg, programIcon, statusMark, menuKey, menuRows } from "../lib/ui.js";
import { narrow, toggleSidebar } from "../lib/layout.js";
import { KEYS, read, prefs, setPref } from "../lib/store.js";
import { duration } from "../lib/time.js";
import { machineOf } from "../lib/names.js";
import { RANK, SORTS, kidStatus, tree, ordered, groups, labels } from "../engines/agents.js";

const sortOf = () => SORTS.find((s) => s.id === prefs().agentsSort) ?? SORTS[0];

export class Agents {
  init(_p, cx) {
    this.folded = new Set();
    this.hovered = null;
    this.scroll = ScrollHandle.new();
    if (checking()) return;
    // The durations move on by themselves.
    cx.timer.every(30000, (cx) => cx.notify());
  }

  close() { this.scroll.release(); }

  subRow(t, s, shown, compact, listed) {
    const k = s.t;
    const st = kidStatus(k, listed);
    const pic = programIcon(k.program, 14, t.foreground);
    const on = k.address === shown;
    return h_flex().id(`sub-${k.address}`).pl(39).pr(8).rounded(8).h(26).flex_none().gap(0).items_center().text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((x) => x.bg(hoverBg(t, on ? "raised" : "chrome")))
      .on_click(() => (listed.has(k.address) ? run("pane.focus", { terminal: k.address }) : run("terminal.peek", { terminal: k.address })))
      .children(s.lines.map((l) => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
        .when(Boolean(l), (el) => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", (el) => el.border_b(1.5).rounded_bl(6))))
      .when(Boolean(pic), (el) => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address))
      .child(statusMark(t, st, compact));
  }

  render() {
    const t = theme();
    const rail = narrow();
    const sort = sortOf(), byPriority = sort.id === "priority";
    const all = terminals();
    const changed = read(KEYS.changed, {});
    const { list, pinned, rest, urgency, listed } = ordered(agents(), all, changed, byPriority, rail);
    setAgentOrder(list.map((a) => a.address));
    const shown = focused()?.agent;
    const now = Date.now();
    const { label, detail } = labels(list, panes(), spaces());

    // The fold chevron; folded, the count too, coloured by the most urgent one.
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, listed));
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      return div().id(`fold-${a.address}`).h(18).px(3).gap(3).flex().items_center().rounded(4).text_size(11)
        .text_color(open ? t.dim : (t[top] ?? t.dim)).cursor_pointer()
        .hover((s) => s.bg(hoverBg(t, "chrome")).text_color(t.foreground))
        .on_click((_e, cx) => { cx.stop_propagation(); if (open) this.folded.add(a.address); else this.folded.delete(a.address); cx.notify(); })
        .child(svg(icon(open ? "chevron-down" : "chevron-right")).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    const row = (a, i, subs = []) => {
      const pic = programIcon(a.program, 16, t.foreground);
      const more = detail.get(a.address);
      const machine = machineOf(a.address);
      if (rail) {
        return h_flex().id(`ag-${a.address}`).h(26).px(8).flex_none().items_center().gap(4)
          .hover((s) => s.bg(hoverBg(t, "chrome")))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(div().flex_1().min_w(0).whitespace_nowrap().text_right().text_color(t.muted).child(String(i + 1)))
          .child(h_flex().w(14).flex_none().items_center().justify_center().child(statusMark(t, a.status, true)));
      }
      const when = changed[a.address]?.at ?? 0;
      const idle = a.status === "idle" && !a.focused;
      const isPinned = a.pinned;
      const pin = div().id(`pin-${a.address}`).flex_none().p(2).rounded(4).text_color(t.dim).cursor_pointer()
        .hover((s) => s.bg(hoverBg(t, a.focused ? "selected" : "chrome")).text_color(t.foreground))
        .tooltip(isPinned ? "Unpin" : "Pin to the top")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          run("terminal.pin", { terminal: a.address, pinned: !isPinned });
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(icon(isPinned ? "pin-off" : "pin")).size(13));
      // Under a space header the space goes without saying; without one (priority, pinned) the
      // row names its space.
      const full = byPriority || isPinned;
      const lab = label.get(a.address);
      const name = full ? a.space_name || lab : more ?? (/^\d+$/.test(lab) ? a.program?.name || lab : lab);
      return h_flex().id(`ag-${a.address}`).px(8).h(30).flex_none().rounded(8).items_center().gap(9)
        .when(a.focused, (el) => el.bg(t.selected))
        .cursor_pointer()
        .hover((s) => s.bg(hoverBg(t, a.focused ? "selected" : "chrome")))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .when(Boolean(pic), (el) => el.child(div().id(`agent-fold-${a.address}`)
          .when(subs.length > 0, (el) => el.on_click((_e, cx) => {
            cx.stop_propagation();
            if (this.folded.has(a.address)) this.folded.delete(a.address); else this.folded.add(a.address);
            cx.notify();
          })).child(pic)))
        .child(h_flex().flex_1().min_w(0).gap(5).items_center()
          .child(div().min_w(0).max_w(full && more ? 120 : 200).truncate().text_color(idle ? t.muted : t.foreground).child(name))
          .when(full && Boolean(more), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`· ${more}`))))
        .when(Boolean(machine), (el) => el.child(div().text_size(10).text_color(t.dim).child(machine)))
        .when(subs.length > 0, (el) => el.child(fold(a, subs)))
        .when(this.hovered === a.address, (el) => el.child(pin))
        .when(this.hovered !== a.address && Boolean(when), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - when))))
        .child(statusMark(t, a.status, byPriority && !isPinned));
    };

    const withKids = (a, i) => {
      const subs = rail ? [] : tree(all, a.address);
      const r = row(a, i, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, byPriority, listed))];
    };

    // A group's header folds the group. Folded, it says how many and the most urgent state.
    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      return h_flex().id(g.id).px(8).pt(8).h(30).flex_none().gap(6).items_center().text_size(11).font_medium().cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => { if (open) this.folded.add(g.id); else this.folded.delete(g.id); cx.notify(); })
        .child(div().truncate().text_color(t[g.status] ?? t.dim).child(g.label))
        .when(byPriority || !open, (el) => el.child(div().text_color(t.dim).child(String(g.members.length))))
        .child(div().flex_1())
        .when(!open, (el) => el
          .when(!byPriority && Boolean(top) && top !== "idle", (el) => el.child(statusMark(t, top, true)))
          .child(svg(icon("chevron-right")).size(11).flex_none().text_color(t.dim)));
    };
    const rows = rail
      ? list.flatMap(withKids)
      : groups(pinned, rest, urgency, byPriority).flatMap((g) => [header(g), ...(this.folded.has(g.id) ? [] : g.members.flatMap(withKids))]);

    return v_flex().id("agents").size_full().min_h(0).bg(t.chrome).border_t(1).border_color(t.border).text_size(13)
      .when(!rail, (el) => el.child(h_flex().px(16).h(41).pt(14).pb(5).flex_none().items_center().justify_between()
        .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Agents"))
        .child(div().id("ag-sort").text_size(11).text_color(t.dim).hover((s) => s.text_color(t.foreground))
          .on_click(() => openOverlay({ mod: "helm", kind: "popup", width: 200, height: 140, props: { part: "sort-menu" } }))
          .tooltip(`Sort agents: ${sort.label}`)
          .child(svg(icon(sort.icon)).size(14)))))
      .when(list.length === 0 && !rail, (el) => el.child(div().px(12).text_size(12).text_color(t.dim).child("No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not.")))
      // One id and one scroll handle for the list's life (PLAN.md 2.6a); rows keep their ids.
      .child(v_flex().id("ag-list").flex_1().min_h(0).px(rail ? 0 : 8).overflow_y_scrollbar().mode("always").track_scroll(this.scroll).children(rows))
      .when(rail, (el) => el.child(h_flex().h(28).items_center().justify_center()
        .child(div().id("collapse").text_size(13).text_color(t.dim).hover((s) => s.text_color(t.foreground)).on_click(toggleSidebar).child("»"))));
  }
}

// The sort popup (200 x 140): Priority or Grouped by space. Keys move the selection.
export class SortMenu {
  init(p, cx) {
    this.overlay = p.overlay ?? null;
    this.state = { at: Math.max(0, SORTS.findIndex((s) => s.id === sortOf().id)) };
    this.handle = cx?.focus_handle?.() ?? null;
    this.handle?.focus();
  }

  pick(i) {
    const s = SORTS[i];
    if (s) setPref("agentsSort", s.id);
    closeOverlay(this.overlay);
  }

  render() {
    const t = theme();
    const on = sortOf().id;
    const items = SORTS.map((s) => ({ label: s.label, icon: s.icon, check: s.id === on }));
    return v_flex().id("sort-menu").when(Boolean(this.handle), (el) => el.track_focus(this.handle)).w_full().p(5).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => { if (menuKey(e.key, this.state, SORTS.length, (i) => this.pick(i), () => closeOverlay(this.overlay))) { cx.stop_propagation(); cx.notify(); } })
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Sort agents"))
      .children(menuRows(t, "sort", items, this.state, (i) => this.pick(i)));
  }
}
