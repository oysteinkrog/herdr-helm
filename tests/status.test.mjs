import { test } from "node:test";
import assert from "node:assert/strict";
import { paletteHint } from "../helm/parts/status.js";

test("the palette hint shows the key as bound", () => {
  assert.equal(paletteHint([{ section: "global", action: "app.palette", keys: "ctrl-shift-p" }], "linux"), "Ctrl+Shift+P  commands");
  assert.equal(paletteHint([{ section: "global", action: "app.palette", keys: "cmd-shift-p" }], "macos"), "⌘⇧P  commands");
  assert.equal(paletteHint([], "linux"), "commands");
});
