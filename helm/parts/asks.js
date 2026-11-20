// The Asks panel (top half of the panel's asks child): every decision an agent is waiting on, as
// a card you answer from here, for the shown space or all spaces. The host finds the asks
// (engines/asks/detect.js); this part shows them and delivers answers (engines/asks/deliver.js).
//
// From herdr-agent-ask at 764155f, mods/asks/main.js (MIT, see NOTICE). Changed for helm: the
// scope kept in helm.prefs, delivery in its own module, the scroll rule (PLAN.md 2.6a), the hover
// rule, helm's icons.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { spaces, focused, theme, checking } from "herdr";
import { icon, hoverBg, spinner, programIcon } from "../lib/ui.js";
import { prefs, setPref } from "../lib/store.js";
import { readState, update, age, loadConfig } from "../engines/asks/state.js";
import { Delivery, questionsOf, setAsk } from "../engines/asks/deliver.js";

const KIND = { APPROVAL: "blocked", DECISION: "accent", QUESTION: "working", STOPPED: "blocked", UNCLEAR: "dim", NOTICE: "dim" };
const one = (s) => (s ?? "").replace(/\s+/g, " ").trim();

// The cards in scope: waiting (pending, sending, failed) and finished (not dismissed).
export function sortAsks(asks, spaceId, all, now) {
  const mine = asks.filter((a) => a.notice || all || a.space === spaceId);
  const pending = mine.filter((a) => a.state === "pending" || a.state === "sending" || a.state === "failed");
  const done = mine.filter((a) => !pending.includes(a) && a.state !== "dismissed");
  const today = done.filter((a) => a.state === "delivered" && now - a.answered_at < 86400000).length;
  return { pending, done, today };
}

export class Asks {
  init(_p, cx) {
    this.showAnswered = false;
    this.other = null;
    this.otherText = "";
    // Multi-question cards: which question is unfolded, and the answers drafted so far
    // ({ [ask.id]: { [index]: text } }). Sent together with "Send answers".
    this.openQ = null; this.otherQ = null; this.drafts = {}; this.openCtx = new Set();
    this.scroll = ScrollHandle.new();
    this.config = null;
    this.input = InputState.new({ placeholder: "Type a different answer, Enter to send" });
    this.delivery = new Delivery({
      config: () => this.config,
      debug: () => {},
      onSend: () => { this.other = null; this.input.set_value(""); this.otherText = ""; },
    });
    this.input.on("change", (_e, cx) => { this.otherText = this.input.value(); cx.notify(); });
    this.input.on("submit", (_e, cx) => {
      const text = this.otherText.trim();
      if (this.otherQ) { if (text) this.draft(this.otherQ.id, this.otherQ.i, text); this.otherQ = null; this.input.set_value(""); this.otherText = ""; cx.notify(); return; }
      const ask = readState().asks.find((a) => a.id === this.other);
      if (ask && text) this.delivery.sendText(ask, text, cx);
    });
    if (checking()) return;
    const config = (cx) => cx.spawn(async (cx) => { this.config = await loadConfig(); cx.notify(); });
    config(cx);
    cx.timer.every(30000, config);
  }

  close() { this.scroll.release(); }

  get all() { return prefs().asksScope === "all"; }

  draft(id, i, text) { (this.drafts[id] ??= {})[i] = text; this.openQ = null; }

