import { test } from "node:test";
import assert from "node:assert/strict";
import { resetHerdr } from "./herdr-stub.mjs";
import { Spaces } from "../helm/parts/spaces.js";

const H = globalThis.__herdr;
const items = (ids) => ids.map((id) => ({ type: "space", key: `s:${id}`, space: { id } }));
const part = () => { const p = new Spaces(); p.init({}, null); return p; };
const front = (id) => { H.spaces = ["a", "b", "c", "d"].map((x) => ({ id: x, active: x === id })); };

test("the list scrolls only when the front space changes by a key, not on the first render or a redraw", () => {
  resetHerdr({ checking: true });
  const p = part();
  front("a");
  p.follow(items(["a", "b", "c", "d"]));
  p.follow(items(["a", "b", "c", "d"]));
  assert.deepEqual(p.scroll.asked, []);
  front("c");
  p.follow(items(["a", "b", "c", "d"]));
  assert.deepEqual(p.scroll.asked, [2]);
  p.follow(items(["a", "b", "x", "c", "d"])); // a row came in: no scroll
  assert.deepEqual(p.scroll.asked, [2]);
});

test("a click on a space's own row does not scroll the list", () => {
  resetHerdr({ checking: true });
  const p = part();
  front("a");
  p.follow(items(["a", "b", "c", "d"]));
  p.clicked = "d";
  front("d");
  p.follow(items(["a", "b", "c", "d"]));
  assert.deepEqual(p.scroll.asked, []);
});

test("a drag held on an edge strip walks one row at a time from the row under the pointer", () => {
  resetHerdr({ checking: true });
  const p = part();
  const cx = { notify() {} };
  p.rowCount = 5;
  p.hoverAt = 3;
  p.autoScroll(cx); // no drag: nothing
  p.pressed = 0;
  p.edge = 1;
  p.autoScroll(cx); p.autoScroll(cx); p.autoScroll(cx);
  assert.deepEqual(p.scroll.asked, [4]);
  p.edge = -1;
  p.autoScroll(cx); p.autoScroll(cx);
  assert.deepEqual(p.scroll.asked, [4, 3, 2]);
  p.resetDrag();
  p.autoScroll(cx);
  assert.deepEqual(p.scroll.asked, [4, 3, 2]);
});
