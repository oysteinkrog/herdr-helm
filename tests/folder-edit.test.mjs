import { test } from "node:test";
import assert from "node:assert/strict";
import { resetHerdr } from "./herdr-stub.mjs";
import { nameFollows, rulesFollow, tildePath, FolderEdit, NEW_FOLDER } from "../helm/parts/folder-edit.js";
import { FolderMenu } from "../helm/parts/folder-menu.js";
import { KEYS } from "../helm/lib/store.js";

const H = globalThis.__herdr;

test("the name follows the start folder until typed over", () => {
  assert.equal(nameFollows("", "~/code/app"), true);
  assert.equal(nameFollows(NEW_FOLDER, "~/code/app"), true);
  assert.equal(nameFollows("app", "~/code/app"), true);
  assert.equal(nameFollows("My app", "~/code/app"), false);
});

test("the rules follow the start folder until edited", () => {
  assert.equal(rulesFollow(null, "~/a"), true);
  assert.equal(rulesFollow("~/a", "~/a"), true);
  assert.equal(rulesFollow("wbso-ai", "~/a"), false);
});

test("a picked folder under home is written with ~", () => {
  assert.equal(tildePath("/home/x/code", "/home/x"), "~/code");
  assert.equal(tildePath("/srv/data", "/home/x"), "/srv/data");
});

// An InputState stand-in that keeps its value and calls its change handlers.
function input(value = "") {
  const on = {};
  return { v: value, on(ev, fn) { (on[ev] ??= []).push(fn); }, value() { return this.v; },
    set_value(v) { this.v = v; }, type(v) { this.v = v; for (const fn of on.change ?? []) fn(null, { notify() {} }); },
    focus() {}, set_selected_range() {} };
}

test("a new folder exists only after Save, and Save keeps what was typed", () => {
  resetHerdr({ store: new Map([[KEYS.folders, { "": { list: [], of: {} } }]]) });
  const e = new FolderEdit();
  e.init({ folder: "fnew", machine: null, fresh: true }, null);
  for (const k of ["name", "path", "match"]) e[k] = input(k === "name" ? NEW_FOLDER : "");
  e.nameMirror = true; e.mirror = true;
  assert.deepEqual(H.store.get(KEYS.folders)[""].list, []);
  e.path.set_value("~/code/app");
  e.follow();
  assert.equal(e.name.value(), "app");
  assert.equal(e.match.value(), "~/code/app");
  e.save();
  const list = H.store.get(KEYS.folders)[""].list;
  assert.equal(list.length, 1);
  assert.deepEqual({ id: list[0].id, name: list[0].name, path: list[0].path, match: list[0].match }, { id: "fnew", name: "app", path: "~/code/app", match: "~/code/app" });
});

test("the folder menu picks by keys and paints by swatch", () => {
  resetHerdr({ store: new Map([[KEYS.folders, { "": { list: [{ id: "f1", name: "A" }], of: { s1: "f1" } } }]]) });
  const m = new FolderMenu();
  m.init({ folder: "f1", machine: null }, null);
  assert.deepEqual(m.items().map((i) => i.label), ["New space here", "Edit folder…", "Delete folder"]);
  m.pick(1);
  assert.equal(H.overlays.at(-1).props.part, "folder-edit");
  m.pick(2);
  assert.deepEqual(H.store.get(KEYS.folders)[""].list, []);
  assert.deepEqual(H.store.get(KEYS.folders)[""].of, {});
});
