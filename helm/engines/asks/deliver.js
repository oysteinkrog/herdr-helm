// Delivering an answer to the agent that asked.
//
// An option in a dialog: check the dialog is still up and is not a several-question wizard,
// press the option's number, press Enter only if the dialog is still there after 1.5 s, then wait
// up to 8 s for the agent to react, probing every 400 ms with `hc get`. Text (a typed answer, or
// a card answered by message): `hc send --json`, with --force into a live dialog; if nothing
// started, press Enter when the text sits on the prompt line, else send once more. Never more
// than one extra attempt. A dialog the person declined in the terminal is not an answer.
//
// From herdr-agent-ask at 764155f, mods/asks/main.js (MIT, see NOTICE). Changed for helm: taken
// out of the panel into a class the panel and the host's asks-accept share.
import { hc, run } from "herdr";
import { readState, update, stillAsking, stillIdle, liveTerminal, wizardOn, declinedOn, logAnswer } from "./state.js";

// How long to wait for the agent to react to an answer. hc holds a paste or key press until
// nobody has typed in that terminal for ~3 s, and a turn takes a moment to start.
export const SETTLE_MS = 8000;

const one = (s) => (s ?? "").replace(/\s+/g, " ").trim();

// Questions of a multi-question card; older cards stored them as plain strings.
export const questionsOf = (ask) => (ask.questions ?? []).map((q) => (typeof q === "string" ? { text: q, options: [], recommended: null } : { text: q.text, options: q.options ?? [], recommended: q.recommended ?? null }));

// One message with every drafted answer, numbered like the agent's questions.
export function draftsMessage(ask, drafts) {
  return questionsOf(ask).map((q, i) => (drafts[i] ? `${i + 1}. ${q.text} → ${drafts[i]}` : null)).filter(Boolean).join("\n");
}

export const setAsk = (id, patch) => update((s) => { const a = s.asks.find((x) => x.id === id); if (a) Object.assign(a, patch); });

export class Delivery {
  // config: () => the asks.json settings; debug: (line) => void; onSend: () => void (the panel
  // clears its text box when a text answer goes out).
  constructor({ config = () => null, debug = () => {}, onSend = () => {} } = {}) {
    this.config = config;
    this.debug = debug;
    this.onSend = onSend;
  }

  stale(ask) { setAsk(ask.id, { state: "stale", note: "Resolved in terminal", ended_at: Date.now() }); }

  // The dialog on screen is a several-question wizard: turn the card into a notice and press
  // nothing. True when it was.
  async wizard(ask) {
    const r = await hc(["read", ask.address, "--json"]);
    const tabs = r.code === 0 ? wizardOn(JSON.parse(r.stdout).text ?? "") : null;
    if (!tabs) return false;
    setAsk(ask.id, { state: "pending", wizard: true, options: [], recommended: null, chosen: null, answer: null, error: null,
      question: `${tabs.length} questions in one dialog: ${tabs.join(" · ")}. Answer them in the terminal.` });
    return true;
  }

  async probe(address) {
    const r = await hc(["get", address, "--json"]);
    if (r.code !== 0) return null;
    const g = JSON.parse(r.stdout);
    const st = typeof g.status === "string" ? g.status : g.status?.state ?? null;
    return { state: g.state === "live" ? st : "gone", msg: typeof g.status === "object" ? g.status?.msg ?? "" : "", turn: g.turn ?? 0 };
  }

  // Probe every 400 ms until `done(g)` or the time is up; returns the last probe.
  async settle(address, sleep, done, ms = SETTLE_MS) {
    const until = Date.now() + ms;
    let g = null;
    for (;;) {
      g = await this.probe(address);
      if (!g || g.state === "gone" || done(g)) return g;
      if (Date.now() >= until) return g;
      await sleep(400);
    }
  }

  // Press the option's number; Enter only if the dialog is still there (Claude Code selects on
  // the number alone).
  answer(ask, option, cx) {
    // A prose question: the option is sent as a message, not pressed as a key. `send` is the
    // message behind a button whose label is not the message (Continue → "continue").
    if (ask.delivery === "send") return this.sendText(ask, option.send ?? option.label.replace(/\s*\(recommended\)\s*$/i, ""), cx);
    if (!stillAsking(ask)) return this.stale(ask);
    const sentTurn = liveTerminal(ask.address)?.turn ?? ask.turn ?? 0;
    setAsk(ask.id, { state: "sending", answer: option.label, chosen: option, error: null, sent_turn: sentTurn, sent_at: Date.now() });
    const same = (g) => g.state === "blocked" && g.msg === ask.msg && g.turn <= sentTurn;
    return this.deliver(ask, cx, async (sleep) => {
      // The screen first, every time (also on Retry and asks-accept): a wizard's tab bar means
      // the report's one question is not the whole dialog, and a key would answer the wrong one.
      if (await this.wizard(ask)) return { wizard: true };
      let r = await hc(["keys", ask.address, String(option.n)]);
      if (r.code !== 0) throw new Error(one(r.stderr) || "Could not press the key");
      let g = await this.settle(ask.address, sleep, (g) => !same(g), 1500);
      if (g && same(g)) {
        if (await this.wizard(ask)) return { wizard: true };
        r = await hc(["keys", ask.address, "enter"]);
        if (r.code !== 0) throw new Error(one(r.stderr) || "Could not press Enter");
        g = await this.settle(ask.address, sleep, (g) => !same(g));
      }
      return g;
    });
  }

