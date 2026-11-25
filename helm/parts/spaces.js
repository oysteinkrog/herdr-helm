// The spaces sidebar: spaces with coloured avatars and a git tail, grouped in folders and, once
// another machine is known, by machine. Click to switch, right-click for the space menu, drag a
// space onto another space, onto a folder, or below the list. Frozen spaces show a snowflake and
// can be hidden; a row under the list opens the killed spaces. Under 160 px wide it draws a
// compact rail.
//
// From herdr-space-folders at 63a78b2 (MIT), itself built on the Herdr app's spaces mod
// (Apache-2.0); see NOTICE. Changed for helm: the list comes from engines/spaces (data, built
// once per render), the scroll position is kept (PLAN.md 2.6a), menus and dialogs are helm
// parts, the hover rule, and no worktree nesting.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, machines, theme, run, openOverlay, window, shared, checking } from "herdr";
import { icon, hoverBg, iconButton, spinner } from "../lib/ui.js";
import { narrow } from "../lib/layout.js";
import { FOREIGN, KEYS, read, prefs, setPref } from "../lib/store.js";
import { liveList } from "../engines/spaces/live.js";
import { folders, folderOf, newSpaceIn, drop, reorder, toggle } from "../engines/spaces/folders.js";
import { GitTracker, where, tail } from "../engines/spaces/git.js";

// One strong colour per stored colour name, the same on every avatar, light or dark.
export const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const URGENT = ["blocked", "done", "working"];
// Left padding of a row: 8 at the top, a step of 18 under a folder; a machine in a folder has
// its header at 26 and what is under it a step further.
const STEP = 18;
const indent = (folder, nested) => 8 + (nested ? 2 * STEP : 0) + (folder ? STEP : 0);
// A space speaks up only when something in it needs you.
const glyph = (status) => (status === "blocked" || status === "done" ? "●" : "·");
const tone = (t, status) => t[status] ?? t.unknown;

export class Spaces {
  init(_p, cx) {
    this.pressed = null;     // index in spaces() of a space being dragged
    this.over = null;        // index it would drop on
    this.overFolder = null;  // folder id (or "out") it would drop in
    this.moving = null;      // a folder being dragged: { machine, id, index }
    this.overMove = null;
    // The list's scroll position, made once and attached on every render (PLAN.md 2.6a).
    this.scroll = ScrollHandle.new();
    this.lastActive = undefined; // the front space at the last render
    this.clicked = null;         // a space selected by a click on its row here
    this.edge = 0;               // -1 or 1 while a drag is held on the top or bottom edge strip
    this.autoAt = null;          // the row index the edge scroll has reached
    this.hoverAt = null;         // the row index under the pointer
    this.rowCount = 0;
    this.git = new GitTracker();
    if (checking()) return;
    cx.timer.every(250, (cx) => this.checkGit(cx));
    cx.timer.every(70, (cx) => this.autoScroll(cx));
  }

  close() {
    this.git.watching.clear();
    this.scroll.release();
  }

  checkGit(cx) {
    const due = this.git.due(Date.now(), spaces(), panes(), machines(), Boolean(window()?.active), new Set(prefs().machinesFolded ?? []));
    if (due.size) this.git.refresh(due, cx);
  }

  resetDrag() {
    this.pressed = null; this.over = null; this.overFolder = null; this.moving = null; this.overMove = null;
    this.edge = 0; this.autoAt = null;
  }

  // One row further up or down per tick while a drag is held on an edge strip. scroll_to_item
  // moves only when that row is off screen, so this starts at the row last under the pointer
  // (next to the edge) and walks outwards.
  autoScroll(cx) {
    if ((this.pressed === null && !this.moving) || !this.edge) { this.autoAt = null; return; }
    if (this.autoAt === null) this.autoAt = this.hoverAt;
    if (this.autoAt === null) return;
    const next = Math.max(0, Math.min(this.rowCount - 1, this.autoAt + this.edge));
    if (next === this.autoAt) return;
    this.autoAt = next;
    this.scroll.scroll_to_item(next);
    cx.notify();
  }

