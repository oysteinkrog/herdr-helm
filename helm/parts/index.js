// Every part helm can draw, by the name a layout block or an overlay gives in props.part.
// A part is a class with init(props, cx), render(cx), and optionally command(name, cx),
// close(cx) and a static `sample` (the props it is checked with by herdr-app check).
import { Brand, Footer } from "./brand.js";
import { Status } from "./status.js";
import { PaneHeader } from "./pane-header.js";
import { Spaces } from "./spaces.js";

export const PARTS = {
  brand: Brand,
  footer: Footer,
  status: Status,
  "pane-header": PaneHeader,
  spaces: Spaces,
};
