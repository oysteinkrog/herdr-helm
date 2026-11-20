// The engines the host copy starts (PLAN.md 2.3).
import { SpacesEngine } from "./spaces/engine.js";

export function startEngines(cx) {
  const spaces = new SpacesEngine();
  spaces.start(cx);
  return { spaces };
}