  // A strip over the top or bottom edge of the list, shown only while dragging. It sits outside
  // the scrolling content, so its place on screen is fixed. Releasing on it cancels the drag.
  edgeStrip(id, dir) {
    return div().id(id).absolute().left(0).right(0).h(26)
      .on_mouse_move(() => { if (this.edge !== dir) { this.edge = dir; this.autoAt = null; } })
      .on_hover((hovered) => { if (!hovered && this.edge === dir) { this.edge = 0; this.autoAt = null; } })
      .on_mouse_up("left", (_e, cx) => { this.resetDrag(); cx.notify(); });
  }

  menu(w, frozen) {
    openOverlay({ mod: "helm", kind: "popup", width: 210, height: 320, props: { part: "space-menu", space: w.id, frozen } });
  }

  newFolder(machine) {
    openOverlay({ mod: "helm", kind: "dialog", width: 460, props: { part: "folder-edit", folder: `f${Date.now().toString(36)}`, machine, fresh: true } });
  }

  folderHead(it, t, rail) {
    const { folder: f, machine, n, nested } = it;
    const status = URGENT.find((s) => it.spaces.some((w) => w.status === s));
    const target = this.pressed !== null && this.overFolder === f.id;
    const moving = this.moving, aimed = moving && moving.id !== f.id && this.overMove === f.id;
    const head = h_flex().relative().id(it.key).h(24).flex_none().px(rail ? 2 : 8).when(!rail, (el) => el.pl(indent(null, nested))).gap(7).items_center().rounded(6)
      .text_color(t.foreground).cursor_pointer()
      .when(target, (el) => el.bg(t.selected).border_1().border_color(t.accent))
      .when(!target, (el) => el.hover((s) => s.bg(hoverBg(t, "chrome"))))
      .when(Boolean(moving) && moving.id === f.id && this.overMove !== f.id, (el) => el.opacity(0.5))
      .when(Boolean(aimed), (el) => el.child(div().absolute().left(0).right(0).h(2).bg(t.accent)
        .when(moving.index < n, (line) => line.bottom(0)).when(moving.index > n, (line) => line.top(0))))
      .on_mouse_down("left", () => { this.moving = { machine, id: f.id, index: n }; this.overMove = f.id; })
      .on_mouse_move((_e, cx) => {
        if (this.pressed !== null && this.overFolder !== f.id) { this.overFolder = f.id; this.over = null; cx.notify(); }
        const over = this.moving && (this.moving.machine ?? null) === (machine ?? null) ? f.id : null;
        if (this.moving && this.overMove !== over) { this.overMove = over; cx.notify(); }
      })
      .on_mouse_up("left", (_e, cx) => {
        if (this.pressed !== null) drop(spaces()[this.pressed], f.id, panes());
        else if (this.moving && this.moving.id !== f.id && this.overMove === f.id) reorder(machine, this.moving.id, f.id);
        this.resetDrag();
        cx.notify();
      })
      .on_click(() => toggle(machine, f.id))
      .on_mouse_down("right", () => openOverlay({ mod: "helm", kind: "popup", width: 210, height: 160, props: { part: "folder-menu", folder: f.id, machine } }));
    const tile = h_flex().size(14).flex_none().rounded(4).items_center().justify_center().bg(f.color ? (MARK[f.color] ?? f.color) : t.dim)
      .child(svg(icon("folder")).size(10).text_color("#ffffff"));
    if (rail) return head.justify_center().child(tile);
    return head.child(tile)
      .child(div().flex_1().min_w(0).truncate().font_medium().child(f.name))
      .when(f.folded && status === "working", (el) => el.child(spinner(t, 11)))
      .when(f.folded && Boolean(status) && status !== "working", (el) => el.child(div().flex_none().text_color(tone(t, status)).child(glyph(status))))
      .child(div().id(`${it.key}-add`).flex_none().px(4).rounded(4).text_color(t.dim).hover((s) => s.bg(hoverBg(t, "chrome")).text_color(t.foreground))
        .on_click((_e, cx) => { cx.stop_propagation(); newSpaceIn(machine, f.id); }).child("+"))
      .child(div().flex_none().text_size(11.5).text_color(t.dim).child(String(it.spaces.length)))
      .child(svg(icon(f.folded ? "chevron-right" : "chevron-down")).size(11).flex_none().text_color(t.dim));
  }

