# herdr-helm

herdr-helm is one mod, `helm`, for the [Herdr](https://herdr.dev) desktop app. It draws a
whole personal layout from one code base: the spaces sidebar with folders, the tab bar, the
Asks panel that answers agents' questions from cards, the agents list, an artifacts panel, the
status bar, pane headers, and Freeze and Thaw for whole spaces. The layout picks each part with
`props.part`.

It replaces a set of copied and patched mods with one mod that has one shared state store and
one engine per concern.

Status: planning. There is no code yet. See [PLAN.md](PLAN.md) for the inventory, the design,
the migration and the work steps.

Built for herdr-app 0.1.16 and herdr-core 0.1.21 on Linux.

## License

MIT, see [LICENSE](LICENSE). Code taken from other projects keeps its own license and is listed
in `NOTICE` once it is added (PLAN.md, section 5).
