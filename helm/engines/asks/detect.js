// The Asks engine: finds asks, keeps their state and reads more about them. The host (the status
// part) runs it: its tick every second, so asks are found and toasted before the panel opens.
//
// From herdr-agent-ask at 764155f plus the fork's 4be19a2, mods/tabs-asks/engine.js (MIT, see
// NOTICE). Changed for helm: the state change in one pure function (detect) that tests call
// with a snapshot, card builders in sources.js, the classifier in classify.js, toasts open
// helm's Asks panel, and no notice card.
import { terminals, agents, focused, hc, notify } from "herdr";
import { readState, update, statusOf, msgOf, reportOf, wizardOn, logAnswer, MAX_ASKS, KEEP_MS } from "./state.js";
import { normalize, parseScreen, parseLastMessage } from "./parse.js";
import { dialogAsk, stoppedAsk, turnAsk, dialogId, stoppedId, turnId } from "./sources.js";
import { Classifier } from "./classify.js";

export const MAX_CHECKED = 300;
export const GONE_MS = 3000;
export const GIVE_UP_MS = 10 * 60 * 1000;
const OPEN = { name: "helm.asks-open" };

const staleAll = (s, address, now) => {
  for (const a of s.asks) if (a.address === address && a.state === "pending") { a.state = "stale"; a.note = "Resolved in terminal"; a.ended_at = now; }
};

// One step of the asks state, from a snapshot. Changes `s` in place and returns what the caller
// acts on: new cards (to read more about and toast), stopped cards (to toast), finished turns to
// read, and failed answers that turned out delivered (to log).
export function detect(s, { live, agentList, now, config, started }) {
  const byAddress = new Map(live.map((t) => [t.address, t]));
  const agentOf = (t) => agentList.find((x) => x.address === t.address) ?? null;
  const fresh = [], stopped = [], toCheck = [], healed = [];
  for (const t of live) {
    if (statusOf(t) !== "blocked") continue;
    const known = s.asks.find((a) => a.id === dialogId(t));
    if (known) {
      // Marked stale while the dialog is in fact still up (a reload, a slow report): bring it back.
      if (known.state === "stale") { known.state = "pending"; known.note = null; delete known.ended_at; }
      continue;
    }
    staleAll(s, t.address, now);
    const ask = dialogAsk(t, agentOf(t), now);
    s.asks.unshift(ask);
    fresh.push(ask);
  }
  for (const t of live) {
    if (statusOf(t) !== "error" || s.asks.some((a) => a.id === stoppedId(t))) continue;
    staleAll(s, t.address, now);
    const ask = stoppedAsk(t, agentOf(t), now);
    s.asks.unshift(ask);
    stopped.push(ask);
  }
  // Right after a reload terminals() can be empty or without reports for a moment: a card goes
  // stale only when its dialog has been gone for 3 s, and never while nothing is listed.
  if (live.length) for (const a of s.asks) {
    if (a.notice) continue;
    const t = byAddress.get(a.address);
    const st = statusOf(t);
    // An answer given up on (no reaction in time) was often just held by hc until the terminal
    // went quiet: once the agent moves on, it was delivered after all.
    if (a.state === "failed") {
      if (!t) { a.state = "stale"; a.note = "Agent closed"; a.ended_at = now; continue; }
      // Only a turn that moved on means the answer landed. A dialog that merely closed may have
      // been cancelled in the terminal: that card is resolved there, not delivered.
      if (a.sent_turn != null && (t.turn ?? 0) > a.sent_turn) { a.state = "delivered"; a.answered_at = now; a.error = null; a.note = "Picked up late"; healed.push(a); continue; }
      if (a.delivery !== "send" && !(st === "blocked" && msgOf(t) === a.msg)) { a.state = "stale"; a.note = "Resolved in terminal"; a.ended_at = now; continue; }
      if (now - (a.sent_at ?? a.detected_at) > GIVE_UP_MS) { a.state = "stale"; a.note = "Not delivered"; a.ended_at = now; }
      continue;
    }
    if (a.state !== "pending") continue;
    const gone = !t ? "Agent closed"
      : a.stopped ? (st === "error" && (t.turn ?? 0) === (a.turn ?? 0) ? null : "Continued in terminal")
      : a.delivery === "send" ? ((st === "idle" || st === "done") && (t.turn ?? 0) === (a.turn ?? 0) ? null : "Answered in terminal")
      : st !== "blocked" || msgOf(t) !== a.msg ? "Resolved in terminal" : null;
    if (!gone) { delete a.gone_since; continue; }
    a.gone_since ??= now;
    if (now - a.gone_since >= GONE_MS) { a.state = "stale"; a.note = gone; a.ended_at = now; delete a.gone_since; }
  }
  // Finished turns: a turn the agent ended in prose may still be a question for the person.
  // Each (address, turn) is checked once; the first pass skips turns already idle at start.
  s.checked ??= [];
  const checked = new Set(s.checked);
  if (config && config.trailing_questions !== false && config.classify !== "off") for (const t of live) {
    const st = statusOf(t);
    if (st !== "done" && st !== "idle") continue;
    const key = turnId(t);
    if (checked.has(key) || s.asks.some((a) => a.id === key)) continue;
    checked.add(key); s.checked.push(key);
    if (!started && st === "idle") continue;
    toCheck.push(t);
  }
  if (s.checked.length > MAX_CHECKED) s.checked = s.checked.slice(-MAX_CHECKED);
  s.asks = s.asks.filter((a) => a.state === "pending" || a.state === "sending" || now - (a.ended_at ?? a.answered_at ?? a.detected_at) < KEEP_MS).slice(0, MAX_ASKS);
  return { fresh, stopped, toCheck, healed };
}

