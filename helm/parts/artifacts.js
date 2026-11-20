// The Artifacts panel: the claude.ai artifacts a Claude Code conversation published, and the
// links it wrote, for the selected agent or every agent in the space. A row opens its URL; a copy
// button shows on hover. A search box covers everything shown.
//
// From herdr-artifacts at 7d85899, artifacts/main.js (MIT, see NOTICE). Changed for helm: the
// scan and search in engines/artifacts.js, other machines' agents scanned there, the scope in
// helm.prefs, helm.artifacts-* commands, the scroll rule (PLAN.md 2.6a), the hover rule, icons.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { theme, shared, checking } from "herdr";
import { icon, hoverBg, spinner } from "../lib/ui.js";
import { prefs, setPref } from "../lib/store.js";
import { REFRESH_MS, ago, spaceAgents, shownAgents, scan, search, tag } from "../engines/artifacts.js";

export class Artifacts {
  init(_p, cx) {
    this.byAddress = {};
    this.loading = false;
    this.error = null;
    this.showTouched = false;
    this.hovered = null;      // url of the row under the pointer
    this.collapsed = {};      // address -> true (space view)
    this.moreLinks = {};      // address -> true: every link, not the first six
    this.linksOpen = {};      // address -> true: the agent view's Links section is open
    this.collapsedLinks = {}; // address -> true: a space-view links group is folded
    this.spaceLinksOpen = false;
    this.query = "";
    this.typing = false;
    this.selected = 0;
    this.lastKey = "";
    this.list = ScrollHandle.new();
    this.found = ScrollHandle.new();
    this.handle = cx?.focus_handle?.() ?? null;
    this.input = InputState.new({ placeholder: "Search artifacts and links" });
    this.input.on("change", (_e, cx) => { this.query = this.input.value(); this.selected = 0; cx.notify(); });
    this.input.on("submit", (_e, cx) => { const r = this.results()[this.selected]; if (r) cx.open_url(r.url); });
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    if (checking()) return;
    this.refresh(cx);
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
  }

  close() { this.list.release(); this.found.release(); }

  get scope() { return prefs().artifactsScope === "space" ? "space" : "agent"; }

  // Keys bound to helm.artifacts-<command>.
  command(c, cx) {
    if (c === "artifacts-refresh") this.refresh(cx, true);
    else if (c === "artifacts-scope") this.flipScope(cx);
    else if (c === "artifacts-seen") this.showTouched = !this.showTouched;
    else if (c === "artifacts-search") { if (this.typing) this.flipScope(cx); else this.input.focus(); }
    else if (c === "artifacts-links") {
      if (this.scope === "space") this.spaceLinksOpen = !this.spaceLinksOpen;
      else for (const a of this.shown()) this.linksOpen[a.address] = !this.linksOpen[a.address];
    } else if (c === "artifacts-latest") {
      const first = this.shown().map((a) => this.byAddress[a.address]).find((e) => e?.published?.length);
      if (first) cx.open_url(first.published[0].url);
    }
  }

  flipScope(cx) {
    setPref("artifactsScope", this.scope === "agent" ? "space" : "agent");
    this.refresh(cx, true);
  }

  shown() { return shownAgents(this.scope); }

  results() { return search(this.query, this.shown(), this.byAddress, this.scope === "agent"); }

