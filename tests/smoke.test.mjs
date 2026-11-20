import { test } from "node:test";
import assert from "node:assert/strict";
import { shared, setShared, run } from "herdr";
import { resetHerdr } from "./herdr-stub.mjs";

test("the stubs load and record calls", () => {
  resetHerdr();
  setShared("helm.x", { a: 1 });
  assert.deepEqual(shared("helm.x"), { a: 1 });
  run("space.select", { id: "s1" });
  assert.deepEqual(globalThis.__herdr.runs, [["space.select", { id: "s1" }]]);
});
