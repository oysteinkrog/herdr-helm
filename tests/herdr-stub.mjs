// Stand-in for the app's "herdr" module under node --test. Based on herdr-agent-ask's
// tests/herdr-stub.mjs (MIT, see NOTICE); extended for helm. Tests steer it through
// globalThis.__herdr (H): the live lists, shared state, and handlers for exec and hc.
// Every run() and setShared() call is recorded so tests can check what helm did.
const H = (globalThis.__herdr ??= {});
export const resetHerdr = (over = {}) => Object.assign(H, {
  store: new Map(), writes: [], runs: [], notices: [], overlays: [], files: new Map(),
  terminals: [], agents: [], spaces: [], panes: [], machines: [], focused: null,
  layout: { id: "root", children: [] }, theme: {}, keys: [], checking: false, props: null,
  window: { platform: "linux", active: true, buttons: true },
  exec: async () => ({ code: 127, stdout: "", stderr: "not found" }),
  hc: async () => ({ code: 0, stdout: "", stderr: "" }),
  ...over,
});
resetHerdr();
const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
export const shared = (k) => copy(H.store.get(k)) ?? null;
export const setShared = (k, v) => { H.writes.push(k); H.store.set(k, copy(v)); };
export const readTextFile = async (p) => { if (H.files.has(p)) return H.files.get(p); throw new Error(`no such file: ${p}`); };
export const writeTextFile = async (p, text) => { H.files.set(p, text); };
export const appHome = () => "/sbx/herdr-app";
export const home = () => "/sbx/home";
export const terminals = () => H.terminals;
export const agents = () => H.agents;
export const spaces = () => H.spaces;
export const panes = () => H.panes;
export const machines = () => H.machines;
export const focused = () => H.focused;
export const layout = () => H.layout;
export const theme = () => H.theme;
export const keys = () => H.keys;
export const window = () => H.window;
export const settings = () => ({ zoom: 1, dark: true });
export const props = () => H.props;
export const checking = () => H.checking;
export const exec = (cmd, args, opts) => H.exec(cmd, args ?? [], opts ?? {});
export const hc = (args) => H.hc(args ?? []);
export const notify = (n) => { H.notices.push(n); };
export const run = (name, args) => { H.runs.push([name, args ?? {}]); return null; };
export const openOverlay = (o) => { H.overlays.push(o); return `o${H.overlays.length}`; };
export const closeOverlay = () => {};
export const setAgentOrder = (list) => { H.agentOrder = list; };
export const watchFolder = () => new Promise(() => {});
export const pickFolder = async () => null;
export const updates = () => ({ app: {} });
export const nextCommand = () => new Promise(() => {});
