// The classifier: a small model that reads a dialog or a finished turn's last message and says
// what is asked. It runs the Claude Code CLI (`claude -p --model haiku`) or the Codex CLI
// (`codex exec`), whichever `classifier` in asks.json picks (`auto`, `claude`, `codex`).
//
// From herdr-agent-ask at 764155f plus the fork's 4be19a2, mods/tabs-asks/engine.js (MIT, see
// NOTICE). Changed for helm: a class of its own, and no notice card when neither CLI is there
// (Oystein, 2026-11-20): that only goes to the debug log.
import { exec, appHome } from "herdr";
import { SCHEMA } from "./parse.js";

const one = (s) => (s ?? "").replace(/\s+/g, " ").trim();

export function prompt(text, ask, mode = "dialog") {
  return mode === "message" ? [
    "A coding agent just finished a turn and printed this message to the person. Decide whether it is waiting on an answer. Return JSON only.",
    "asks: true only if the agent needs the person to decide, confirm or tell it something before it can usefully continue (a real question, a choice, a go-ahead). false for rhetorical questions, offers like 'let me know if you want X', summaries, or finished work.",
    "kind: QUESTION when asks is true, else UNCLEAR.",
    "question: the thing being asked, under 160 characters, in the person's language, no preamble. If the message asks several separate questions, summarise what they are about, e.g. '9 questions before scaffolding: backend, first user, stack…'.",
    "questions: when the message asks several separate questions, one entry per question, in order: text = the question in its own words (no numbering); options = the alternatives the message lists under THAT question, as short labels in its own words, in order, empty if it gives none; recommended = 0-based index of the one the agent says it prefers, else null. Empty array for a single question.",
    "options: alternatives the message offers as answers to ONE question (A or B, yes or no, a list of candidates), as short labels in its own words, in order. A list of questions is never options. Empty if it asks open-endedly or asks several questions. Never invent.",
    "recommended: 0-based index of the option the agent said it prefers, else null.",
    "context: under 120 characters, past tense, what the agent did this turn.",
    "confidence: 0 to 1.",
    `Agent program: ${ask.app ?? ask.program?.name ?? "unknown"}.`,
    "Message:", "```", text.slice(-6000), "```",
  ].join("\n") : [
    "You classify a dialog a coding agent shows a person in its terminal. Return JSON only.",
    "kind: APPROVAL = a permission or confirmation gate; DECISION = enumerated options to choose from; QUESTION = open-ended; UNCLEAR = anything else or no dialog.",
    "question: what is being asked, under 160 characters, in the person's language, no preamble.",
    "options: copied verbatim from the screen, in order, without their numbers. Never invent, merge or reorder. Empty if none.",
    "questions: always empty here.",
    "recommended: 0-based index of an option the agent itself marked recommended, else null.",
    "context: under 120 characters, past tense, what the agent was doing when it stopped.",
    "confidence: 0 to 1.",
    `Agent program: ${ask.app ?? ask.program?.name ?? "unknown"}. Status report: ${JSON.stringify(ask.msg)}.`,
    "Screen (last lines):", "```", text.split("\n").slice(-45).join("\n").slice(-6000), "```",
  ].join("\n");
}

// The newest of several "path version" lines, or null.
export function newestCodex(stdout) {
  let best = null, bestV = [];
  for (const line of (stdout ?? "").split("\n")) {
    const m = /^(\S+) .*?(\d+)\.(\d+)\.(\d+)/.exec(line.trim());
    if (!m) continue;
    const v = [+m[2], +m[3], +m[4]];
    const newer = !best || v[0] > bestV[0] || (v[0] === bestV[0] && (v[1] > bestV[1] || (v[1] === bestV[1] && v[2] > bestV[2])));
    if (newer) { best = m[1]; bestV = v; }
  }
  return best ? { bin: best, version: bestV.join(".") } : null;
}

export class Classifier {
  constructor() { this.config = null; }

  // Forget the CLI lookups, after the config is read again.
  reset() { this._backend = undefined; this._codex = undefined; }

  // With `debug: true` in asks.json, one line per step goes to ~/.config/herdr-app/asks.log.
  debug(line) {
    if (!this.config?.debug) return;
    exec("sh", ["-c", 'printf "%s %s\n" "$(date +%H:%M:%S)" "$1" >> "$2"', "asks", String(line).slice(0, 600), `${appHome()}/asks.log`]).catch(() => {});
  }