export class Engine extends Classifier {
  constructor() { super(); this.enriching = new Set(); this.notified = new Set(); this.checking = new Set(); this.started = false; }

  // Every second: agents() is live, so a blocked agent is seen at once.
  tick(cx) {
    const live = terminals().filter((t) => t.state === "live");
    const agentList = agents();
    const out = update((s) => detect(s, { live, agentList, now: Date.now(), config: this.config, started: this.started }));
    if (this.config) this.started = true;
    const looking = (address) => focused()?.terminal === address;
    for (const a of out.healed) logAnswer(a, this.config, a.answered_at, "picked up late");
    for (const t of out.toCheck) this.checkTurn(t, agentList.find((x) => x.address === t.address) ?? null, cx);
    for (const ask of out.stopped) if (this.config?.toast && !looking(ask.address)) notify({ title: `${ask.agent} stopped`, body: ask.question, level: "warning", timeout: 5000, action: OPEN });
    for (const ask of out.fresh) {
      if (ask.kind !== "STOPPED") this.enrich(ask.id, cx);
      if (this.config?.toast !== false && !this.notified.has(ask.id) && !looking(ask.address)) {
        this.notified.add(ask.id);
        notify({ title: `${ask.agent} is asking`, body: ask.question || "needs your input", level: "warning", timeout: 5000, action: OPEN });
      }
    }
  }

