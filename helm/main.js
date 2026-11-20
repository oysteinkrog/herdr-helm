// Spike for PLAN.md step 0.3. Each part logs what it sees to <app home>/helm-spike.log.
import { View, div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { props, nextCommand, exec, appHome, theme, checking, openOverlay, closeOverlay } from "herdr";

const log = (line) => { if (!checking()) exec("sh", ["-c", 'printf "%s %s\\n" "$(date +%T.%N | cut -c1-12)" "$1" >> "$2"', "spike", line, `${appHome()}/helm-spike.log`]).catch(() => {}); };

export default class Helm extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.part = p.part ?? (checking() ? "check-all" : "none");
    this.at = 0;
    log(`init part=${this.part} props=${JSON.stringify(p)}`);
    if (checking()) return;
    if (this.part === "menu") return;
    // (b) localStorage: part a writes, every part reads.
    try {
      if (this.part === "a") localStorage.setItem("spike", `written-by-a ${Date.now()}`);
      log(`ls part=${this.part} spike=${localStorage.getItem("spike")}`);
    } catch (e) { log(`ls part=${this.part} error=${e}`); }
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        log(`cmd part=${this.part} got=${JSON.stringify(c)}`);
        if (c === "lsread") log(`ls-again part=${this.part} spike=${localStorage.getItem("spike")}`);
        if (c === "popup" && this.part === "a") openOverlay({ mod: "helm", kind: "popup", width: 220, height: 200, props: { part: "menu" } });
        cx.notify();
      }
    });
  }

  render() {
    const t = theme();
    if (this.part === "menu") {
      return v_flex().id("spike-menu").w_full().p(5).bg(t.popover).text_color(t.foreground).children(["one", "two", "three", "four"].map((label, i) =>
        div().id(`row-${i}`).h(30).px(8).flex().items_center().rounded(6)
          .when(i === this.at, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.accent))
          .on_hover((on, cx) => { log(`hover row=${i} on=${on}`); if (on) { this.at = i; cx.notify(); } })
          .on_click(() => { log(`click row=${i}`); closeOverlay(props().overlay); })
          .child(label)));
    }
    if (this.part === "check-all") return v_flex().child("a").child("b");
    return div().size_full().p(6).bg(t.chrome).text_color(t.muted).child(`helm spike part ${this.part}`);
  }
}
