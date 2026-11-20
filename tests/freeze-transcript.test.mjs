// freeze.sh keeps a copy of each Claude transcript and thaw puts a missing one back.
// Runs the real script with a temporary HOME and a fake hc on PATH.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from "node:fs";
import { join } from "node:path";

const SCRIPT = new URL("../helm/bin/freeze.sh", import.meta.url).pathname;
const SID = "11111111-2222-3333-4444-555555555555";

function setup() {
  const home = mkdtempSync(join(process.env.TMPDIR || "/var/tmp", "freeze-test-"));
  const bin = join(home, "bin"); mkdirSync(bin);
  // hc get: a live idle shell of space sp1 (pid 999999 has no children); send is logged.
  writeFileSync(join(bin, "hc"), `#!/bin/bash
case "$1" in
  get) echo '{"address":"t1","name":"moss","state":"live","pid":999999,"foreground":{"pid":999999},"labels":{"herdr.space":"sp1"}}' ;;
  send) echo "$3" >> "$HOME/sent" ;;
  ls) echo '{"terminals":[]}' ;;
esac
`);
  chmodSync(join(bin, "hc"), 0o755);
  const proj = join(home, ".claude/projects/-p-life"); mkdirSync(join(proj, SID), { recursive: true });
  writeFileSync(join(proj, `${SID}.jsonl`), '{"x":1}\n');
  writeFileSync(join(proj, SID, "custom-title.json"), "{}");
  const state = join(home, ".local/state/space-freeze"); mkdirSync(state, { recursive: true });
  writeFileSync(join(state, "sp1.json"), JSON.stringify({ space: "sp1", name: "moss", terminals: [
    { address: "t1", name: "moss", kind: "claude", session: SID, cwd: home, resume: `claude --resume ${SID}` }] }));
  const run = (...args) => {
    try {
      return JSON.parse(execFileSync("bash", [SCRIPT, ...args], { env: { ...process.env, HOME: home, XDG_STATE_HOME: join(home, ".local/state"), PATH: `${bin}:${process.env.PATH}` } }).toString());
    } catch (e) { return JSON.parse(e.stdout.toString()); }
  };
  return { home, proj, state, run };
}

test("backup copies the transcript, thaw restores it after it was deleted", () => {
  const { home, proj, state, run } = setup();
  assert.deepEqual(run("backup", "sp1"), { copied: 1, missing: [] });
  rmSync(join(proj, `${SID}.jsonl`)); rmSync(join(proj, SID), { recursive: true });
  const r = run("thaw", "sp1");
  assert.deepEqual(r, { thawed: 1, left: 0, errors: [] });
  assert.equal(readFileSync(join(proj, `${SID}.jsonl`), "utf8"), '{"x":1}\n');
  assert.ok(existsSync(join(proj, SID, "custom-title.json")));
  assert.match(readFileSync(join(home, "sent"), "utf8"), new RegExp(SID));
  assert.ok(existsSync(join(state, "transcripts", SID, "thawed")));
  rmSync(home, { recursive: true });
});

test("thaw keeps the space frozen and says why when the transcript and its copy are gone", () => {
  const { home, proj, state, run } = setup();
  rmSync(join(proj, `${SID}.jsonl`));
  const r = run("thaw", "sp1");
  assert.equal(r.thawed, 0); assert.equal(r.left, 1);
  assert.match(r.errors[0], /moss: the transcript of Claude session .* is gone/);
  assert.ok(existsSync(join(state, "sp1.json")));
  assert.equal(existsSync(join(home, "sent")), false);
  rmSync(home, { recursive: true });
});