  // Read the screen for numbering, the question line and context; ask a model only when the
  // report said nothing usable (another agent, or an unknown report).
  enrich(id, cx) {
    if (this.enriching.has(id)) return;
    this.enriching.add(id);
    cx.spawn(async (cx) => {
      try {
        const ask = readState().asks.find((a) => a.id === id);
        if (!ask) return;
        let screen = null;
        try {
          const r = await hc(["read", ask.address, "--json"]);
          if (r.code === 0) screen = JSON.parse(r.stdout);
        } catch { /* no screen: the report is all there is */ }
        const text = screen?.text ?? "";
        const parsed = parseScreen(text);
        const patch = { raw: text.split("\n").slice(-40).join("\n").slice(-3000), context: parsed.context, enriched: true };
        const tabs = wizardOn(text);
        if (tabs) {
          // Several questions in one dialog: the report only knows the first, so no option on the
          // card would be safe to press. The card says so and opens the terminal.
          Object.assign(patch, { kind: "DECISION", wizard: true, options: [], recommended: null,
            question: `${tabs.length} questions in one dialog: ${tabs.join(" · ")}. Answer them in the terminal.` });
          update((s) => { const a = s.asks.find((x) => x.id === id); if (a) Object.assign(a, patch); });
          return;
        }
        if (ask.source === "report") {
          // Keep the report's words; take the screen's numbering, question line and details when they line up.
          if (ask.options.length && parsed.options.length >= ask.options.length && ask.options.every((o, i) => parsed.options[i].label.startsWith(o.label.slice(0, 12)))) {
            patch.options = ask.options.map((o, i) => ({ ...o, n: parsed.options[i].n, detail: parsed.options[i].detail }));
          } else if (!ask.options.length && parsed.options.length) {
            patch.options = parsed.options;
          }
          if (parsed.question && ask.kind === "APPROVAL") patch.question = `${parsed.question} ${ask.question}`.trim();
        } else if (parsed.options.length) {
          patch.options = parsed.options; patch.source = "screen"; patch.confidence = 0.7;
          patch.kind = parsed.options.some((o) => /^yes\b/i.test(o.label)) && parsed.options.some((o) => /^no\b/i.test(o.label)) ? "APPROVAL" : "DECISION";
          if (parsed.question) patch.question = parsed.question;
        }
        if (this.config?.classify !== "off" && (this.config?.classify === "always" || (ask.source !== "report" && !patch.options?.length))) {
          const model = await this.classify(text, ask);
          if (model) {
            const seen = model.options.filter((o) => text.includes(o));
            if (seen.length === model.options.length && model.confidence >= 0.6) {
              patch.kind = model.kind; patch.question = model.question || patch.question || ask.question; patch.context = model.context || patch.context;
              if (!patch.options?.length && !ask.options.length) patch.options = model.options.map((label, i) => ({ n: parsed.options[i]?.n ?? i + 1, label, detail: "" }));
              patch.recommended = model.recommended; patch.source = patch.source === "screen" ? "screen+model" : "model"; patch.confidence = model.confidence;
            } else if (ask.source !== "report") { patch.kind = "UNCLEAR"; }
          }
        }
        if (patch.kind !== "UNCLEAR" && !(patch.options?.length ?? ask.options.length) && (patch.kind ?? ask.kind) !== "QUESTION" && ask.source !== "report") patch.kind = "UNCLEAR";
        update((s) => { const a = s.asks.find((x) => x.id === id); if (a) Object.assign(a, patch); });
      } finally { this.enriching.delete(id); cx.notify(); }
    });
  }

  // `helm.asks-recheck`: forget the finished-turn checks for every live agent's current turn, so
  // the next tick reads those turns again (after a rule change, or a miss).
  recheck() {
    const live = terminals().filter((t) => t.state === "live");
    const keys = new Set(live.map(turnId));
    update((s) => {
      s.checked = (s.checked ?? []).filter((k) => !keys.has(k));
      s.asks = s.asks.filter((a) => !(keys.has(a.id) && a.state !== "delivered"));
    });
    this.debug(`recheck ${[...keys].join(" ")}`);
  }

  // Read the finished turn; if it ends asking the person something, make a QUESTION card.
  checkTurn(t, agent, cx) {
    const key = turnId(t);
    if (this.checking.has(key)) return;
    this.checking.add(key);
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["read", t.address, "--json", "--lines", "100"]);
        if (r.code !== 0) { this.debug(`${key} read failed: ${r.stderr}`); return; }
        const text = JSON.parse(r.stdout).text ?? "";
        const { message, hasQuestion } = parseLastMessage(text, reportOf(t)?.app ?? agent?.app ?? null);
        this.debug(`${key} message ${message.length} chars, question=${hasQuestion}`);
        if (!hasQuestion || message.length < 8) return;
        // Not questions for the person: a login prompt or an API error the agent printed.
        if (/API Error|Please run \/login|rate limit/i.test(message)) { this.debug(`${key} skipped: error text`); return; }
        const model = normalize(await this.classify(message, { app: reportOf(t)?.app ?? agent?.app, program: agent?.program, msg: "" }, "message"));
        this.debug(`${key} model: ${JSON.stringify(model)}`);
        if (!model || !model.asks || model.confidence < 0.6) return;
        const ask = turnAsk(t, agent, model, message, Date.now());
        let added = false;
        update((s) => { if (!s.asks.some((a) => a.id === key)) { s.asks.unshift(ask); added = true; } });
        if (added && this.config?.toast && focused()?.terminal !== t.address) notify({ title: `${ask.agent} is asking`, body: ask.question, level: "warning", timeout: 5000, action: OPEN });
      } catch { /* a read or a parse failed: the turn stays checked */ }
      finally { this.checking.delete(key); cx.notify(); }
    });
  }
}
