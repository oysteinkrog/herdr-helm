// Where asks come from, one builder per source. Each one turns what a terminal shows into a card:
//
//   dialog    a blocked terminal: the agent shows a dialog (its status report says what it asks)
//   stopped   a terminal in error: the turn stopped (no connection, the API down), Continue
//   turn      a finished turn whose last message asks the person something (the classifier says)
//
// A new source (Slack, say) adds a builder here; delivery and the panel need no change, because
// each card says how it is answered (`delivery: "send"` for a message, else keys in a dialog).
//
// From herdr-agent-ask at 764155f, mods/tabs-asks/engine.js (MIT, see NOTICE). Changed for helm:
// the card builders taken out of the engine's tick and checkTurn, unchanged in what they make.
import { hash, reportOf, msgOf, agentName } from "./state.js";
import { parseReport } from "./parse.js";

const one = (s) => (s ?? "").replace(/\s+/g, " ").trim();

// The fields every card shares: who asks, where, and an empty answer.
function base(t, agent, now) {
  return {
    address: t.address, pane: agent?.pane ?? null, space: agent?.space ?? t.labels?.["herdr.space"] ?? null,
    space_name: agent?.space_name ?? (t.labels?.where ?? "").split(" / ")[0] ?? "",
    agent: agentName(agent, t), program: agent?.program ? { key: agent.program.key, name: agent.program.name, icon: agent.program.icon, tint: agent.program.tint } : null,
    app: reportOf(t)?.app ?? agent?.app ?? null, cwd: t.cwd ?? null, turn: t.turn ?? 0,
    detected_at: now, state: "pending",
    answer: null, answered_at: null, error: null, note: null,
  };
}

export const dialogId = (t) => `${t.address}:${t.turn ?? 0}:${hash(msgOf(t))}`;
export const stoppedId = (t) => `${t.address}:e:${t.turn ?? 0}`;
export const turnId = (t) => `${t.address}:p:${t.turn ?? 0}`;

// A dialog: the status report is parsed first (question, permission, auth); the screen fills in
// the rest later (enrich in detect.js).
export function dialogAsk(t, agent, now) {
  const msg = msgOf(t), parsed = parseReport(reportOf(t));
  const ask = {
    id: dialogId(t), ...base(t, agent, now), msg,
    kind: parsed?.kind ?? "UNCLEAR", question: parsed?.question ?? "", options: parsed?.options ?? [], recommended: parsed?.recommended ?? null,
    context: "", raw: "", source: parsed?.source ?? "none", confidence: parsed ? 1 : 0, enriched: false,
  };
  // A logged-out agent: the report says it all, there is no dialog to read.
  if (ask.kind === "STOPPED") ask.enriched = true;
  return ask;
}

// A turn that stopped on an error: one card per (terminal, turn), Continue sends "continue".
export function stoppedAsk(t, agent, now) {
  return {
    id: stoppedId(t), ...base(t, agent, now), msg: msgOf(t), delivery: "send", stopped: true,
    kind: "STOPPED", question: one(msgOf(t)) || "Stopped on an error", options: [{ n: 1, label: "Continue", send: "continue", detail: "" }], recommended: null,
    context: "", raw: "", source: "report", confidence: 1, enriched: true,
  };
}

// A finished turn that ends asking the person something, from the classifier's answer `model`.
export function turnAsk(t, agent, model, message, now) {
  return {
    id: turnId(t), ...base(t, agent, now), msg: "", delivery: "send",
    kind: "QUESTION", question: model.question, options: model.options.map((label, i) => ({ n: i + 1, label, detail: "" })), recommended: model.recommended,
    questions: (model.questions ?? []).map((q) => ({ text: q.text, options: q.options.map((label, i) => ({ n: i + 1, label, detail: "" })), recommended: q.recommended })),
    context: model.context, raw: message.slice(-3000), source: "model", confidence: model.confidence, enriched: true,
  };
}
