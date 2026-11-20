// Which part owns each key command, and which copy of helm runs the engines.
//
// A key bound to "helm.<command>" reaches every shown copy of helm (PLAN.md 2.9), so each
// command has exactly one owner part, and only that part acts on it. Engines (timers, polling,
// state that other parts read) run in one copy only: the host. The host is the tab bar, which
// the krog layout always shows. A second tab bar copy, for example for a moment during a hot
// reload, finds the host taken and starts nothing.

export const COMMANDS = {
  "space-next": "tabbar",
  "space-prev": "tabbar",
  "space-back": "tabbar",
  "hide-frozen": "tabbar",
  "panel-asks": "tabbar",
  "asks-open": "tabbar",
  "panel-files": "tabbar",
  "panel-changes": "tabbar",
  "panel-artifacts": "tabbar",
  "next-waiting": "tabbar",
  "asks-recheck": "tabbar",
  "asks-accept": "tabbar",
  "artifacts-refresh": "artifacts",
  "artifacts-scope": "artifacts",
  "artifacts-seen": "artifacts",
  "artifacts-search": "artifacts",
  "artifacts-links": "artifacts",
  "artifacts-latest": "artifacts",
};

export const ownerOf = (command) => COMMANDS[command] ?? null;

export const HOST_PART = "tabbar";

// The copy that runs the engines, for this build of the module. A hot reload loads a new build
// with this set back to null, and the old build's timers stop on their own.
let host = null;

// True when `token` is (or now becomes) the host.
export function claimHost(token) {
  if (host === null) host = token;
  return host === token;
}

export function releaseHost(token) {
  if (host === token) host = null;
}

export const isHost = (token) => host !== null && host === token;