  machineHead(it, t, rail) {
    const m = it.machine;
    const small = (id, child, action) => div().id(id).flex_none().px(3).rounded(4).hover((s) => s.bg(hoverBg(t, "chrome")).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); action(); }).child(child);
    return h_flex().id(it.key).h(20).flex_none().pl(rail ? 2 : it.nested ? 26 : 8).pr(rail ? 2 : 8).gap(7).items_center().text_size(11).text_color(t.dim)
      .cursor_pointer().hover((s) => s.bg(hoverBg(t, "chrome")))
      .on_click(() => {
        const folded = new Set(prefs().machinesFolded ?? []);
        if (folded.has(m)) folded.delete(m); else folded.add(m);
        setPref("machinesFolded", [...folded]);
      })
      .child(svg(icon(m ? "server" : "monitor")).size(13).flex_none())
      .when(!rail, (el) => el.child(div().flex_1().truncate().child(m ?? "This computer"))
        .when(!it.connected, (el) => el.child(div().flex_none().child((it.state ?? "asleep").replace(/_/g, " "))))
        .when(it.connected, (el) => el.child(small(`${it.key}-folder`, svg(icon("folder-plus")).size(12), () => this.newFolder(m))))
        .when(it.connected, (el) => el.child(small(`${it.key}-add`, "+", () => newSpaceIn(m, null))))
        .child(div().size(6).rounded(3).flex_none().bg(it.connected ? t.ansi2 : t.dim))
        .child(svg(icon(it.folded ? "chevron-right" : "chevron-down")).size(11).flex_none()));
  }

  spaceRow(it, t, colors) {
    const { space: w, index: i, folder, nested, frozen } = it;
    const color = colors[w.id] ?? "ansi6";
    const fill = color.startsWith("#") ? color : (MARK[color] ?? t[color]);
    const g = this.git.git[where(w, this.ps)] ?? null;
    const tl = g ? tail(g, w.name) : null;
    return v_flex().relative().id(it.key).pl(indent(folder, nested)).pr(8).h(22).flex_none().justify_center().rounded(6)
      .when(w.active, (el) => el.bg(t.selected))
      .when(!w.active, (el) => el.hover((s) => s.bg(hoverBg(t, "chrome"))))
      .when(this.pressed === i && this.over !== i, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === i && this.pressed !== i, (el) => el.child(div().absolute().left(0).right(0).h(2).bg(t.accent)
        .when(this.pressed < i, (line) => line.bottom(0)).when(this.pressed > i, (line) => line.top(0))))
      .on_mouse_down("left", () => { this.pressed = i; this.over = i; })
      .on_mouse_move((_e, cx) => {
        const source = spaces()[this.pressed];
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? i : null;
        if (this.pressed !== null && (this.over !== over || this.overFolder !== null)) { this.over = over; this.overFolder = null; cx.notify(); }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed, over = this.over;
        this.pressed = null; this.over = null;
        // Dropped on a space: it moves there, and into that space's folder.
        if (from !== null && over === i && from !== i) { drop(spaces()[from], folder, panes()); run("space.move", { id: spaces()[from].id, index: i + 1 }); }
        else if (from === i) { this.clicked = w.id; run("space.select", { id: w.id }); }
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w, frozen))
      .child(h_flex().gap(7).items_center()
        .child(h_flex().size(14).flex_none().rounded(4).bg(fill).items_center().justify_center().text_size(9).font_bold().text_color("#ffffff").child([...w.name][0]?.toUpperCase() ?? "?"))
        .child(div().flex_shrink(0).max_w(150).truncate().text_color(frozen ? t.dim : t.foreground).child(w.name))
        .when(frozen, (el) => el.child(svg(icon("snowflake")).size(12).flex_none().text_color(t.ansi4 ?? t.dim)))
        .child(tl ? h_flex().flex_1().min_w(0).gap(5).justify_end().items_center().text_size(11.5).text_color(t.dim)
          .when(Boolean(tl.where), (el) => el.child(div().min_w(0).truncate().child(tl.where)))
          .when(tl.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`↑${tl.ahead}`)))
          .when(tl.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`↓${tl.behind}`))) : div().flex_1()));
  }

  compactRow(it, t) {
    const { space: w, index: i, frozen } = it;
    return h_flex().id(it.key).h(26).flex_none().justify_center().gap(4)
      .when(w.active, (el) => el.bg(t.raised))
      .hover((s) => s.bg(hoverBg(t, "chrome")))
      .on_click(() => { this.clicked = w.id; run("space.select", { id: w.id }); })
      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
      .child(frozen ? svg(icon("snowflake")).size(10).text_color(t.ansi4 ?? t.dim) : div().text_color(tone(t, w.status)).child(glyph(w.status)));
  }

  row(it, t, rail, colors) {
    if (it.type === "machine") return this.machineHead(it, t, rail);
    if (it.type === "folder") return this.folderHead(it, t, rail);
    if (it.type === "space") return rail ? this.compactRow(it, t) : this.spaceRow(it, t, colors);
    if (it.type === "loading") return div().id(it.key).h(22).flex_none().px(8).text_size(12).text_color(t.dim).child(rail ? "…" : "Loading…");
    return h_flex().id(it.key).h(22).flex_none().pl(indent(null, it.nested)).pr(8).gap(7).items_center().rounded(7)
      .text_size(12).text_color(t.dim).hover((s) => s.bg(hoverBg(t, "chrome")).text_color(t.foreground))
      .on_click(() => newSpaceIn(it.machine, null))
      .child(svg(icon("plus")).size(12)).when(!rail, (el) => el.child("New space there"));
  }

  // The only time the list scrolls by itself: another space came to the front by a key or a
  // command (anything but a click on its row here) and its row is off screen. scroll_to_item moves
  // only as far as needed and leaves a row that is already in view alone. Reloads, status changes
  // and menus never get here, because the front space did not change.
  follow(items) {
    const active = spaces().find((s) => s.active)?.id ?? null;
    if (active === this.lastActive) return;
    const at = items.findIndex((it) => it.type === "space" && it.space.id === active);
    if (this.lastActive !== undefined && active && active !== this.clicked && at >= 0) this.scroll.scroll_to_item(at);
    this.lastActive = active;
    this.clicked = null;
  }

  render() {
    const t = theme();
    const rail = narrow();
    this.ps = panes();
    const { items, hiddenFrozen } = liveList();
    const colors = shared(FOREIGN.spaceColors) ?? {};
    const hiding = Boolean(prefs().hideFrozen);
    const killed = read(KEYS.killed, []).length;
    this.rowCount = items.length;
    this.follow(items);
    const dragging = this.pressed !== null || Boolean(this.moving);
    // While a space in a folder is dragged, a place to drop it out of the folder.
    const dragged = this.pressed !== null ? spaces()[this.pressed] : null;
    const leaving = Boolean(dragged && folderOf(dragged, folders(dragged.machine ?? null), this.ps));
    return v_flex().id("spaces").size_full().min_h(0).bg(t.chrome).text_size(12.5)
      .child(h_flex().h(26).flex_none().pl(16).pr(10).items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(!rail, (el) => el.child("Spaces"))
        .child(h_flex().gap(2)
          .child(iconButton(t, "frozen-toggle", svg(icon("snowflake")).size(14).text_color(hiding ? t.ansi4 ?? t.accent : t.dim).when(hiding, (el) => el.opacity(0.45)),
            () => setPref("hideFrozen", !hiding), { tooltip: hiding ? "Show frozen spaces" : "Hide frozen spaces" }))
          .when(!rail, (el) => el.child(iconButton(t, "folder-new", svg(icon("folder-plus")).size(14), () => this.newFolder(null))))
          .child(iconButton(t, "space-new", svg(icon("plus")).size(14), () => newSpaceIn(null, null)))))
      // The scroll area keeps one id and one handle for its whole life, and its rows keep their
      // keys, so nothing that redraws the list moves it (PLAN.md 2.6a).
      .child(v_flex().relative().flex_1().min_h(0).child(v_flex().id("spaces-list").size_full().min_h(0).px(6).pb(6).overflow_y_scrollbar().mode("always").track_scroll(this.scroll)
        // Released anywhere but on a space or a folder: out of its folder.
        .on_mouse_up("left", (_e, cx) => {
          if (this.pressed !== null) drop(spaces()[this.pressed], null, this.ps);
          this.resetDrag();
          cx.notify();
        })
        .children(items.map((it, n) => this.row(it, t, rail, colors).on_hover((h) => { if (h) this.hoverAt = n; })))
        .when(hiding && hiddenFrozen > 0, (el) => el.child(h_flex().id("frozen-hidden").mt(4).h(24).flex_none().pl(8).gap(7).items_center()
          .rounded(7).cursor_pointer().text_size(12).text_color(t.dim).hover((s) => s.bg(hoverBg(t, "chrome")).text_color(t.foreground))
          .on_click(() => setPref("hideFrozen", false))
          .child(svg(icon("snowflake")).size(12).flex_none())
          .when(!rail, (el) => el.child(`${hiddenFrozen} frozen hidden`))))
        // Killed spaces are gone from Herdr; this row opens their list, where Revive brings one back.
        .when(killed > 0, (el) => el.child(h_flex().id("killed-open").mt(4).h(24).flex_none().pl(8).gap(7).items_center()
          .rounded(7).cursor_pointer().text_size(12).text_color(t.dim).hover((s) => s.bg(hoverBg(t, "chrome")).text_color(t.foreground))
          .on_click(() => openOverlay({ mod: "helm", kind: "dialog", width: 520, props: { part: "killed" } }))
          .child(svg(icon("power")).size(12).flex_none())
          .when(!rail, (el) => el.child(`${killed} killed`)))))
        // While dragging: the edge strips, and for a space in a folder the place to drop it out of
        // the folder. They lie over the list, outside the scrolling content, so starting a drag
        // adds no row to the list and its scroll stays where it is.
        .when(dragging, (el) => el.child(this.edgeStrip("spaces-edge-up", -1).top(0)).child(this.edgeStrip("spaces-edge-down", 1).bottom(0)))
        .when(leaving && !rail, (el) => el.child(div().id("folder-out").absolute().left(6).right(6).bottom(30).h(34).flex().items_center().justify_center()
          .rounded(8).border_1().border_dashed().border_color(this.overFolder === "out" ? t.accent : t.border).bg(t.chrome)
          .text_size(12).text_color(this.overFolder === "out" ? t.foreground : t.dim)
          .on_mouse_move((_e, cx) => { if (this.overFolder !== "out") { this.overFolder = "out"; this.over = null; cx.notify(); } })
          .on_mouse_up("left", (_e, cx) => { if (this.pressed !== null) drop(spaces()[this.pressed], null, this.ps); this.resetDrag(); cx.notify(); })
          .child("Drop here to take it out of its folder"))));
  }
}
