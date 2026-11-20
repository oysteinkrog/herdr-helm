// The Edit folder dialog (460 wide): Name, "Start new spaces in" (with Choose… on this computer)
// and "Collect spaces from". The name follows the start folder's last part until typed over, and
// the rules follow the start folder until edited. Enter saves, Escape cancels. A new folder
// exists only after Save.
//
// From herdr-space-folders at 63a78b2 (MIT); see NOTICE. Changed for helm: a part of its own,
// the dialog frame from lib/ui.js, the follow rules as plain functions with tests.
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, closeOverlay, pickFolder, home } from "herdr";
import { button, dialog } from "../lib/ui.js";
import { folders, saveEdit } from "../engines/spaces/folders.js";
import { lastPart } from "../lib/names.js";

export const NEW_FOLDER = "New folder";

// Whether the name still follows the start folder: empty, the default, or that folder's last part.
export const nameFollows = (name, path) => !name || name === NEW_FOLDER || name === lastPart(path);
// Whether the rules still follow the start folder: empty, or the same text.
export const rulesFollow = (match, path) => !match || match === path;
// A picked folder written with "~" for this computer's home.
export const tildePath = (picked, homeDir) => (picked.startsWith(homeDir) ? `~${picked.slice(homeDir.length)}` : picked);

export class FolderEdit {
  static sample = { folder: "f-sample", machine: null, fresh: true };

  init(p, cx) {
    this.id = p.folder;
    this.machine = p.machine ?? null;
    this.fresh = Boolean(p.fresh);
    this.overlay = p.overlay ?? null;
    const f = folders(this.machine).list.find((x) => x.id === this.id) ?? { name: NEW_FOLDER };
    this.name = InputState.new({ value: f.name ?? "" });
    this.path = InputState.new({ value: f.path ?? "", placeholder: "e.g. ~/Documents/github.com/owner/repo" });
    this.match = InputState.new({ value: f.match ?? "", placeholder: "e.g. wbso-ai, ~/code/client-*" });
    this.mirror = rulesFollow(f.match, f.path);
    this.nameMirror = nameFollows(this.name.value(), this.path.value());
    this.path.on("change", (_e, cx) => { this.follow(); cx.notify(); });
    this.match.on("change", () => { this.mirror = this.match.value() === this.path.value(); });
    this.name.on("change", () => { this.nameMirror = nameFollows(this.name.value(), this.path.value()); });
    for (const input of [this.name, this.path, this.match]) input.on("submit", () => this.save());
    this.name.set_selected_range({ start: 0, end: this.name.value().length });
    this.name.focus();
    // The overlay window takes focus a moment after it opens; ask again then.
    cx?.timer?.after(300, () => this.name.focus());
  }

  // The rules and the name, while they follow the start folder, set from it.
  follow() {
    const path = this.path.value();
    if (this.mirror && this.match.value() !== path) this.match.set_value(path);
    const part = lastPart(path);
    if (this.nameMirror && part && part !== this.name.value()) this.name.set_value(part);
  }

  save() {
    saveEdit(this.machine, this.id, this.fresh, {
      name: this.name.value().trim(),
      path: this.path.value().trim() || null,
      match: this.match.value().trim() || null,
    }, NEW_FOLDER);
    closeOverlay(this.overlay);
  }

  // The system's folder picker, for this computer only.
  choose(cx) {
    cx.spawn(async (cx) => {
      const picked = await pickFolder({ prompt: "Start new spaces in" });
      if (!picked) return;
      this.path.set_value(tildePath(picked, home()));
      this.follow();
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const field = (label, input, hint, extra = null) => v_flex().gap(6)
      .child(div().text_size(12).font_medium().text_color(t.muted).child(label))
      .child(h_flex().gap(8)
        .child(div().flex_1().min_w(0).h(34).px(10).flex().items_center().rounded(8).border_1().border_color(t.input).bg(t.background)
          .child(Input.new(input).w_full().text_size(13).text_color(t.foreground)))
        .when(Boolean(extra), (el) => el.child(extra)))
      .when(Boolean(hint), (el) => el.child(div().text_size(11.5).text_color(t.dim).child(hint)));
    return dialog(t, "folder-edit", {
      title: "Edit folder",
      onEscape: () => closeOverlay(this.overlay),
      body: v_flex().gap(16)
        .child(field("Name", this.name, null))
        .child(field("Start new spaces in", this.path, "Its + and New space here open a space there.",
          this.machine ? null : button(t, "folder-choose", "Choose…", (_e, cx) => this.choose(cx))))
        .child(field("Collect spaces from", this.match,
          "Spaces working in these folders join this one. Comma-separated: a folder name like wbso-ai, or a path like ~/code/client-*.")),
      buttons: [
        button(t, "folder-cancel", "Cancel", () => closeOverlay(this.overlay)),
        button(t, "folder-save", "Save", () => this.save(), { primary: true }),
      ],
    });
  }
}
