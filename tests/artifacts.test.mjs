import { test } from "node:test";
import assert from "node:assert/strict";
import { resetHerdr } from "./herdr-stub.mjs";
import { search, tag, scan, ago, local } from "../helm/engines/artifacts.js";

const H = globalThis.__herdr;

test("search: artifacts before links, title before URL, every word must match", () => {
  const byAddress = { t1: {
    published: [{ title: "Release notes", url: "https://claude.ai/a/1", last_ts: 5, publishes: 1, version: 2 }],
    touched: [{ title: "Draft", url: "https://claude.ai/a/release", last_ts: 9, publishes: 0 }],
    links: [{ title: "Release page", url: "https://example.com/r", host: "example.com", last_ts: 7 }],
  } };
  const shown = [{ address: "t1", tab_name: "docs" }];
  const r = search("release", shown, byAddress, true);
  assert.deepEqual(r.map((x) => x.title), ["Release notes", "Draft", "Release page"]);
  assert.deepEqual(search("release page", shown, byAddress, true).map((x) => x.title), ["Release page"]);
  assert.deepEqual(search("  ", shown, byAddress, true), []);
});

test("tags: version, earlier, seen", () => {
  assert.equal(tag({ publishes: 1, version: 3 }), "v3");
  assert.equal(tag({ publishes: 0, summarized: true }), "earlier");
  assert.equal(tag({ publishes: 0 }), "seen");
  assert.equal(ago(0), "");
  assert.equal(ago(1000, 1000 * 1000 + 120000), "2m");
});

test("scan: each machine's agents are scanned on that machine, keyed by full address", async () => {
  const calls = [];
  resetHerdr({ exec: async (cmd, args, opts) => {
    calls.push([opts.on ?? null, args[3]]);
    const list = args[3].split(",").map((a) => ({ address: a, published: [] }));
    return { code: 0, stdout: JSON.stringify({ terminals: list, errors: [] }), stderr: "" };
  } });
  const r = await scan(["t1", "box/t7", "t2"]);
  assert.deepEqual(calls, [[null, "t1,t2"], ["box", "t7"]]);
  assert.deepEqual(Object.keys(r.byAddress).sort(), ["box/t7", "t1", "t2"]);
  assert.equal(local("box/t7"), "t7");
  void H;
});
