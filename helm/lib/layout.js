// Reading and changing the shown layout: find a node, the narrow sidebar rail, the right panel.
// find(), narrow() and toggleSidebar() come from the Herdr app's shipped agents and
// workspace-chrome mods (Apache-2.0, see NOTICE); paneFrame() from its pane mod; the panel
// helpers from herdr-agent-ask's tabs-asks (MIT). Changed for helm: gathered into one module.
import { layout, run, shared, setShared, window } from "herdr";

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar is a rail when it is narrower than 160 px, however it got there.
export const narrow = (root = layout()) => (find(root, "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail, or back to the width it had (shared "sidebar.width", default 268).
export function toggleSidebar() {
  const root = layout();
  const width = find(root, "sidebar")?.size?.px;
  const rail = narrow(root);
  if (!rail) setShared("sidebar.width", width);
  setShared("sidebar.collapsed", !rail);
  run("layout.resize", { id: "sidebar", px: rail ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

// The pane frame of the first visible tab block (following each stack's active child).
export function paneFrame(node = layout()) {
  if (!node || node.hidden) return null;
  if (node.content?.tab && node.content.pane) return node.content.pane;
  let children = node.children ?? [];
  if (node.type === "stack") {
    const visible = children.filter((c) => !c.hidden);
    children = [visible.find((c) => c.id === node.active) ?? visible[0]];
  }
  for (const child of children) {
    const frame = paneFrame(child);
    if (frame) return frame;
  }
  return null;
}

// The right panel: which stack child shows, or null when the panel is hidden.
export function panelShown(root = layout()) {
  const panel = find(root, "panel"), body = find(root, "panel-body");
  return panel && !panel.hidden ? body?.active ?? null : null;
}

export function showPanel(child) {
  run("layout.select", { stack: "panel-body", child });
  run("layout.show", { id: "panel" });
}

export const hidePanel = () => run("layout.hide", { id: "panel" });

// Toggle the panel to `child`: hide it when that child already shows (unless forceOpen).
export function togglePanel(child, forceOpen = false) {
  if (panelShown() === child && !forceOpen) hidePanel();
  else showPanel(child);
}
