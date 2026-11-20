// A folder's right-click menu (popup, 210 x 160): colour swatches, New space here, Edit folder…,
// Delete folder. Up and down move the selection, Enter picks, Escape closes.
//
// From herdr-space-folders at 63a78b2 (MIT); see NOTICE. Changed for helm: a part of its own,
// keyboard use, the hover rule.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, openOverlay, closeOverlay } from "herdr";
import { menuKey, menuRows } from "../lib/ui.js";
import { folders, newSpaceIn, paint, remove } from "../engines/spaces/folders.js";
import { MARK } from "./spaces.js";

export class FolderMenu {
  static sample = { folder: "f-sample", machine: null };

  init(p, cx) {
    this.id = p.folder;
    this.machine = p.machine ?? null;
    this.overlay = p.overlay ?? null;
    this.state = { at: 0 };
    this.handle = cx?.focus_handle?.() ?? null;
    this.handle?.focus();
  }

  close() { closeOverlay(this.overlay); }

  items() {
    const { id, machine } = this;
    return [
      { label: "New space here", icon: "plus", act: () => newSpaceIn(machine, id) },
      { label: "Edit folder…", icon: "settings", act: () => openOverlay({ mod: "helm", kind: "dialog", width: 460, props: { part: "folder-edit", folder: id, machine } }) },
      { label: "Delete folder", icon: "close", act: () => remove(machine, id) },
    ];
  }

  pick(i) {
    const it = this.items()[i];
    this.close();
    it?.act();
  }

  render() {
    const t = theme();
    const current = folders(this.machine).list.find((x) => x.id === this.id)?.color ?? null;
    const swatch = (color) => div().id(`folder-color-${color ?? "grey"}`).size(20).flex_none().rounded(10).cursor_pointer()
      .bg(color ? MARK[color] : t.dim).border_2().border_color(color === current ? t.foreground : t.popover)
      .hover((s) => s.border_color(t.muted))
      .on_click(() => { paint(this.machine, this.id, color); this.close(); });
    return v_flex().id("folder-menu").size_full().p(5).gap(1).bg(t.popover).text_color(t.foreground).text_size(12.5)
      .when(Boolean(this.handle), (el) => el.track_focus(this.handle)).on_key_down((e, cx) => { if (menuKey(e.key, this.state, this.items().length, (i) => this.pick(i), () => this.close())) { cx.stop_propagation(); cx.notify(); } })
      .child(h_flex().px(8).pt(6).pb(8).gap(6).items_center().children([null, ...Object.keys(MARK)].map(swatch)))
      .children(menuRows(t, "folder-item", this.items(), this.state, (i) => this.pick(i)));
  }
}