  refresh(cx, force = false) {
    const addresses = this.shown().map((a) => a.address);
    if (!force && this.loading) return;
    if (!force && this.inflightAt && Date.now() - this.inflightAt < REFRESH_MS - 200) return;
    if (!addresses.length) { this.byAddress = {}; this.error = null; return; } // also called from render: no notify
    this.loading = true; this.inflightAt = Date.now();
    cx.spawn(async (cx) => {
      try {
        const r = await scan(addresses);
        this.byAddress = { ...this.byAddress, ...r.byAddress };
        this.error = r.errors.length ? r.errors.join("; ") : null;
      } catch (e) {
        this.error = `Scan failed: ${e}`;
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
  }

  // A copy control that shows while its row is hovered (or just copied): a check confirms for
  // 1.5 s. The column is always kept so the row's numbers don't shift.
  copyControl(url, t, visible) {
    const copied = this.copied === url;
    if (!visible && !copied) return div().size(20).flex_none();
    return div().id(`copy-${url}`).size(20).flex_none().flex().items_center().justify_center().rounded(5).cursor_pointer()
      .text_color(copied ? t.done ?? t.accent : t.dim).hover((s) => s.bg(hoverBg(t, "raised")).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        cx.write_to_clipboard(url);
        this.copied = url; cx.notify();
        cx.timer.after(1500, (cx) => { if (this.copied === url) this.copied = null; cx.notify(); });
      })
      .child(svg(icon(copied ? "check" : "copy")).size(12));
  }

  hoverRow(url) {
    return (over, cx) => {
      const next = over ? url : (this.hovered === url ? null : this.hovered);
      if (next !== this.hovered) { this.hovered = next; cx.notify(); }
    };
  }

  row(a, t, indent = 0) {
    const published = a.publishes > 0 || Boolean(a.summarized);
    return h_flex().id(`art-${a.url}`).h(30).pl(8 + indent).pr(6).gap(8).items_center().rounded(7).cursor_pointer().flex_none()
      .hover((s) => s.bg(hoverBg(t, "background"))).on_hover(this.hoverRow(a.url))
      .on_click((_e, cx) => cx.open_url(a.url))
      .child(svg(icon("artifact")).size(14).flex_none().text_color(published ? t.accent : t.dim))
      .child(div().flex_1().min_w(0).truncate().text_color(published ? t.foreground : t.muted).child(a.title || a.url))
      .child(div().flex_none().w(46).text_right().text_size(11).text_color(published && a.version ? t.muted : t.dim).child(tag(a)))
      .child(div().flex_none().w(30).text_right().text_size(11).text_color(t.dim).child(ago(a.last_ts)))
      .child(this.copyControl(a.url, t, this.hovered === a.url));
  }

  linkRow(l, t, indent) {
    return h_flex().id(`link-${l.url}`).h(30).pl(8 + indent).pr(6).gap(8).items_center().rounded(7).cursor_pointer()
      .hover((s) => s.bg(hoverBg(t, "background"))).on_hover(this.hoverRow(l.url))
      .on_click((_e, cx) => cx.open_url(l.url))
      .child(svg(icon("link")).size(13).flex_none().text_color(t.muted))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(l.title || l.url))
      .when(Boolean(l.host) && l.title !== l.host && !l.title.startsWith(l.host), (e) => e.child(div().flex_none().max_w(120).truncate().text_size(11).text_color(t.dim).child(l.host)))
      .child(div().flex_none().w(30).text_right().text_size(11).text_color(t.dim).child(ago(l.last_ts)))
      .child(this.copyControl(l.url, t, this.hovered === l.url));
  }

  clearSearch(cx) {
    this.query = ""; this.selected = 0; this.input.set_value("");
    this.handle?.focus(); cx.notify();
  }

  resultRow(r, i, t) {
    const on = i === this.selected;
    const artifact = r.kind === "artifact";
    const label = artifact ? tag(r.item) : "";
    return h_flex().id(`result-${r.kind}-${r.url}`).h(46).px(8).gap(9).items_center().rounded(7).cursor_pointer()
      .when(on, (e) => e.bg(t.selected))
      .on_click((_e, cx) => cx.open_url(r.url))
      .on_hover((hovered, cx) => { if (hovered && this.selected !== i) { this.selected = i; cx.notify(); } })
      .child(svg(icon(artifact ? "artifact" : "link")).size(14).flex_none().text_color(artifact ? t.accent : t.muted))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(div().truncate().text_color(t.foreground).child(r.title))
        .child(div().truncate().text_size(11).text_color(t.dim).child(r.detail.join("  ·  "))))
      .child(v_flex().flex_none().items_end().gap(1)
        .child(div().text_size(11).text_color(artifact ? t.muted : t.dim).child(label || (r.item.host ?? "")))
        .child(div().text_size(11).text_color(t.dim).child(ago(r.ts))));
  }

