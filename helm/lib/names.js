// Names for agents, tabs, spaces and folders. clean() and tabTitle() come from the Herdr app's
// agents mod (Apache-2.0); agentName() from herdr-agent-ask's state.js (MIT); see NOTICE.
// Changed for helm: gathered into one module.

// Drops what an agent puts before its title: a status glyph or spinner and the separator after
// it ("✦  Working", "⠋ - Thinking"), and Codex's "[ ! ] " / "[ . ] " mark. Stops at an opening
// bracket or quote, so "[web] login" keeps its bracket.
export const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();

// A path in the home folder written with "~".
export function tilde(path, home) {
  if (!path) return "";
  return path === home ? "~" : path.startsWith(home + "/") ? "~" + path.slice(home.length) : path;
}

// "home/sp12" -> "sp12"; a local id stays as it is.
export const localId = (space) => (space?.machine ? space.id.slice(space.machine.length + 1) : space?.id);

// The machine part of an address or id ("home/t7" -> "home"), or null for this computer.
export const machineOf = (address) => (address?.includes("/") ? address.split("/")[0] : null);

// The tab's name for a row: the live title when the tab has no name of its own and the title
// says something (not the program's name, a path or user@host).
export function tabTitle(tab, lead) {
  const prog = lead?.program?.name;
  const live = clean(lead?.title);
  const path = /^[~/]|^[A-Za-z]:\\/.test((lead?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== (lead?.terminal ?? lead?.address) && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== lead?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}

// The pane that speaks for each tab: its first agent, else its focused terminal, else its first.
export function leadPanes(panes) {
  const leads = new Map();
  for (const p of panes) {
    if (!p.terminal) continue;
    const cur = leads.get(p.tab);
    if (!cur || (!cur.program?.agent && (p.program?.agent || (!cur.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

// An agent's name on a card: a named tab, else its title, else the program.
export function agentName(a, t) {
  if (!a) return t?.name || t?.address || "agent";
  const tab = a.tab_name ?? "";
  if (tab && !/^\d+$/.test(tab)) return tab;
  const title = (a.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if (title && title !== a.program?.name && !/^[~/]/.test(title)) return title;
  return a.program?.name || tab || a.address;
}

// A tab pill's name: an unnamed tab ("tb…") is called after its program.
export const tabName = (tab, program) => (/^tb\d+$/.test(tab.name) ? program?.name ?? "Terminal" : tab.name);

// A path's last folder name: "~/Projects/herdr/" -> "herdr"; "~" and "/" give "".
export function lastPart(p) {
  const part = (p ?? "").trim().replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
  return part === "~" ? "" : part;
}
