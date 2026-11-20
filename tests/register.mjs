// Loads helm's modules under plain Node: "herdr", "gpui-kit" and "gpui-base" become stubs.
// Pattern taken from herdr-agent-ask's tests/register.mjs (MIT, see NOTICE), rewritten for helm.
import { register } from "node:module";
register("./loader.mjs", import.meta.url);
