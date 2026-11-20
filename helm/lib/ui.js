// Drawing helpers shared by every helm part: icons, hover colours, menus, buttons and dialogs.
//
// The hover rule (PLAN.md 2.6): in frankenterm-gruvbox, hover, popover, surface and raised are
// the same colour, so a hover highlight on one of those backgrounds is invisible. hoverBg()
// picks `selected` when hover would not show. Parts never write `.bg(t.hover)` themselves
// (tests/ui.test.mjs checks the source). Menus show their target with a selected index that the
// keyboard and the pointer both move, so a stale hover (Herdr issue #753) never hides it.
import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";

export const icon = (name) => `mods/helm/icons/${name}.svg`;

// The colour a hovered row gets on a background named `base` (a theme name such as "popover").
export function hoverBg(t, base = "chrome") {
  const under = t[base] ?? base;
  return t.hover && t.hover.toLowerCase() !== String(under).toLowerCase() ? t.hover : t.selected;
}

// A hover highlight that shows on `base`.
export const hoverOn = (t, base) => (s) => s.bg(hoverBg(t, base));

export const spinner = (t, size = 12) => svg(icon("spinner")).size(size).flex_none().text_color(t.working).spin(900);

// A program's icon from the app's program table: a one-colour glyph or a picture.
export function programIcon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

// One agent status as a small mark: spinner (working), "Needs you" chip or "!" (blocked),
// a filled dot (done), a ring (idle).
export function statusMark(t, status, compact = false) {
  if (status === "working") return svg(icon("spinner")).size(12).mx(1).flex_none().text_color(t.working).spin(900);
  if (status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
  if (status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
  if (status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
  return div().size(7).mx(3).flex_none().rounded(4).bg(status === "done" ? t.done : t.dim + "00");
}

// A button. Primary is the solid colour; a disabled one is faded and does nothing.
export function button(t, id, label, onClick, { primary = false, enabled = true } = {}) {
  return h_flex().id(id).h(32).px(14).flex_none().items_center().rounded(8).border_1()
    .border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
    .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium()
    .when(!enabled, (el) => el.opacity(0.4))
    .when(enabled, (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)).on_click(onClick))
    .child(label);
}

// A small square icon button for bars (26 px), on background `base`.
export function iconButton(t, id, child, onClick, { base = "chrome", tooltip = null, color = null } = {}) {
  return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6)
    .text_color(color ?? t.dim).hover((s) => s.bg(hoverBg(t, base)).text_color(t.foreground))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .when(Boolean(tooltip), (el) => el.tooltip(tooltip))
    .on_click(onClick).child(child);
}

// Keys for a menu: up and down move `state.at`, Enter picks, Escape closes. Returns true when
// it handled the key.
export function menuKey(key, state, count, pick, close) {
  if (!count) return false;
  if (key === "down") state.at = (state.at + 1) % count;
  else if (key === "up") state.at = (state.at + count - 1) % count;
  else if (key === "enter") pick(state.at);
  else if (key === "escape") close();
  else return false;
  return true;
}

// Menu rows. items: [{ label, icon?, iconColor?, sep? }] (sep draws a line above the row).
// state: { at } on the part. The selected row uses t.selected, and the pointer moves it.
export function menuRows(t, idPrefix, items, state, pick) {
  return items.map((it, i) => v_flex()
    .when(Boolean(it.sep), (el) => el.child(div().mx(7).my(4).h(1).bg(t.border)))
    .child(h_flex().id(`${idPrefix}-${i}`).h(31).px(8).gap(9).rounded(7).items_center().text_color(t.foreground).cursor_pointer()
      .when(i === state.at, (el) => el.bg(t.selected))
      .on_hover((on, cx) => { if (on && state.at !== i) { state.at = i; cx.notify(); } })
      .on_click(() => pick(i))
      .child(it.icon ? svg(icon(it.icon)).size(14).flex_none().text_color(it.iconColor ?? t.muted) : div().size(14).flex_none())
      .child(div().flex_1().truncate().child(it.label))));
}

// A dialog's frame: title row (with an optional icon), body, and buttons on the right.
export function dialog(t, id, { title, iconName = null, body, buttons = [], handle = null, onEscape }) {
  return v_flex().id(id).when(Boolean(handle), (el) => el.track_focus(handle)).w_full().p(20).gap(14)
    .bg(t.popover).text_color(t.foreground).text_size(12.5)
    .on_key_down((e, cx) => { if (e.key === "escape") { onEscape?.(); cx.stop_propagation(); } })
    .child(h_flex().gap(8).items_center()
      .when(Boolean(iconName), (el) => el.child(svg(icon(iconName)).size(16).text_color(t.ansi4 ?? t.foreground)))
      .child(div().text_size(15).font_semibold().child(title)))
    .child(body)
    .when(buttons.length > 0, (el) => el.child(h_flex().pt(4).gap(8).justify_end().children(buttons)));
}