  async classify(text, ask, mode = "dialog") {
    const backend = await this.backend();
    if (!backend) { this.debug("no classifier: neither claude nor codex is on PATH"); return null; }
    try {
      const p = prompt(text, ask, mode);
      const o = backend === "codex" ? await this.askCodex(p) : await this.askClaude(p);
      return o && Array.isArray(o.options) ? o : null;
    } catch (e) { this.debug(`${backend} threw: ${e?.message ?? e}`); return null; }
  }

  // Which CLI runs the classifier: `classifier` in asks.json, or `auto`: claude when installed,
  // else codex, else nothing. Looked up once; reset when the config is read again.
  async backend() {
    const want = this.config?.classifier ?? "auto";
    if (want === "claude") return "claude";
    if (want === "codex") return (await this.codexBin()) ? "codex" : null;
    if (this._backend !== undefined) return this._backend;
    const r = await exec("sh", ["-c", "command -v claude >/dev/null 2>&1 && echo claude"]);
    this._backend = r.code === 0 && /claude/.test(r.stdout) ? "claude" : (await this.codexBin()) ? "codex" : null;
    this.debug(`classifier: ${this._backend ?? "none"}`);
    return this._backend;
  }

  // The newest codex on this machine: Codex's own installer leaves an older copy in
  // ~/.local/bin that can sit first on PATH, and old versions reject newer model names.
  async codexBin() {
    if (this._codex !== undefined) return this._codex;
    const r = await exec("sh", ["-c", 'for b in "$(command -v codex 2>/dev/null)" /opt/homebrew/bin/codex /usr/local/bin/codex "$HOME/.local/bin/codex" "$HOME/.codex/bin/codex"; do [ -n "$b" ] && [ -x "$b" ] && printf "%s %s\n" "$b" "$("$b" --version 2>/dev/null | head -1)"; done']);
    const found = newestCodex(r.stdout);
    this._codex = found?.bin ?? null;
    this.debug(`codex: ${found ? `${found.bin} ${found.version}` : "none"}`);
    return this._codex;
  }

  async askClaude(p) {
    // Skipping the person's MCP servers and settings cuts the CLI's start from ~4 s to ~1 s;
    // the classifier needs neither (it runs no tools). A login that lives in settings
    // (apiKeyHelper, env) needs them though: on an auth error the call is made once more with
    // settings on, and that is remembered.
    const base = ["-p", "--no-session-persistence", "--model", this.config?.model ?? "haiku", "--output-format", "json", "--json-schema", SCHEMA, "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--tools", ""];
    const lean = !this._claudeNeedsSettings;
    let r = await exec("claude", [...base, ...(lean ? ["--setting-sources", ""] : []), p]);
    const text = `${r.stderr} ${r.stdout}`;
    if (lean && (r.code !== 0 || /"is_error":\s*true/.test(r.stdout)) && /log ?in|auth|api key|credential|unauthori[sz]ed|401/i.test(text)) {
      this.debug("claude: auth error without settings; retrying with the person's settings on");
      this._claudeNeedsSettings = true;
      r = await exec("claude", [...base, p]);
    }
    if (r.code !== 0) { this.debug(`claude exit ${r.code}: ${r.stderr} ${r.stdout.slice(0, 200)}`); return null; }
    const out = JSON.parse(r.stdout);
    if (out.is_error) { this.debug(`claude error: ${String(out.result).slice(0, 200)}`); return null; }
    return out.structured_output ?? (typeof out.result === "string" ? JSON.parse(out.result) : null);
  }

  // `codex exec` with the same schema: the schema goes to a file (that is how codex takes it)
  // and the answer is the last JSON line it prints. stdin is closed, or codex waits on it.
  async askCodex(p) {
    const schema = `${appHome()}/asks-schema.json`;
    const model = this.config?.codex_model ? ["-m", this.config.codex_model] : [];
    const bin = await this.codexBin();
    if (!bin) { this.debug("codex: not found"); return null; }
    const r = await exec("sh", ["-c", 'printf "%s" "$1" > "$2" || exit 1; bin="$3"; schema="$2"; prompt="$4"; shift 4; exec "$bin" exec --ephemeral --skip-git-repo-check -s read-only --output-schema "$schema" "$@" "$prompt" < /dev/null', "asks", SCHEMA, schema, bin, p, ...model]);
    if (r.code !== 0) { this.debug(`codex exit ${r.code}: ${one(r.stderr).slice(0, 200)} ${one(r.stdout).slice(0, 200)}`); return null; }
    const lines = r.stdout.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("{"));
    for (let i = lines.length - 1; i >= 0; i--) { try { return JSON.parse(lines[i]); } catch { /* next line */ } }
    this.debug(`codex gave no JSON: ${one(r.stdout).slice(0, 200)}`);
    return null;
  }
}
