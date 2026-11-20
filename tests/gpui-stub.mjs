// Stand-in for gpui-kit and gpui-base: every builder returns a chainable no-op, so a part's
// module loads and its non-drawing methods run under node --test. From herdr-agent-ask's
// tests/gpui-stub.mjs (MIT, see NOTICE), extended for helm.
const chain = () => new Proxy(() => chain(), { get: (_t, k) => (k === "then" ? undefined : () => chain()) });
export class View {}
export const div = () => chain(), svg = () => chain(), image = () => chain(), v_flex = () => chain(), h_flex = () => chain();
export const Input = { new: () => chain() };
export const InputState = { new: () => ({ on() {}, value: () => "", set_value() {}, focus() {}, set_selected_range() {} }) };
export const ScrollHandle = { new: () => ({ asked: [], scroll_to_item(i) { this.asked.push(i); }, release() { return true; } }) };
