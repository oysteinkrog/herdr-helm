// What an unknown part name shows: one line that says so, instead of a blank block.
import { div } from "gpui-kit";
import { theme } from "herdr";

export class Missing {
  constructor(name) { this.name = name; }
  render() {
    const t = theme();
    return div().size_full().p(8).bg(t.chrome).text_size(12).text_color(t.dim).child(`helm: no part called "${this.name ?? ""}"`);
  }
}
