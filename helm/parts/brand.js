// The brand bar at the top of the sidebar: logo and name, search, and the sidebar toggle.
// From the Herdr app's shipped workspace-chrome mod v0.1.16 (Apache-2.0, see NOTICE).
// Changed for helm: a helm part, helm's icons and hover rule, no macOS padding.
import { div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, updates } from "herdr";
import { icon, iconButton, hoverBg } from "../lib/ui.js";
import { narrow, toggleSidebar } from "../lib/layout.js";

export class Brand {
  render() {
    const t = theme();
    const rail = narrow();
    return h_flex().size_full().bg(t.chrome).pl(rail ? 6 : 14).pr(10).gap(4).items_center().text_size(13.5)
      .when(!rail, (el) => el.child(h_flex().flex_1().gap(8).items_center()
        .child(image("frame/welcome/herdr.png").size(20).rounded(5))
        .child(div().font_semibold().text_color(t.foreground).child("Herdr"))))
      .when(!rail, (el) => el.child(iconButton(t, "search", svg(icon("search")).size(15), () => run("mod.open", { name: "picker" }), { tooltip: "Search", color: t.muted })))
      .child(iconButton(t, "sidebar-toggle", svg(icon("sidebar")).size(15), toggleSidebar, { tooltip: rail ? "Show the sidebar" : "Fold the sidebar", color: t.muted }));
  }
}

// The sidebar's footer: Settings (with a dot when an app update is ready) and Add machine.
export class Footer {
  render() {
    const t = theme();
    const rail = narrow();
    const row = (id, name, label, dim, action) => h_flex().id(id).h(28).px(8).gap(9).items_center().rounded(8)
      .when(rail, (el) => el.relative().w(32).px(0).justify_center().tooltip(label))
      .text_color(dim ? t.dim : t.muted).hover((s) => s.bg(hoverBg(t, "chrome")).text_color(t.foreground)).cursor_pointer()
      .on_click(action).child(svg(icon(name)).size(14))
      .when(!rail, (el) => el.child(label));
    const ready = div().size(6).rounded_full().bg(t.accent);
    return v_flex().size_full().bg(t.chrome).border_t(1).border_color(t.border).px(8).pt(4).pb(8).text_size(13)
      .when(rail, (el) => el.px(0).items_center())
      .child(row("settings", "settings", "Settings", false, () => run("app.settings"))
        .when(Boolean(updates()?.app?.ready), (el) => el.child(rail ? ready.absolute().top(5).right(6) : ready)))
      .child(row("machine", "plus", "Add machine", true, () => run("mod.open", { name: "machine-add" })));
  }
}
