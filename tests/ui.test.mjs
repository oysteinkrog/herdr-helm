import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { hoverBg, menuKey } from "../helm/lib/ui.js";

const gruvbox = { chrome: "#282828", popover: "#32302f", surface: "#32302f", raised: "#32302f", hover: "#32302F", selected: "#3b4b3c" };

test("hoverBg uses selected where hover would not show", () => {
  assert.equal(hoverBg(gruvbox, "popover"), "#3b4b3c");
  assert.equal(hoverBg(gruvbox, "surface"), "#3b4b3c");
  assert.equal(hoverBg(gruvbox, "chrome"), "#32302F");
});

test("menuKey moves, wraps, picks and closes", () => {
  const s = { at: 0 };
  let picked = null, closed = false;
  menuKey("up", s, 3, () => {}, () => {});
  assert.equal(s.at, 2);
  menuKey("down", s, 3, () => {}, () => {});
  assert.equal(s.at, 0);
  menuKey("enter", s, 3, (i) => { picked = i; }, () => {});
  assert.equal(picked, 0);
  menuKey("escape", s, 3, () => {}, () => { closed = true; });
  assert.equal(closed, true);
  assert.equal(menuKey("x", s, 3, () => {}, () => {}), false);
});

// The hover rule: only lib/ui.js may paint t.hover; everything else goes through hoverBg.
test("no part paints t.hover directly", () => {
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".js")) files.push(p); } };
  walk(new URL("../helm", import.meta.url).pathname);
  const bad = files.filter((f) => !f.endsWith("lib/ui.js") && /\bbg\(\s*t\.hover\s*\)/.test(readFileSync(f, "utf8")));
  assert.deepEqual(bad, []);
});