  // Free text into a dialog (Claude Code's question dialog takes typed text as its own answer)
  // or to an idle agent.
  sendText(ask, text, cx) {
    const live = stillAsking(ask);
    if (!live && !stillIdle(ask)) return setAsk(ask.id, { state: "stale", note: ask.stopped ? "Continued in terminal" : ask.delivery === "send" ? "Answered in terminal" : "Resolved in terminal", ended_at: Date.now() });
    const sentTurn = liveTerminal(ask.address)?.turn ?? ask.turn ?? 0;
    setAsk(ask.id, { state: "sending", answer: text, chosen: { text }, error: null, sent_turn: sentTurn, sent_at: Date.now() });
    this.onSend();
    // Taken: the turn moved on, or (idle agent) it is no longer idle, or (dialog) the dialog is
    // gone. A stopped agent that still reports its error on the same turn has not taken it either.
    const taken = (g) => g.turn > sentTurn || (live ? !(g.state === "blocked" && g.msg === ask.msg) : !(g.state === "idle" || g.state === "done" || (ask.stopped && g.state === "error")));
    return this.deliver(ask, cx, async (sleep) => {
      // `hc send --json` reports whether the message started a turn. Codex now and then drops a
      // paste: when nothing started and the text is not sitting in the input box, send it once
      // more; if it is sitting there unsent, press Enter. Never more than one extra attempt.
      const send = (force) => hc(["send", "--json", ...(force ? ["--force"] : []), ask.address, text]);
      let r = await send(live);
      this.debug(`${ask.id} send${live ? " --force" : ""} turn ${sentTurn}: code ${r.code} out ${one(r.stdout).slice(0, 200)} err ${one(r.stderr).slice(0, 200)}`);
      if (r.code !== 0) throw new Error(one(r.stderr) || "Could not send the answer");
      let started = null;
      try { started = JSON.parse(r.stdout).started ?? null; } catch { /* older hc: no JSON */ }
      let g = await this.settle(ask.address, sleep, taken, started === false ? 1500 : SETTLE_MS);
      if (g && !taken(g) && started === false) {
        // "In the box" means on a prompt line (`› Spaces`, `❯ Spaces`), not anywhere on screen: a
        // short answer such as `Spaces` is usually also in the agent's question.
        const head = text.split("\n")[0].slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rd = await hc(["read", ask.address, "--json"]);
        const onScreen = rd.code === 0 && Boolean(head) && new RegExp(`^[›❯>]\\s*${head}`, "m").test(JSON.parse(rd.stdout).text ?? "");
        this.debug(`${ask.id} not started; text on screen: ${onScreen}`);
        if (onScreen) await hc(["keys", ask.address, "enter"]);
        else { r = await send(true); this.debug(`${ask.id} resent: ${one(r.stdout).slice(0, 200)}`); }
        g = await this.settle(ask.address, sleep, taken);
      }
      this.debug(`${ask.id} settled: ${JSON.stringify(g)} taken=${g ? taken(g) : null}`);
      if (g && !taken(g)) return { state: "blocked", msg: ask.msg };
      return g;
    });
  }

  sendDrafts(ask, drafts, cx) {
    const text = draftsMessage(ask, drafts);
    if (text) this.sendText(ask, text, cx);
    return Boolean(text);
  }

  deliver(ask, cx, act) {
    return new Promise((done) => cx.spawn(async (cx) => {
      const sleep = (ms) => new Promise((res) => cx.timer.after(ms, () => res()));
      try {
        const g = await act(sleep);
        if (g?.wizard) return;
        if (g && g.state === "blocked" && g.msg === ask.msg) throw new Error("Not delivered: the agent did not react. Retry sends it again, or answer in the terminal.");
        // A dialog that closed because the person said no in the terminal is not an answer.
        const rd = await hc(["read", ask.address, "--json"]);
        if (rd.code === 0 && declinedOn(JSON.parse(rd.stdout).text ?? "")) { setAsk(ask.id, { state: "stale", note: "Declined in terminal", ended_at: Date.now(), answer: null }); return; }
        const now = Date.now();
        setAsk(ask.id, { state: "delivered", answered_at: now, error: null });
        await logAnswer(readState().asks.find((a) => a.id === ask.id) ?? ask, this.config(), now);
      } catch (e) {
        setAsk(ask.id, { state: "failed", error: String(e?.message ?? e) });
      } finally { cx.notify(); done(); }
    }));
  }

  retry(ask, cx) {
    // The earlier answer may have landed after delivery gave up: never send it twice.
    const t = liveTerminal(ask.address);
    if (t && ask.sent_turn != null && (t.turn ?? 0) > ask.sent_turn) {
      const now = Date.now();
      setAsk(ask.id, { state: "delivered", answered_at: now, error: null, note: "Picked up late" });
      logAnswer(ask, this.config(), now, "picked up late");
      return;
    }
    if (ask.chosen?.text) return this.sendText(ask, ask.chosen.text, cx);
    if (ask.chosen) return this.answer(ask, ask.chosen, cx);
    setAsk(ask.id, { state: "pending", error: null });
  }

  // `helm.asks-accept`: the newest waiting ask in scope, answered with the option its agent
  // recommends (or the first, for an approval). spaceId null means every space.
  accept(spaceId, cx) {
    const ask = readState().asks.find((a) => a.state === "pending" && (!spaceId || a.space === spaceId) && a.options.length && a.kind !== "UNCLEAR");
    if (ask) return this.answer(ask, ask.options[ask.recommended ?? 0], cx);
    return null;
  }

  open(ask) {
    // A closed agent has no pane to focus: say so on the card instead of a failed-command toast.
    if (!liveTerminal(ask.address)) return setAsk(ask.id, { state: "stale", note: "Agent closed", ended_at: Date.now() });
    if (ask.pane) run("pane.focus", { pane: ask.pane });
    else run("agent.focus", { terminal: ask.address });
    return null;
  }
}
