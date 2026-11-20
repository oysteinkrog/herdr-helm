// From herdr-agent-ask at 764155f, tests/ (MIT, see NOTICE). Changed for helm: import paths,
// and the notice card helm dropped.
// The parsers stay free of Herdr, so they run under plain Node.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("parse.js imports nothing from Herdr", () => {
  const src = fs.readFileSync(new URL("../helm/engines/asks/parse.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /from "herdr"/);
});
