// The engines the host copy starts (PLAN.md 2.3), and the key commands that need them.
import { spaces, focused, notify, run } from "herdr";
import { SpacesEngine } from "./spaces/engine.js";
import { Engine as AsksEngine } from "./asks/detect.js";
import { Delivery } from "./asks/deliver.js";
import { readState, loadConfig } from "./asks/state.js";
import { prefs } from "../lib/store.js";

// The agent that has waited longest, then the next one each time from there, then round again:
// one per agent, in any space on any machine. null when nobody waits.
export function nextWaiting(asks, here) {
  const queue = asks.filter((a) => a.state === "pending" && !a.notice && a.address)
    .sort((a, b) => (a.detected_at ?? 0) - (b.detected_at ?? 0));
  const seen = new Set(), list = queue.filter((a) => !seen.has(a.address) && seen.add(a.address));
  if (!list.length) return null;
  const at = list.findIndex((a) => a.address === here);
  return list[(at + 1) % list.length].address;
}

export function startEngines(cx, commands) {
  const spacesEngine = new SpacesEngine();
  spacesEngine.start(cx);

  const asks = new AsksEngine();
  const config = (cx) => cx.spawn(async (cx) => { asks.config = await loadConfig(); asks.reset(); cx.notify(); });
  config(cx);
  cx.timer.every(30000, config);
  cx.timer.every(1000, (cx) => asks.tick(cx));
  const delivery = new Delivery({ config: () => asks.config, debug: (line) => asks.debug(line) });

  if (commands) Object.assign(commands.extra, {
    "next-waiting": () => {
      const to = nextWaiting(readState().asks, focused()?.terminal ?? focused()?.address ?? null);
      if (to) run("agent.focus", { terminal: to });
      else notify({ title: "Nobody is waiting", timeout: 2500 });
    },
    "asks-recheck": () => asks.recheck(),
    "asks-accept": (cx) => {
      const spaceId = prefs().asksScope === "all" ? null : spaces().find((s) => s.active)?.id ?? focused()?.space ?? null;
      delivery.accept(spaceId, cx);
    },
  });
  return { spaces: spacesEngine, asks, delivery };
}
