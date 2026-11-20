import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMANDS, ownerOf, claimHost, releaseHost, isHost } from "../helm/engines/host.js";
import { makePart } from "../helm/main.js";
import { Missing } from "../helm/parts/missing.js";

test("every command has one owner and a dash name", () => {
  for (const [c, owner] of Object.entries(COMMANDS)) {
    assert.match(c, /^[a-z]+(-[a-z]+)*$/);
    assert.equal(typeof owner, "string");
  }
  assert.equal(ownerOf("space-next"), "tabbar");
  assert.equal(ownerOf("nope"), null);
});

test("only one copy is host until it lets go", () => {
  const a = {}, b = {};
  assert.equal(claimHost(a), true);
  assert.equal(claimHost(b), false);
  assert.equal(isHost(a), true);
  releaseHost(b);
  assert.equal(isHost(a), true);
  releaseHost(a);
  assert.equal(claimHost(b), true);
  releaseHost(b);
});

test("an unknown part name gets the Missing part", () => {
  assert.ok(makePart("nope") instanceof Missing);
});
