// A pane's header in the krog layout's pane cards: program icon, name, folder and status; on
// hover, split right, split down, zoom and close. Props from the app: { pane, terminal }.
// From the Herdr app's shipped pane mod v0.1.16 (Apache-2.0, see NOTICE).
// Changed for helm: a helm part using helm's icons, status marks and hover rule.
import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, run, theme, home } from "herdr";
import { icon, programIcon, hoverBg } from "../lib/ui.js";
import { paneFrame } from "../lib/layout.js";
import { tilde } from "../lib/names.js";

export class PaneHeader {
  static sample = { pane: "p-sample", terminal: "t-sample" };

  init(p) {
    this.pane = p.pane;
    this.hovered = false;
  }

  button(t, id, name, command, args) {
    return div().id(id).p(3).rounded(4).text_color(t.dim)
      .hover((s) => s.bg(hoverBg(t, "background")).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); run(command, args); })
      .child(svg(icon(name)).size(14));
  }

  render() {
    const t = theme();
    const p = panes().find((x) => x.pane === this.pane);
    if (!p) return div();
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const pic = programIcon(p.program, 14, t.dim);
    const pane = p.pane;
    const bottom = paneFrame()?.header?.position === "bottom";
    return h_flex().id(`pane-head-${pane}`).size_full().px(10).gap(8).items_center().bg(t.background)
      .when(bottom, (el) => el.border_t(1)).when(!bottom, (el) => el.border_b(1)).border_color(t.border).text_size(12)
      .on_hover((on, cx) => { this.hovered = on; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).font_medium().text_color(t.foreground).child(name))
      .child(div().flex_1().truncate().text_color(t.dim).child(tilde(p.cwd, home())))
      .when(p.status === "working", (el) => el.child(svg(icon("spinner")).size(12).flex_none().text_color(t.working).spin(900)))
      .when(p.status === "blocked", (el) => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
      .when(p.status === "done", (el) => el.child(div().size(7).flex_none().rounded(4).bg(t.done)))
      .when(this.hovered, (el) => el
        .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane })));
  }
}