  card(ask, t, now) {
    const d = this.delivery;
    const sending = ask.state === "sending", failed = ask.state === "failed";
    const questions = questionsOf(ask), drafts = this.drafts[ask.id] ?? {}, drafted = Object.keys(drafts).length;
    const color = t[KIND[ask.kind] ?? "dim"];
    const wide = this.openCtx.has(ask.id);
    const chip = (text, c) => div().px(5).h(16).flex_none().flex().items_center().rounded(4).text_size(10).font_semibold().bg(c).opacity(0.9).text_color(t.background).child(text);
    const action = (id, iconName, label, fn, primary) => h_flex().id(id).h(26).px(8).gap(5).items_center().rounded(7).flex_none().text_size(11.5).cursor_pointer()
      .border_1().border_color(primary ? t.input : t.border).bg(primary ? t.raised : t.surface).text_color(primary ? t.foreground : t.muted)
      .hover((s) => s.bg(hoverBg(t, primary ? "raised" : "surface")).text_color(t.foreground)).on_click((_e, cx) => fn(cx)).child(svg(icon(iconName)).size(12)).child(label);
    const option = (o, i) => v_flex().id(`opt-${ask.id}-${o.n}`).w_full().px(10).py(6).gap(2).rounded(8).border_1().border_color(ask.recommended === i ? t.accent : t.border).bg(t.background)
      .when(!sending, (el) => el.cursor_pointer().hover((s) => s.bg(hoverBg(t, "background")).border_color(t.input)).on_click((_e, cx) => d.answer(ask, o, cx)))
      .child(h_flex().gap(8).items_start()
        .child(div().w(18).h(18).mt(1).flex_none().rounded(4).flex().items_center().justify_center().text_size(10.5).font_semibold().bg(t.raised).text_color(t.muted).child(String(o.n)))
        .child(div().flex_1().min_w(0).text_size(12.5).child(o.label))
        .when(ask.recommended === i, (el) => el.child(div().mt(3).text_size(10).flex_none().text_color(t.accent).child("recommends"))))
      .when(Boolean(o.detail), (el) => el.child(div().pl(26).text_size(11).text_color(t.dim).child(o.detail)));
    const question = (q, i) => {
      const key = `${ask.id}:${i}`, open = this.openQ === key, chosen = drafts[i];
      const pick = (text) => (_e, cx) => { this.draft(ask.id, i, text); this.otherQ = null; cx.notify(); };
      return v_flex().id(`q-${ask.id}-${i}`).w_full().gap(4).rounded(8).px(6).py(4).when(open, (el) => el.bg(t.background))
        .child(h_flex().id(`qh-${ask.id}-${i}`).w_full().gap(8).items_start().cursor_pointer().hover((s) => s.text_color(t.foreground))
          .on_click((_e, cx) => { this.openQ = open ? null : key; if (this.otherQ && this.otherQ.i !== i) this.otherQ = null; cx.notify(); })
          .child(div().w(18).h(18).flex_none().rounded(4).flex().items_center().justify_center().text_size(10.5).font_semibold().bg(chosen ? t.accent : t.raised).text_color(chosen ? t.background : t.muted).child(String(i + 1)))
          .child(v_flex().flex_1().min_w(0).gap(1)
            .child(div().text_size(12).text_color(chosen || open ? t.foreground : t.muted).child(q.text))
            .when(Boolean(chosen), (el) => el.child(div().text_size(11.5).text_color(t.accent).child(`→ ${chosen}`)))))
        .when(open && !sending, (el) => el.child(v_flex().w_full().pl(26).gap(3)
          .children(q.options.map((o, j) => h_flex().id(`qo-${ask.id}-${i}-${j}`).w_full().px(8).py(4).gap(6).items_center().rounded(6).border_1()
            .border_color(q.recommended === j ? t.accent : t.border).bg(t.surface).cursor_pointer().hover((s) => s.bg(hoverBg(t, "surface")).border_color(t.input))
            .on_click(pick(o.label))
            .child(div().flex_1().min_w(0).text_size(12).child(o.label))
            .when(q.recommended === j, (el) => el.child(div().text_size(10).flex_none().text_color(t.accent).child("recommends")))))
          .child(this.otherQ?.id === ask.id && this.otherQ.i === i
            ? Input.new(this.input).w_full().h(30).px(10).rounded(6).border_1().border_color(t.accent).bg(t.surface).text_size(12).text_color(t.foreground)
            : h_flex().id(`qt-${ask.id}-${i}`).px(8).py(4).rounded(6).text_size(11.5).text_color(t.muted).cursor_pointer().hover((s) => s.text_color(t.foreground))
              .on_click((_e, cx) => { this.otherQ = { id: ask.id, i }; this.other = null; this.input.set_value(""); this.otherText = ""; this.input.focus(); cx.notify(); })
              .child(q.options.length ? "Other answer…" : "Type an answer…"))));
    };
    return v_flex().id(`ask-${ask.id}`).w_full().p(12).gap(8).rounded(10).bg(t.surface).border_1().border_color(failed ? t.blocked : t.border)
      .child(h_flex().gap(8).items_start()
        .child(div().flex_none().mt(2).child(programIcon(ask.program, 16, t.muted) ?? div().size(16).rounded(4).bg(t.muted).opacity(0.3)))
        .child(h_flex().flex_1().min_w(0).flex_wrap().gap_x(6).items_start()
          .child(div().min_w(0).font_semibold().text_size(12.5).child(ask.agent))
          .when(this.all && Boolean(ask.space_name), (el) => el.child(div().min_w(0).mt(1).text_size(11).text_color(t.dim).child(`· ${ask.space_name}`))))
        .when(sending, (el) => el.child(spinner(t, 12)))
        .child(div().flex_none().mt(1).text_size(11).text_color(t.dim).child(age(now - ask.detected_at))))
      // The context starts as one cut line beside the kind chip; a click opens it in full.
      .child(h_flex().id(`ctx-${ask.id}`).w_full().items_center()
        .when(!wide, (el) => el.gap(8).child(chip(ask.kind, color)))
        .when(wide, (el) => el.flex_wrap().gap_x(3).child(chip(ask.kind, color)).child(div().w(2).flex_none())
          .children(one(ask.context).split(" ").map((w) => div().min_w(0).truncate().text_size(11).text_color(t.dim).child(w))))
        .when(Boolean(ask.context), (el) => el.cursor_pointer()
          .on_click((_e, cx) => { if (wide) this.openCtx.delete(ask.id); else this.openCtx.add(ask.id); cx.notify(); }))
        .when(Boolean(ask.context) && !wide, (el) => el.child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).hover((s) => s.text_color(t.muted)).child(ask.context))))
      .child(div().w_full().text_size(13).text_color(t.foreground).child(ask.question || (ask.enriched ? "Needs you in the terminal" : "Reading the dialog…")))
      .when(ask.options.length > 0 && ask.kind !== "UNCLEAR", (el) => el.child(v_flex().w_full().gap(5).children(ask.options.map(option))))
      .when(questions.length > 1, (el) => el.child(v_flex().w_full().gap(4).children(questions.map(question))))
      .when(ask.kind === "UNCLEAR" && ask.enriched, (el) => el.child(div().text_size(11.5).text_color(t.dim).child("Asks could not read this dialog. Open the terminal to answer it.")))
      .when(this.other === ask.id, (el) => el.child(Input.new(this.input).w_full().h(32).px(10).rounded(8).border_1().border_color(t.accent).bg(t.background).text_size(12.5).text_color(t.foreground)))
      .when(failed, (el) => el.child(div().text_size(11.5).text_color(t.blocked).child(ask.error ?? "Failed")))
      .child(h_flex().gap(6).items_center().flex_wrap()
        .when(failed, (el) => el.child(action(`retry-${ask.id}`, "send", "Retry", (cx) => d.retry(ask, cx), true)))
        .when(!sending && drafted > 0, (el) => el.child(action(`send-${ask.id}`, "send", `Send answers (${drafted}/${questions.length})`, (cx) => { if (d.sendDrafts(ask, drafts, cx)) delete this.drafts[ask.id]; }, true)))
        .when(!sending && !ask.wizard && ask.kind !== "UNCLEAR" && ask.kind !== "APPROVAL", (el) => el.child(action(`other-${ask.id}`, "send", this.other === ask.id ? "Cancel" : ask.options.length ? "Other answer" : "Answer", (cx) => {
          this.other = this.other === ask.id ? null : ask.id;
          if (this.other) this.input.focus();
          cx.notify();
        })))
        .when(!ask.notice, (el) => el.child(action(`open-${ask.id}`, "terminal", "Open terminal", () => d.open(ask))))
        .child(div().flex_1())
        .when(!sending, (el) => el.child(action(`dismiss-${ask.id}`, "x", "Dismiss", () => setAsk(ask.id, { state: "dismissed", ended_at: Date.now() })))));
  }

  receipt(ask, t, now) {
    const delivered = ask.state === "delivered";
    return h_flex().id(`rc-${ask.id}`).w_full().min_h(26).px(8).py(4).gap(7).items_start().rounded(7).text_size(11.5).text_color(t.muted).hover((s) => s.bg(hoverBg(t, "background")))
      .cursor_pointer().on_click(() => this.delivery.open(ask))
      .child(svg(icon(delivered ? "check" : "x")).size(11).mt(4).flex_none().text_color(delivered ? t.done : t.dim))
      .child(div().flex_none().max_w(90).truncate().text_color(t.foreground).tooltip(ask.agent).child(ask.agent))
      .child(div().flex_1().min_w(0).child(delivered ? `→ ${one(ask.answer)}` : ask.note ?? ask.state))
      .child(div().flex_none().text_color(t.dim).child(age(now - (ask.answered_at ?? ask.ended_at ?? ask.detected_at))));
  }

  render() {
    const t = theme(), now = Date.now(), all = this.all;
    const space = spaces().find((s) => s.active), spaceId = space?.id ?? focused()?.space;
    const { pending, done, today } = sortAsks(readState().asks, spaceId, all, now);
    const toggle = (id, label, on, fn) => div().id(id).h(20).px(7).flex_none().flex().items_center().rounded(5).text_size(11).cursor_pointer()
      .bg(on ? t.selected : t.background).text_color(on ? t.foreground : t.dim).hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => { fn(); cx.notify(); }).child(label);
    return v_flex().id("asks").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child(this.config?.label ?? "Asks"))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim).child(all ? "All spaces" : space?.name ?? ""))
        .child(toggle("asks-all", "All", all, () => setPref("asksScope", all ? "space" : "all"))))
      .child(div().px(14).py(7).flex_none().text_size(11.5).text_color(t.dim).child(`${pending.length} waiting · ${today} answered today`))
      // One id and one scroll handle for the list's life (PLAN.md 2.6a); cards keep their ids.
      .child(v_flex().id("asks-list").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).px(8).pb(8).gap(8)
        .children(pending.map((a) => this.card(a, t, now)))
        .when(pending.length === 0, (el) => el.child(div().id("asks-empty").p(10).text_size(12).text_color(t.dim).child(`No asks waiting in ${all ? "any space" : space?.name ?? "this space"}. Agents show up here when they stop to ask you something.`)))
        .when(done.length > 0, (el) => el.child(v_flex().id("asks-answered").w_full().gap(2).pt(6)
          .child(h_flex().id("asks-done").h(24).px(8).gap(6).items_center().text_size(11).font_medium().text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground))
            .on_click((_e, cx) => { this.showAnswered = !this.showAnswered; cx.notify(); })
            .child(div().child("Answered")).child(div().child(String(done.length))).child(div().flex_1())
            // Clear: forget every finished card in the scope shown; waiting ones stay.
            .child(div().id("asks-clear").px(6).h(18).flex().items_center().rounded(4).text_size(10.5).text_color(t.dim).hover((s) => s.bg(hoverBg(t, "background")).text_color(t.foreground))
              .on_click((_e, cx) => { cx.stop_propagation(); const ids = new Set(done.map((a) => a.id)); update((s) => { s.asks = s.asks.filter((a) => !ids.has(a.id)); }); cx.notify(); })
              .child("Clear"))
            .child(svg(icon(this.showAnswered ? "chevron-down" : "chevron-right")).size(11).text_color(t.dim)))
          .when(this.showAnswered, (el) => el.children(done.slice(0, 30).map((a) => this.receipt(a, t, now)))))));
  }
}