  // One agent's link rows, with a "more" toggle past the first six.
  linkRows(agent, links, t, indent) {
    const all = Boolean(this.moreLinks[agent.address]);
    const shown = all ? links : links.slice(0, 6);
    return v_flex().flex_none().gap(1)
      .children(shown.map((l) => this.linkRow(l, t, indent)))
      .when(links.length > 6, (e) => e.child(div().id(`more-links-${agent.address}`).h(24).pl(8 + indent + 21).flex().items_center().text_size(11).text_color(t.muted).cursor_pointer().hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => { this.moreLinks[agent.address] = !all; cx.notify(); })
        .child(all ? "Show fewer" : `${links.length - 6} more`)));
  }

  // The header's switch: this agent, or every agent in the space.
  scopeSwitch(t) {
    const option = (scope, label) => {
      const on = this.scope === scope;
      return div().id(`scope-${scope}`).px(7).py(2).rounded(4).cursor_pointer().text_size(10.5)
        .bg(on ? t.selected : t.background).text_color(on ? t.foreground : t.dim).hover((s) => s.bg(on ? t.selected : hoverBg(t, "background")))
        .on_click((_e, cx) => { if (!on) this.flipScope(cx); cx.notify(); }).child(label);
    };
    return h_flex().p(2).gap(1).rounded(6).border_1().border_color(t.border).child(option("agent", "Agent")).child(option("space", "Space"));
  }

  render(cx) {
    const t = theme();
    const { list: all, selected } = spaceAgents();
    const list = this.shown();
    const key = `${this.scope}|${list.map((a) => `${a.address}:${a.status}`).join(",")}`;
    // A new selection or a turn ending (status change) scans again at once.
    if (key !== this.lastKey) { this.lastKey = key; this.refresh(cx, true); }
    const entries = list.map((a) => ({ agent: a, scan: this.byAddress[a.address] }));
    const total = entries.reduce((n, e) => n + (e.scan?.published?.length ?? 0), 0);
    const seen = entries.reduce((n, e) => n + (e.scan?.touched?.length ?? 0), 0);
    const single = this.scope === "agent";

    const header = h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().font_semibold().child("Artifacts"))
      .child(div().px(5).py(1).rounded(4).border_1().border_color(t.border).text_size(10).text_color(t.muted).child(`${total}`))
      .child(div().flex_1())
      .when(seen > 0, (el) => el.child(div().id("toggle-seen").px(6).py(2).rounded(5).cursor_pointer().text_size(10.5).text_color(this.showTouched ? t.foreground : t.dim).bg(this.showTouched ? t.selected : t.background)
        .hover((s) => s.bg(this.showTouched ? t.selected : hoverBg(t, "background")))
        .on_click((_e, cx) => { this.showTouched = !this.showTouched; cx.notify(); }).child(`${seen} seen`)))
      .when(all.length > 1 || this.scope === "space", (el) => el.child(this.scopeSwitch(t)))
      .child(div().id("refresh").size(20).flex().items_center().justify_center().rounded(5).cursor_pointer().text_color(t.dim).hover((s) => s.bg(hoverBg(t, "background")))
        .on_click((_e, cx) => this.refresh(cx, true))
        .child(this.loading ? spinner(t, 12) : svg(icon("refresh")).size(12)));

    const agentLine = (agent, s, folded, first) => h_flex().id(`agent-${agent.address}`).h(30).when(!first, (e) => e.mt(8)).px(8).gap(8).items_center().rounded(7)
      .cursor_pointer().hover((x) => x.bg(hoverBg(t, "background"))).on_click((_e, cx) => { this.collapsed[agent.address] = !folded; cx.notify(); })
      .child(svg(icon(folded ? "chevron-right" : "chevron-down")).size(12).flex_none().text_color(t.dim))
      .child(div().size(7).rounded(4).flex_none().bg(t[agent.status] ?? t.idle))
      .child(div().flex_1().min_w(0).truncate().font_medium().text_color(t.foreground).child(agent.tab_name || agent.title || s?.session_name || agent.address))
      .child(s && !s.session
        ? div().flex_none().text_size(11).text_color(t.dim).child("no session")
        : div().flex_none().h(18).px(7).rounded(9).bg(t.raised).flex().items_center().text_size(10.5).font_medium().text_color(t.muted).child(s ? `${s.published.length}` : "…"));

    const note = (text, pl) => div().pl(pl).py(4).text_size(11.5).text_color(t.dim).child(text);
    const emptyFor = (s, items, pl) => {
      if (s && !s.session) return note("Not a Claude Code session Herdr can read yet.", pl);
      if (s?.session && !s.transcript) return note("No transcript yet; it appears after the first message.", pl);
      if (s?.transcript && !items.length) return note("Nothing published in this conversation yet.", pl);
      return null;
    };
    // A section label that folds: "Links  10". Links start closed; artifacts stay open.
    const sectionLabel = (id, label, count, open, onToggle, pl = 8) => h_flex().id(id).h(26).pl(pl).pr(8).gap(6).items_center().rounded(6).cursor_pointer().hover((s) => s.bg(hoverBg(t, "background")))
      .on_click((_e, cx) => onToggle(cx))
      .child(svg(icon(open ? "chevron-down" : "chevron-right")).size(12).flex_none().text_color(t.dim))
      .child(div().text_size(11).font_medium().text_color(t.dim).child(label))
      .child(div().text_size(11).text_color(t.dim).child(`${count}`));

    const artifactItems = (s) => [...(s?.published ?? []), ...(this.showTouched ? s?.touched ?? [] : [])];
    const totalLinks = entries.reduce((n, e) => n + (e.scan?.links?.length ?? 0), 0);

    let children;
    if (single) {
      const { agent, scan: s } = entries[0] ?? {};
      const items = artifactItems(s);
      const linksOpen = Boolean(agent && this.linksOpen[agent.address]);
      children = [
        agent ? emptyFor(s, items, 8) : null,
        ...items.map((a) => this.row(a, t, 0)),
        agent && s?.links?.length
          ? v_flex().id("agent-links").flex_none().gap(1).mt(items.length ? 8 : 2)
            .child(sectionLabel(`links-${agent.address}`, "Links", s.links.length, linksOpen, (cx) => { this.linksOpen[agent.address] = !linksOpen; cx.notify(); }))
            .when(linksOpen, (e) => e.child(this.linkRows(agent, s.links, t, 0)))
          : null,
      ].filter(Boolean);
    } else {
      // Space view: every agent's artifacts first, then every agent's links, each by tab.
      const artifactGroups = entries.map(({ agent, scan: s }, i) => {
        const items = artifactItems(s);
        const folded = Boolean(this.collapsed[agent.address]);
        return v_flex().id(`group-${agent.address}`).flex_none().gap(1)
          .child(agentLine(agent, s, folded, i === 0))
          .when(!folded, (el) => el.child(emptyFor(s, items, 8 + 20 + 22) ?? div()))
          .when(!folded, (el) => el.children(items.map((a) => this.row(a, t, 20))));
      });
      const linkGroups = entries.filter((e) => e.scan?.links?.length).map(({ agent, scan: s }) => {
        const folded = Boolean(this.collapsedLinks[agent.address]);
        return v_flex().flex_none().gap(1)
          .child(h_flex().id(`links-agent-${agent.address}`).h(28).pl(16).pr(8).gap(8).items_center().rounded(7).cursor_pointer().hover((x) => x.bg(hoverBg(t, "background")))
            .on_click((_e, cx) => { this.collapsedLinks[agent.address] = !folded; cx.notify(); })
            .child(svg(icon(folded ? "chevron-right" : "chevron-down")).size(12).flex_none().text_color(t.dim))
            .child(div().size(7).rounded(4).flex_none().bg(t[agent.status] ?? t.idle))
            .child(div().flex_1().min_w(0).truncate().text_size(12.5).font_medium().text_color(t.muted).child(agent.tab_name || agent.title || s.session_name || agent.address))
            .child(div().flex_none().text_size(11).text_color(t.dim).child(`${s.links.length}`)))
          .when(!folded, (el) => el.child(this.linkRows(agent, s.links, t, 28)));
      });
      children = [
        ...artifactGroups,
        totalLinks
          ? v_flex().id("space-links").flex_none().gap(1).mt(12).pt(8).border_t(1).border_color(t.border)
            .child(sectionLabel("links-space", "Links", totalLinks, this.spaceLinksOpen, (cx) => { this.spaceLinksOpen = !this.spaceLinksOpen; cx.notify(); }))
            .when(this.spaceLinksOpen, (e) => e.children(linkGroups))
          : null,
      ].filter(Boolean);
    }

    // Another part asked for the search box through shared "artifacts.focusSearch": the first
    // time it focuses the box; asked again while the box has focus, it flips the scope.
    const asked = shared("artifacts.focusSearch");
    if (asked && asked !== this.focusAsked) {
      this.focusAsked = asked;
      cx.timer.after(30, (cx) => { if (this.typing) this.flipScope(cx); else this.input.focus(); });
    }

    const searching = this.query.trim().length > 0;
    const results = searching ? this.results() : [];
    if (this.selected >= results.length) this.selected = Math.max(0, results.length - 1);
    const nArt = results.filter((r) => r.kind === "artifact").length, nLink = results.length - nArt;
    const searchBar = h_flex().flex_none().px(8).pt(8).pb(4).gap(6).items_center()
      .child(h_flex().id("artifacts-search").flex_1().min_w(0).h(30).px(9).gap(7).items_center().rounded(8).border_1().border_color(this.typing ? t.accent : t.border).bg(t.background).cursor_text()
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .child(svg(icon("search")).size(13).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(12.5).text_color(t.foreground))
        .when(searching, (e) => e.child(div().id("search-clear").size(18).flex_none().flex().items_center().justify_center().rounded(4).text_size(12).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(hoverBg(t, "background")).text_color(t.foreground))
          .on_click((_e, cx) => this.clearSearch(cx)).child("×")))
        .when(!searching && !this.typing, (e) => e.child(div().flex_none().text_size(10.5).text_color(t.dim).child(single ? "this agent" : "whole space"))));

    // Two scroll areas, each with its own id and handle for its whole life (PLAN.md 2.6a).
    const resultsBody = v_flex().id("artifacts-results").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.found).p(6).gap(1)
      .child(div().id("results-count").px(8).pb(4).text_size(11).text_color(t.dim).child(results.length
        ? `${nArt} artifact${nArt === 1 ? "" : "s"} · ${nLink} link${nLink === 1 ? "" : "s"} · ${single ? "this agent" : "whole space"} · ↵ opens`
        : `Nothing matches in ${single ? "this agent's conversation" : "this space"}`))
      .children(results.map((r, i) => this.resultRow(r, i, t)));

    const body = v_flex().id("artifacts-list").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.list).p(6).gap(2)
      .when(!all.length, (el) => el.child(div().p(10).text_color(t.dim).text_size(12).child("No Claude Code agent in this space yet. Start one and its artifacts appear here as it publishes them.")))
      .when(Boolean(this.error), (el) => el.child(div().p(10).text_color(t.ansi1).text_size(11).child(this.error)))
      .when(single && all.length > 0 && !selected, (el) => el.child(div().px(10).pt(4).pb(2).text_size(11).text_color(t.dim).child("Select an agent to see its artifacts; showing the space's first one.")))
      .children(children);

    return v_flex().id("artifacts").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .when(Boolean(this.handle), (el) => el.track_focus(this.handle))
      .on_key_down((e, cx) => {
        if (!this.typing) return;
        if (e.key === "escape") { this.clearSearch(cx); cx.stop_propagation(); }
        else if (e.key === "down" && results.length) { this.selected = Math.min(results.length - 1, this.selected + 1); cx.stop_propagation(); cx.notify(); }
        else if (e.key === "up" && results.length) { this.selected = Math.max(0, this.selected - 1); cx.stop_propagation(); cx.notify(); }
      })
      .child(header).child(searchBar).child(searching ? resultsBody : body);
  }
}
