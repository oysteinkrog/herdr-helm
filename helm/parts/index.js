// Every part helm can draw, by the name a layout block or an overlay gives in props.part.
// A part is a class with init(props, cx), render(cx), and optionally command(name, cx),
// close(cx) and a static `sample` (the props it is checked with by herdr-app check).
import { Brand, Footer } from "./brand.js";
import { Status } from "./status.js";
import { PaneHeader } from "./pane-header.js";
import { Spaces } from "./spaces.js";
import { FolderMenu } from "./folder-menu.js";
import { FolderEdit } from "./folder-edit.js";
import { SpaceMenu } from "./space-menu.js";
import { Freeze, Thaw } from "./freeze.js";
import { Asks } from "./asks.js";
import { Tabbar } from "./tabbar.js";

export const PARTS = {
  brand: Brand,
  footer: Footer,
  status: Status,
  "pane-header": PaneHeader,
  spaces: Spaces,
  "folder-menu": FolderMenu,
  "folder-edit": FolderEdit,
  "space-menu": SpaceMenu,
  freeze: Freeze,
  thaw: Thaw,
  asks: Asks,
  tabbar: Tabbar,
};
