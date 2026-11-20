// Which part owns each key command, and which copy of helm runs the engines.
//
// A key bound to "helm.<command>" reaches every shown copy of helm (PLAN.md 2.9), so each
// command has exactly one owner part, and only that part acts on it. Engines (timers, polling,
// state that other parts read) run in one copy only: the host. The host is the status bar,
// which the krog layout always shows and which is the simplest part, so it is the same copy that
// owns the window-wide key commands. A second status copy, for example for a moment during a hot
// reload, finds the host taken and starts nothing.

export const COMMANDS = {
  "space-next": "status",
  "space-prev": "status",
  "space-back": "status",
  "hide-frozen": "status",
  "panel-asks": "status",
  "asks-open": "status",
  "panel-files": "status",
  "panel-changes": "status",
  "panel-artifacts": "status",
  "next-waiting": "status",
  "asks-recheck": "status",
  "asks-accept": "status",
  "artifacts-refresh": "artifacts",
  "artifacts-scope": "artifacts",
  "artifacts-seen": "artifacts",
  "artifacts-search": "artifacts",
  "artifacts-links": "artifacts",
  "artifacts-latest": "artifacts",
};

export const ownerOf = (command) => COMMANDS[command] ?? null;

export const HOST_PART = "status";

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
