// helm: one Herdr mod whose layout blocks and overlays each pick a part with props.part
// (PLAN.md 2.2). This file picks the part, hands it the key commands it owns, and, during
// `herdr-app check` (which passes no props), draws every part so one check covers all of them.
import { View } from "gpui-kit";
import { v_flex } from "gpui-base";
import { props, nextCommand, checking } from "herdr";
import { PARTS } from "./parts/index.js";
import { Missing } from "./parts/missing.js";
import { ownerOf } from "./engines/host.js";

export function makePart(name) {
  const Part = PARTS[name];
  return Part ? new Part() : new Missing(name);
}

export default class Helm extends View {
  init(_props, cx) {
    const p = props() ?? {};
    if (!p.part && checking()) {
      this.all = Object.entries(PARTS).map(([name, Part]) => {
        const part = new Part();
        part.init?.({ ...(Part.sample ?? {}), part: name }, cx);
        return part;
      });
      return;
    }
    this.name = p.part ?? null;
    this.part = makePart(this.name);
    this.part.init?.(p, cx);
    if (checking() || !this.part.command) return;
    cx.spawn(async (cx) => {
      for (;;) {
        const c = String(await nextCommand());
        // "focus" comes from Herdr itself (focusable mods); everything else is helm's own.
        if (c === "focus" || ownerOf(c) === this.name) await this.part.command(c, cx);
        cx.notify();
      }
    });
  }

  render(cx) {
    if (this.all) return v_flex().w_full().children(this.all.map((part) => part.render(cx)));
    return this.part.render(cx);
  }

  async close(cx) {
    await this.part?.close?.(cx);
  }
}
