# herdr-helm Plan

Status: planning. Written 2026-11-20 for herdr-app 0.1.16 and herdr-core (`hc`) 0.1.21.

herdr-helm is one mod for the Herdr desktop app, named `helm`. It replaces every copied and
patched mod in Oystein's personal layout `krog`. Today that layout runs on nine mods: four
copies of Herdr's shipped mods, three add-ons from other people's repos with patch files on top,
and one mod of our own (`space-freeze`). After this plan, `krog` runs on `helm` plus a few of
Herdr's shipped mods that it opens by name and does not change.

Why: copies of Herdr's mods do not get Herdr's fixes, the patch files break when an add-on
moves, and the same helper code sits in three or four mods by hand. One mod that we own lets
the layout be restructured and rewritten as one consistent whole.

The layout keeps its name, `krog`. The mod is `helm`, its key commands are `helm.*`, and its
shared-state keys start with `helm.`.

Contents:

1. Inventory of what the current mods do
2. Architecture
3. Migration, switch-over and rollback
4. Install
5. Licenses and credits
6. Testing
7. Work steps
8. Risks
9. Decisions and open questions

---

## 1. Inventory of what the current mods do

This is the checklist for the rewrite. A box is ticked when `helm` does the same thing in the
sandbox (section 6). Nothing from this list is dropped without a line in section 9.

Sources read for this list, all on the office desktop on 2026-11-20:
`~/.config/herdr-app/layouts/krog.json`, `keys.json`, `asks.json`, `AGENTS.md`, every mod
folder named below, `~/bin/herdr-setup` and `~/.dotfiles/setup/herdr/` (files and patches).

### 1.1 Where each mod sits in the `krog` layout

| Layout block | Mod today | Origin |
|---|---|---|
| `brand` (46 px, window drag) | `workspace-chrome` | Herdr shipped, unchanged |
| `spaces` (sidebar, weight 1) | `space-folders` | jankeesvw/herdr-space-folders at 63a78b2 + `space-folders.patch` |
| `sidebar-footer` (69 px) | `workspace-chrome` with `props.footer: true` | Herdr shipped, unchanged |
| `tabs` (42 px, window drag) | `tabs-asks` | sachin-philip/herdr-agent-ask at 764155f + `herdr-agent-ask.patch` |
| `main` pane headers | `pane` | Herdr shipped, unchanged |
| `panel-body` stack child `files` | `files` | Herdr shipped, stays shipped |
| `panel-body` stack child `changes` | `changes` | Herdr shipped, stays shipped |
| `panel-body` stack child `asks`, top half | `asks` | herdr-agent-ask + patch |
| `panel-body` stack child `asks`, bottom half | `agents` | Herdr shipped, unchanged |
| `panel-body` stack child `claude-artifacts` | `claude-artifacts` | jmoyers/herdr-artifacts at 7d85899 + `claude-artifacts.patch` |
| `status` (28 px) | `workspace-status` | Herdr shipped, unchanged |
| overlays only | `space-freeze` | ours, in `~/.dotfiles/setup/herdr/files/mods/space-freeze/` |

Layout look to keep: theme `frankenterm-gruvbox` (light and dark), font DejaVu Sans Mono 15.33
weight 400, UI font DejaVu Sans, `titlebar: none`, `traffic_lights: [12, 16]`, terminal padding
`[14, 12]`, sidebar 268 px (min 44, max 480, not resizable), panel 368 px (min 280, max 900,
hidden by default, active child `files`), pane cards with radius 10, gap 8, 1 px border, accent
focus border, `lone: true`, header 30 px on top, `reveal: always`.

### 1.2 `space-folders` (sidebar)

Spaces list:

- [ ] One row per space: a 14 px coloured avatar with the first letter, the name, then a git tail.
- [ ] Avatar colour from shared `space.colors`. New spaces get the least used of six colours
      (`ansi6, ansi3, ansi4, ansi5, ansi2, ansi1`), shown with the fixed `MARK` hex values. Spaces
      named `~` get none. Colours of closed spaces are pruned.
- [ ] Git tail: repo name and branch only when they differ from the space name; `main` and
      `master` hidden; `↑ahead` in `ansi2`, `↓behind` in `ansi1`.
- [ ] Row is 22 px, worktree rows 20 px. Selected row uses `t.selected`.
- [ ] Click selects the space. Right-click opens the space menu (the `space-freeze` overlay).
- [ ] Drag a space onto another space: it moves there (`space.move`) and joins that space's folder.
- [ ] Narrow sidebar (under 160 px wide): a compact rail with numbers, status glyph or snowflake.
- [ ] A space's place is its first terminal's live folder (`panes().cwd`), else `space.folder`.
- [ ] New spaces wait up to 1.5 s for their git answer before they show, so they do not jump.
- Dropped (Oystein, 2026-11-20): worktree nesting under the main checkout. It was off
  (`NEST_WORKTREES = false`) since 2026-11-17, and `helm` does not carry it.

Folders:

- [ ] Folders per machine, stored in `~/.config/herdr-space-folders.json` on that machine:
      `{ list: [{ id, name, folded, color, path, match }], of: { spaceId: folderId | "" }, at }`.
      Mirrored in shared `space-folders` keyed by machine (`""` is this computer). A newer `at` wins.
- [ ] Folder header: 14 px tile in the folder colour with a folder icon, name, `+` (new space in
      this folder), count, chevron. Click folds. Folded, it shows a spinner if any space works,
      else a dot for blocked or done.
- [ ] Drag a space onto a folder header to put it in. Drop below the list, or on the dashed
      "Drop here to take it out of its folder" zone, to take it out. Out of a folder its rules
      would pick, it is stored as `""` so it stays out.
- [ ] Drag a folder header onto another to reorder folders (same machine only).
- [ ] Folder right-click popup (210 x 160): colour swatches (grey plus six), "New space here",
      "Edit folder…", "Delete folder".
- [ ] Edit folder dialog (460 wide): Name, "Start new spaces in" (with a Choose… folder picker on
      this computer only), "Collect spaces from" (comma separated rules). The name follows the
      start folder's last part until typed over; the rules follow the start folder until edited.
      Enter saves, Escape cancels. A new folder exists only after Save.
- [ ] Rules: `~` is any home, `*` is one folder name, a rule with no leading `/` or `~` matches a
      folder name at any depth. The folder whose rule reaches deepest into the path wins; first
      wins a tie.
- [ ] A folder on this computer can take in another machine (header and spaces) when a rule
      matches the machine name or the folder one of its spaces works in.
- [ ] A folder that holds only hidden frozen spaces is hidden too.

Machines:

- [ ] Machine sections appear once a machine other than this computer is known. Header: icon,
      name, state when not connected, new-folder button, `+`, a connection dot, chevron.
- [ ] Machine fold state in localStorage `machines.folded`.
- [ ] "Loading…" row while a machine's spaces come in; "New space there" row when it has none.
- [ ] Machines from `hc machine ls --json`, skipping `temporary` ones.

New spaces:

- [ ] `+` in the header, on a folder or on a machine makes a space there, in the folder's start
      folder (`~` expanded on that machine). The first new space on that machine within 60 s is
      put in the folder (shared `space-folders.new`).
- [ ] A space made from the front space (keys, palette) within 3 s goes right under it and into
      its folder.
- [ ] When the front space closes, the space above it in the list is selected (below if none).

Frozen spaces:

- [ ] A space is frozen when any live terminal in it has the `herdr.frozen` label. Fallback:
      shared `space-freeze.frozen` counts only when a terminal listed there is no longer live.
- [ ] Frozen rows: dim name and a snowflake (`ansi4`). On the rail: a snowflake in place of the
      status glyph.
- [ ] Header snowflake toggles hiding frozen spaces (localStorage `frozen.hidden`). While hiding,
      a "N frozen hidden" row shows them again. The front space is never hidden.

Commands and keys (`nextCommand`, last part after the dot):

- [ ] `space-folders.next` / `.prev`: next or previous space in the list as shown, skipping folded
      folders, folded machines and hidden frozen spaces, wrapping round.
- [ ] `space-folders.hide-frozen`: toggle hiding.

Timers and watches:

| What | Interval |
|---|---|
| `hc machine ls --json` | 15 s |
| read every connected machine's folder file (`cat` over `exec on`) | 15 s |
| frozen mirror: `freeze.sh list` on every machine | 60 s, plus `watchFolder(~/.local/state/space-freeze)` |
| new-space adoption, closed-space jump, git "due" check | 250 ms |
| `git status --porcelain=v2 --branch` per place, then `rev-parse` twice | when due: new place, a command or agent turn ended, machine came back, or 60 s fallback while the window is active and the machine is not folded |
| `watchFolder(<repo>/.git)` per local repo in view | event driven |

Git is run with `--no-optional-locks -c core.fsmonitor=false` so it never wakes its own watch.

### 1.3 `space-freeze` (space menu, Freeze, Thaw)

- [ ] Space right-click popup (210 x 290): "Freeze space…" or "Thaw space" first (with a
      snowflake), separator, Rename, New worktree and Open worktree (when the space is in a git
      repo), Remove worktree (linked worktrees only), separator, Close. Worktree items open the
      shipped `worktree` mod (dialog 440 x 260, or 560 x 480 for Open).
- [ ] Menu keys: up, down, Enter, Escape. The highlight follows the pointer through `on_hover`
      and uses `t.selected`, never a hover-only style (the gruvbox lesson, section 2.6).
- [ ] Opening the menu re-reads the machine's frozen list.
- [ ] Freeze dialog (480 wide): lists the programs that would exit (Claude Code, Codex, other)
      with name and status. Freeze is off while an agent there is working or blocked; the plan is
      read again every 3 s while one is busy. On success a toast "Froze <space>" with counts.
- [ ] Thaw dialog (420 wide): thaws at once, closes on full success, else says how many could
      not start. Toast "Thawed <space>".
- [ ] All work runs in `freeze.sh` on the machine that owns the space, 120 s timeout. Commands:
      `plan SPACE`, `freeze SPACE [NAME]`, `thaw SPACE`, `list`. State in
      `~/.local/state/space-freeze/<space>.json` on that machine. Claude is resumed with
      `--resume` through claude-persist's `resume-cmd`
      (`~/.claude/hooks/claude-persist.sh`, `~/.local/state/claude-persist/sessions/`).
- [ ] Shared `space-freeze.frozen` (`{ spaceId: { count, at, addresses } }`) and
      `space-freeze.frozen.rev` (bumped on every local change, so an older background read is dropped).
- [ ] Every step finishes before its overlay closes.
- [ ] `freeze.sh` has callers outside the mod since 2026-11-20: the `herdr-sessions` skill and
      the manager sessions run it by its path (`~/.config/herdr-app/mods/space-freeze/freeze.sh`)
      to freeze idle spaces on their own. A space with a terminal labelled `herdr.nofreeze=1` is
      left alone by them. So freezing is no longer only manual, and the script's path and JSON
      output are an interface that `helm` must keep (step 4.1).

### 1.4 `tabs-asks` (tab bar and the Asks engine host)

Tab bar:

- [ ] Tabs of the shown space as pills: program icon, name (an unnamed `tbN` tab shows its
      program name), `Z` when zoomed, spinner when working, dot when blocked or done, close `x`
      on the active tab.
- [ ] Double-click renames. Drag a tab onto another to move it. Right-click opens the shipped
      `menu` popup (200 wide, props `{ tab: "tab", target: { id, space } }`).
- [ ] Scroll wheel over the bar: previous or next tab.
- [ ] `+` opens the shipped `new-menu` popup (250 x 512).
- [ ] Panel buttons: "Asks/Agents" with a badge (count waiting in this space in `t.blocked`,
      plus a dim `+N` or "N elsewhere"), "Artifacts", "Files", "Changes" (the last two only when
      shared `workspace.panels` lists them). Click toggles the right panel to that child.
- [ ] Window buttons (minimize, maximize or restore, close) where the system draws none.
- Dropped (Oystein, 2026-11-20): the macOS traffic-light padding. `helm` runs on Linux.
- [ ] The panel choice is remembered per space (localStorage `panels`): switching spaces shows
      that space's panel or hides it.

Commands (`tabs-asks.<name>`):

- [ ] `toggle` (Asks panel), `open` (open Asks panel; the toast action), `files`, `changes`,
      `artifacts`, `next` (next waiting agent), `back` (previous space), `recheck`.
- [ ] `next`: the oldest pending ask first, one per agent, in any space on any machine; pressing
      again goes to the next one, then wraps. With none, toast "Nobody is waiting" (2.5 s).
- [ ] `back`: the space shown before this one. With none, toast "No previous space".

Asks engine (runs here because this copy is always on screen):

- [ ] Tick every 1 s and on every render.
- [ ] A blocked terminal makes an ask with id `<address>:<turn>:<hash(msg)>`. The status report
      is parsed first (`question`, `permission`, `auth` kinds). Older pending asks of that
      terminal go stale ("Resolved in terminal").
- [ ] A terminal in `error` makes a STOPPED card per (terminal, turn) with a Continue option that
      sends `continue`.
- [ ] A card goes stale only after its dialog has been gone for 3 s, and never while
      `terminals()` is empty (right after a reload).
- [ ] Failed deliveries heal: a later turn means it landed ("Picked up late"); after 10 minutes
      without that, "Not delivered".
- [ ] Finished turns (`done` or `idle`) are read once each (`hc read --lines 100`); if the last
      message asks the person something (classifier confidence at least 0.6), a QUESTION card is
      made, delivered by sending text. Turns already idle at start are skipped. Error text
      (`API Error`, `/login`, `rate limit`) is skipped. The last 300 checked turns are kept.
- [ ] Enrich each new ask: read the screen (`hc read --json`), take numbered options, cursor,
      question line and context. A multi-question wizard tab bar turns the card into a notice
      with no options. Ask the classifier only when the report and screen say too little, or
      always with `classify: "always"`.
- [ ] Classifier: `claude -p --model haiku --output-format json --json-schema … --tools ""`
      without the person's settings (about 1 s), retried with settings on an auth error; or
      `codex exec --output-schema` with the newest codex found on the machine. Choice from
      `asks.json` `classifier` (`auto`, `claude`, `codex`). With neither CLI, today's mod shows one
      notice card; `helm` drops that card (Oystein, 2026-11-20) and only logs it with `debug`.
- [ ] Toasts "<agent> is asking" (5 s, warning, action `tabs-asks.open`) unless the person is
      looking at that terminal. `toast: true` in `asks.json` (set 2026-11-20).
- [ ] Keep at most 60 asks, finished ones for 24 h.
- [ ] Config re-read from `asks.json` every 30 s. `debug: true` writes `~/.config/herdr-app/asks.log`.

### 1.5 `asks` (Asks panel, top half of the `asks` stack child)

- [ ] Header: label from config ("Asks"), the space name or "All spaces", an All toggle
      (localStorage `scope`).
- [ ] "N waiting · M answered today".
- [ ] Card: program icon, agent name, space name when showing all, spinner while sending, age;
      kind chip (APPROVAL, DECISION, QUESTION, STOPPED, UNCLEAR, NOTICE) with a one-line context
      that opens in full on click; the question; numbered options with "recommends".
- [ ] Multi-question cards: each question folds open with its options and "Other answer…";
      drafts are kept and sent together as one numbered message ("Send answers (n/m)").
- [ ] Actions: Retry (failed), Send answers, Other answer or Answer (typed text, Enter sends),
      Open terminal, Dismiss.
- [ ] Delivery of an option: check the dialog is still up, check for a wizard, press the number,
      press Enter only if the dialog is still there after 1.5 s, then wait up to 8 s for the agent
      to react, probing every 400 ms with `hc get`.
- [ ] Delivery of text: `hc send --json` (with `--force` into a live dialog); if nothing started,
      press Enter when the text sits on the prompt line, else send once more. Never more than one
      extra attempt.
- [ ] A dialog the person declined in the terminal is marked "Declined in terminal", not answered.
- [ ] Each delivered answer adds one line to the decisions log (default
      `~/.config/herdr-app/decisions/{space}.md`; `{space}` and `{repo}` are filled in).
- [ ] Answered list (folded): receipts with a check or cross, agent, answer or note, age; Clear
      removes the finished cards in the current scope.
- [ ] Command `asks.accept`: answer the newest waiting ask in scope with its recommended option
      (not bound in `keys.json` today).
- [ ] Config re-read every 30 s.

### 1.6 `agents` (Agents list, bottom half of the `asks` stack child)

- [ ] Two sorts from the sort popup (200 x 140): Priority (sections Needs you, Done, Working,
      Idle) and Grouped by space. Stored in shared `agents.sort`.
- [ ] Pinned agents on top (`terminal.pin`, label `herdr.pinned`); pin button on hover; old
      localStorage `pins` migrated to labels.
- [ ] Sub-agents as a tree under their parent (`terminals().parent`), with tree lines, foldable;
      the parent takes its most urgent child's rank. Sub-agent click focuses its pane or peeks it.
- [ ] Row: icon, name (space name in priority view, else tab or title), detail when two rows would
      read the same, machine name for remote agents, time since the last state change, status
      (spinner, "Needs you" chip or `!`, done dot, idle ring).
- [ ] State-change times in localStorage `changed`, pruned after 30 days.
- [ ] `setAgentOrder` on every render so `agent.next` / `agent.prev` follow the list.
- [ ] Group headers fold; folded they show count and the most urgent state.
- [ ] Rail mode with numbers and a `»` button that unfolds the sidebar.
- [ ] Redraw every 30 s for the durations.

### 1.7 `claude-artifacts` (Artifacts panel)

- [ ] Follows the selected agent, or every agent in the space (localStorage `artifacts.scope`).
- [ ] Published artifacts with version and age; "N seen" toggle for opened-but-not-published ones;
      links the agent wrote, first 6 then "N more"; per-agent groups in space view.
- [ ] Row click opens the URL; copy button on hover with a 1.5 s check mark.
- [ ] Search box over everything shown, Enter opens the first result; shared
      `artifacts.focusSearch` asks the box to take focus.
- [ ] Data from `artifacts.py --terminals t1,t2` (`python3 -I`), every 4 s and on demand, also
      while the panel is hidden. Cache in `~/.cache/herdr-artifacts`. Reads
      `~/.claude/sessions/<pid>.json` and the session transcripts.
- [ ] Commands `claude-artifacts.refresh`, `toggle-scope`, `toggle-seen`, `search`,
      `toggle-links`, `open-latest` (none bound today).

### 1.8 `workspace-status` (status bar)

- [ ] Machine of the shown space ("This computer" or its name), branch, agent count, "· N needs
      you" in `t.blocked`, and the palette hint built from the real key binding. Click opens the palette.

### 1.9 `workspace-chrome` (brand bar and sidebar footer)

- [ ] Brand: Herdr logo and name, search button (`mod.open picker`), sidebar toggle (rail at 44 px,
      back to the saved width in shared `sidebar.width`, default 268; also writes
      `sidebar.collapsed`).
- [ ] Footer: Settings (with a dot when an app update is ready), "Add machine"
      (`mod.open machine-add`).

### 1.10 `pane` (pane header)

- [ ] Program icon, name, folder (with `~`), status (spinner, "Needs you" chip, done dot). On hover:
      split right, split down, zoom or unzoom, close. Click focuses the pane. Divider on the
      terminal side, from the layout's header position.

### 1.11 Keys that call these mods today

From `keys.json`, section `layout:krog`:

| Key | Action |
|---|---|
| `alt-down`, `ctrl-shift-pagedown`, `ctrl-space shift-n`, `ctrl-shift-down`, `ctrl-shift-e` | `space-folders.next` |
| `alt-up`, `ctrl-shift-pageup`, `ctrl-space shift-p`, `ctrl-shift-u`, `ctrl-shift-up` | `space-folders.prev` |
| `ctrl-shift-a` | `layout.select {stack: panel-body, child: claude-artifacts}` |
| `ctrl-alt-a` | `tabs-asks.toggle` |
| `ctrl-alt-f` | `tabs-asks.files` |
| `ctrl-alt-c` | `tabs-asks.changes` |
| `ctrl-alt-r` | `tabs-asks.artifacts` |
| `ctrl-alt-j` | `tabs-asks.next` |
| `ctrl-alt-b` | `tabs-asks.back` |
| `ctrl-alt-h` | `space-folders.hide-frozen` |

Called by name from code: the toast action `tabs-asks.open`. Not bound: `tabs-asks.recheck`,
`asks.accept`, the six `claude-artifacts.*` commands. The survey's decision to cut the six
next/previous space bindings to two is not done yet (see step 9.2).

### 1.12 Shipped Herdr mods that `krog` opens by name

These stay Herdr's. `helm` opens them by name and never copies them (issue #289, section 2.5).

| Shipped mod | Opened from |
|---|---|
| `menu` | tab right-click; the terminal menu (layout default) |
| `new-menu` | tab bar `+` |
| `worktree` | space menu: New, Open, Remove worktree |
| `files`, `changes` | layout blocks in the panel stack |
| `picker` | brand search button (`mod.open`) |
| `machine-add` | footer "Add machine" (`mod.open`) |
| `toast` | every `notify()` (layout default) |
| `peek` | `terminal.peek` from the agents list |

Assets of other mods used today: `mods/workspace-chrome/*.svg` (about 25 icons),
`mods/files/file.svg`, `mods/changes/changes.svg`, `mods/tabs/win-*.svg`, `mods/pane/*.svg`,
`frame/welcome/herdr.png`. `helm` carries its own copies of the icons it draws (section 5).

### 1.13 State, files and settings

Shared state keys (in `~/.config/herdr-app/shared.json`):

| Key | Written by | Read by |
|---|---|---|
| `asks.state` (about 338 KB today) | tabs-asks, asks | tabs-asks, asks, spaces-asks |
| `space-folders`, `space-folders.new` | space-folders | space-folders |
| `space.colors` | space-folders | also Herdr's `picker` and `spaces` |
| `space-freeze.frozen`, `.rev` | space-freeze, space-folders | both |
| `agents.sort` | agents | agents |
| `sidebar.width`, `sidebar.collapsed` | agents, workspace-chrome | same |
| `workspace.panels` | Herdr's welcome screen | tab bars |
| `artifacts.focusSearch` | (other layouts' bars) | claude-artifacts |

localStorage (stored in `data/<mod>/store.json`):

| Mod | Keys |
|---|---|
| space-folders | `machines.folded`, `frozen.hidden` |
| tabs-asks | `panels` (space id to panel) |
| asks | `scope` |
| agents | `changed`, `pins` |
| claude-artifacts | `artifacts.scope` |

Files:

| File | Machine | Owner |
|---|---|---|
| `~/.config/herdr-space-folders.json` | each | folders |
| `~/.local/state/space-freeze/<space>.json` | each | freeze.sh |
| `~/.config/herdr-app/mods/space-freeze/freeze.sh` | each (run there with `exec on`) | freeze |
| `~/.config/herdr-app/asks.json` | each | Asks config |
| `~/.config/herdr-app/asks.log`, `asks-schema.json` | each | Asks debug, codex schema |
| `~/.config/herdr-app/decisions/{space}.md` | each | decisions log |
| `~/.cache/herdr-artifacts/` | each | artifacts cache |
| `~/.claude/sessions/<pid>.json`, `~/.claude/projects/…/*.jsonl` | each | read by artifacts and freeze |
| `~/.local/state/claude-persist/sessions/`, `~/.claude/hooks/claude-persist.sh` | each | read by freeze |

### 1.14 Later items the design must leave room for

From the survey's "Decided 2026-11-20" box. Not built in this plan; the architecture keeps a
place for each.

- A "doing now" line under each agent row (its status message or cleaned title, with how long it
  has had it). It dims after 3 minutes on the same step and turns red after 15.
- A status-bar number from the aiolos timeline app ("percent free", data from
  `~/bin/aiolostimeline-fetch`), plus a panel in the right stack with the timeline graph.
- Frozen state on agent rows and tab pills, from the `herdr.frozen` label.

Not wanted: PR and GitHub features, per-agent quota bars, hook-based asks, settle and snooze
(for now). A Slack asks source is being investigated (decision log 2026-11-20), so the Asks
engine takes its asks from sources behind one small interface.

---

## 2. Architecture

### 2.1 Repo layout

```
herdr-helm/
  PLAN.md  README.md  LICENSE  NOTICE  THIRD-PARTY-LICENSES/
  helm/                      installed as ~/.config/herdr-app/mods/helm
    main.js                  picks the part from props.part; routes key commands
    mod.json                 { "place": "none", "title": "helm" }
    parts/                   one file per part (2.2)
    engines/
      host.js                which copy runs the engines and timers
      asks/  sources.js detect.js parse.js classify.js deliver.js state.js
      spaces/ folders.js git.js order.js
      freeze.js  agents.js  artifacts.js  timeline.js (later)
    lib/
      store.js               shared state: helm.* keys, write-only-when-changed, prefs
      ui.js                  theme tokens, rows, menus, buttons, dialog frame
      layout.js              find node, narrow rail, sidebar toggle, panel show/hide
      names.js  time.js  program.js
    bin/  freeze.sh  artifacts.py
    icons/                   the SVGs helm draws, with their license
  layouts/krog.json          the layout, pointing at helm parts
  keys/layout-krog.json      the layout:krog section for keys.json
  tests/                     plain Node tests, stubs for "herdr" and "gpui-kit", fixtures
  tools/
    sbx/  start.sh stop.sh sync.sh ui.sh shot.sh   private display and core (6)
    check-all.sh             herdr-app check for every part
    check-public.sh          refuses hostnames, IPs and tailnet names before a commit
```

`jsconfig.json` and `gpui-kit.d.ts` are written into the mod folder by the app; they are in
`.gitignore`.

### 2.2 Parts and the blocks they fill

Each block in `layouts/krog.json` says `{ "mod": "helm", "props": { "part": "<name>" } }`.
Overlays open `helm` the same way. `main.js` maps the name to a part class with `init`,
`render`, optional `close` and a list of the commands it owns. An unknown name renders a short
error row. This is the pattern Orca and 2code use; 2code has no license, so we take the idea
only and write the code fresh (section 5).

| Part | Block or overlay | Replaces |
|---|---|---|
| `brand` | `brand` | workspace-chrome |
| `spaces` | `spaces` | space-folders |
| `footer` | `sidebar-footer` | workspace-chrome footer |
| `tabbar` | `tabs` | tabs-asks |
| `pane-header` | pane header of `main` | pane |
| `asks` | `asks-list` | asks |
| `agents` | `agents` | agents |
| `artifacts` | `claude-artifacts` | claude-artifacts |
| `status` | `status` | workspace-status |
| `timeline` (later) | new child `timeline` in `panel-body` | new |
| `space-menu` | popup | space-freeze menu |
| `freeze`, `thaw` | dialogs | space-freeze dialogs |
| `folder-menu` | popup | space-folders folder menu |
| `folder-edit` | dialog | space-folders edit dialog |
| `sort-menu` | popup | agents sort menu |

`files` and `changes` stay Herdr's blocks.

### 2.3 Engines and the host copy

Each concern has one engine: Asks, spaces (folders, git, order), freeze, agents (state-change
times, later the "doing now" line), artifacts scan, timeline (later). Engines hold no UI. Parts
read what engines publish and call their functions.

Engines run in one copy only, the host. The host is the `status` part: it is always on screen in
`krog`, so asks are found before the panel is opened, and it is the simplest part, so the host
works while the tab bar is still the old mod during the build. Overlays and the other parts never
start timers that do engine work. A module-level guard makes sure a second `status` copy (after a
hot reload, before the old copy's `close`) does not start a second set of timers.

Why not elect a host among all parts: a copy keeps running while hidden, but key commands reach
shown copies only (AGENTS.md). The status bar is never hidden in `krog`.
Step 0.3 checks this; if it is wrong, a heartbeat-free election among layout parts is the fallback.

What engines publish goes to shared state only when it changed (`lib/store.js` compares before
it writes), because every `setShared` redraws every mod.

### 2.4 One shared state store

All new keys start with `helm.`. Durable state lives in shared state or in files, never only in
localStorage, so any part (and the host) can read it.

| Key | Holds |
|---|---|
| `helm.asks` | asks, checked turns, schema version (same shape as `asks.state` schema 1, plus `v: 2`) |
| `helm.folders`, `helm.folders.new` | per-machine mirror of the folder file; pending new-space adoption |
| `helm.freeze`, `helm.freeze.rev` | frozen-space mirror and its revision |
| `helm.spaces.order` | the sidebar's list as shown (ids, shown or hidden), for next and previous |
| `helm.agents.changed` | state-change times per agent |
| `helm.prefs` | `hideFrozen`, `agentsSort`, `asksScope`, `artifactsScope`, `machinesFolded`, `panels` (per space) |
| `helm.migrated` | migration version (3.1) |
| `helm.timeline` (later) | last aiolos timeline snapshot |

Keys `helm` reads but does not own: `space.colors` (shared with Herdr's `picker` and `spaces`, so
`helm` keeps writing it in the same format), `workspace.panels`, `layout`, `sidebar.width` and
`sidebar.collapsed` (kept so other layouts' chrome still works).

Files keep their paths and formats: the folder file, freeze state, `asks.json`, the decisions log.
That way the old mods and `helm` can run on the same data during the switch (section 3).

`helm.spaces.order` is new: today the next and previous keys use the list the sidebar last drew.
In `helm` the spaces engine computes the list as data, the sidebar draws it, and the host answers
`helm.space-next` from the same data even when the sidebar is folded.

### 2.5 Commands

Keys call `helm.<command>`. Names use dashes, never a second dot, because it is not known yet how
Herdr splits `<mod>.<command>` with more dots (step 0.3 checks).

| Command | Does | Replaces |
|---|---|---|
| `helm.space-next`, `helm.space-prev` | next or previous space in list order | `space-folders.next` / `.prev` |
| `helm.space-back` | previous space shown | `tabs-asks.back` |
| `helm.hide-frozen` | toggle hiding frozen spaces | `space-folders.hide-frozen` |
| `helm.panel-asks` | toggle the Asks and Agents panel | `tabs-asks.toggle` |
| `helm.asks-open` | open it (toast action) | `tabs-asks.open` |
| `helm.panel-files`, `helm.panel-changes`, `helm.panel-artifacts` | toggle that panel | `tabs-asks.files` / `.changes` / `.artifacts` |
| `helm.next-waiting` | next waiting agent | `tabs-asks.next` |
| `helm.asks-recheck`, `helm.asks-accept` | as today | `tabs-asks.recheck`, `asks.accept` |
| `helm.artifacts-refresh`, `-scope`, `-seen`, `-search`, `-links`, `-latest` | as today | `claude-artifacts.*` |
| `helm.panel-timeline` (later) | toggle the timeline panel | new |

Every command has one owner part. A key reaches every shown `helm` copy, so `main.js` checks a
table and only the owner acts. Global commands belong to `status`; the artifacts commands to
`artifacts`.

Shipped mods stay shipped. `helm` opens `menu`, `new-menu`, `worktree`, `picker`, `machine-add`
and `peek` by name and lets Herdr update them. Issue #289 (herdr-app) explains the cost of the
other way: changing one shipped mod means cloning every mod that opens it by name, and the clones
freeze at their version. If `helm` ever needs a different tab menu, it gets its own part; it does
not clone `menu`. If Herdr adds a `replaces` field for mods (proposed in #289), use it.

### 2.6 Menus, dialogs and the hover rule

All popups and dialogs are drawn by `lib/ui.js`:

- A menu is a list of items with one selected index. Up, down, Enter and Escape move and act.
  The pointer sets the index through `on_hover`. The selected row uses `t.selected`.
- Never use a hover-only highlight for meaning. In `frankenterm-gruvbox`, `hover`, `popover`,
  `surface` and `raised` are all `#32302f`, so `.hover(bg(t.hover))` on a popover or surface is
  invisible. `ui.js` has one helper, `hoverBg(t, base)`, which returns `t.selected` when
  `t.hover` equals the base colour; a unit test fails if any part calls `.hover` with a colour
  equal to its background token.
- Herdr issue #753: in popups the hover highlight can stay on the row that was under the pointer
  when the menu opened. Clicks still land on the right row. So menus never depend on hover to
  show the target of Enter; the keyboard index is the truth. Step 0.3 checks whether `on_hover`
  fires in popups on 0.1.16.
- Dialogs: one frame (padding 20, gap 14, title 15 px semibold), primary button `t.solid`,
  secondary `t.raised` with `t.input` border, Escape closes, every step finishes before
  `closeOverlay`.

### 2.6a Scroll position in lists

Oystein reported on 2026-11-20 that the live spaces list jumps back to the top when he freezes a
space, and on other actions. The live `space-folders` fix (dotfiles d5bb5c51) found two causes:

- The scroll area had no stable id and no scroll handle, so any change in the set of rows (a
  freeze or thaw, a new space, the hide-frozen toggle) reset it to the top.
- A drag into a folder failed near the bottom of a long list: nothing scrolled the list while
  dragging. Worse, the "take it out of its folder" drop zone appeared when the drag started. It
  added a row, which reset the scroll mid-drag and moved every drop target.

Every scrolling list in `helm` (spaces, agents, asks, artifacts, menus) follows these rules:

1. Each scroll container has one stable `.id(...)` that does not depend on data. Its
   `ScrollHandle` is made once in `init`, kept on `this` and attached with `track_scroll` on every
   render. The container is never rebuilt: a parent element never changes type or id between
   renders (for example from a loading row to the list), and rows keep stable keys (space id,
   agent address, ask id).
2. `helm` scrolls by code only when the front space changed by a key or a command, not by a click
   on its row, and only when that row is off screen. It uses `scroll_to_item`, which moves as
   little as needed. It never scrolls on reloads, status changes or menus. The spaces part sees
   this itself: the front space changed since the last render, and the change did not come from
   a click on its own row.
3. Drag edge zones (strips that scroll the list while a drag is held there) lie over the list,
   outside the scrolling content. Inside the content the pointer is in content coordinates, so
   the visible edge is unknown. The strips are 26 px high and move one row about every 70 ms,
   starting from the row last under the pointer. Releasing on a strip cancels the drag.
4. Starting a drag adds or removes no rows. The "take it out of its folder" drop zone is an
   overlay over the bottom of the list, above the bottom edge strip, not a row in the list.
5. Wanted, not yet possible: when rows are added or removed above the view, keep the first
   visible row in place rather than the pixel offset. herdr-app 0.1.16 gives a script
   `ScrollHandle.scroll_to_item` and nothing else: no way to read the offset or the first
   visible row. Until it does, the pixel offset is kept, which is still far better than a reset.

### 2.7 Room for the later items

- Doing-now line: the agents engine already tracks when each agent's state changed. It also keeps
  the last report message and when it changed (`helm.agents.changed` gets `msg` and `msgAt`).
  The agent row gets an optional second line. Thresholds (3 and 15 minutes) are constants in
  `engines/agents.js`.
- aiolos number and panel: `engines/timeline.js` reads a JSON snapshot file (path from the local
  config, off by default). `aiolostimeline-fetch --serve FILE 60` writes that file; `helm` never
  holds the aiolos key. The status part has a right-side slot; the `timeline` part sits in
  `panel-body` and draws the graph with plain `div` bars.
- Frozen on agent and tab rows: `engines/freeze.js` exports `frozenTerminals()` beside
  `frozenSpaces()`, both from the `herdr.frozen` label. The agents and tabbar parts show a snowflake.
- Asks sources: `engines/asks/sources.js` lists sources (dialog, report, finished turn). A Slack
  source can be added later without touching delivery or the panel.

### 2.8 Machine-specific settings

The repo is public. Nothing in it names a host, IP, tailnet or account. Settings that differ per
machine (the aiolos snapshot path, the decisions log path) go in
`~/.config/herdr-app/helm.json` on each machine, written by dotfiles or the Life repo, not by
this repo. `tools/check-public.sh` runs before each commit and refuses known patterns; its list
of names lives outside the repo.

### 2.9 Facts checked in step 0.3

Checked on 2026-11-20 with herdr-app 0.1.16 and hc 0.1.21, in the sandbox (a private Xvfb
display, a private `hc` core and a copy of the app home), with a spike `helm` mod and a test
layout of five `helm` blocks: one shown, one hidden, two children of a stack, and one 0 px high.

1. **Command names.** `nextCommand()` gets everything after the first dot: the key action
   `helm.space-next` arrives as `space-next`, and `helm.space.next` arrives as `space.next`.
   Dots are safe. `helm` still uses dashes (2.5), so a command name never looks like a path.
2. **localStorage is per copy.** Each copy of a mod gets its own file,
   `data/<mod>/store-<hash>.json`, holding a flat JSON object of string values. Part `a` wrote a
   key and parts `c` and `e` of the same mod read nothing. The old mods each ran as one copy and
   keep theirs in `data/<mod>/store.json` in the same format, which is what migration reads (3.1).
   This confirms the rule in 2.4: durable state goes in shared state or files, not localStorage.
3. **`herdr-app check` has no props.** During a check `props()` returns `null` and `checking()`
   is true. There is no option to pass props. So `main.js` renders every part, one under the
   other, when `checking()` is true and there is no part. One check then covers all parts.
   The check writes `gpui-kit.d.ts` and `jsconfig.json` into the mod folder; they are ignored by git.
4. **Hover in popups.** In a `helm` popup, `on_hover` fired for each row the pointer entered and
   left, and the `.hover()` style followed the pointer. Herdr issue #753 did not show here. This
   was pointer movement from `xdotool` on Xvfb, not a real mouse, so 2.6 stays as written: the
   keyboard index and `t.selected` show the target, and hover only moves the index.
5. **Which copies get key commands.** Every shown copy gets every `helm.*` command, so the owner
   table in 2.5 is needed. A 0 px block counts as shown. A hidden block, a stack child that is not
   active, and every block inside a hidden column get nothing. A copy does not start at all until
   its block is first shown: parts in the panel do not run until the panel is first opened. When
   no `helm` copy is shown, the key shows an error toast ("unknown command"). This confirms that
   the engines live in an always shown part (2.3). They live in the status bar, which `krog`
   always shows. A 0 px block in the work column is a second place a host could live.

Also found while building the sandbox: an OSC 7501 report carries `msg` base64 encoded (it may
hold `:`, the field separator). The fake agent first sent it as plain text, and `hc get` showed
no `msg`. With base64 the Asks card reads its question and options from the report.

---

## 3. Migration, switch-over and rollback

### 3.1 Saved state

`engines/migrate.js` runs once in the host when `helm.migrated` is below the current version.
It copies; it never deletes the old data, so rollback keeps working.

| What | From | To |
|---|---|---|
| Space folders, colours, folded folders | `~/.config/herdr-space-folders.json` (each machine) | same file, read as is; mirror moves from `space-folders` to `helm.folders` |
| Space avatar colours | shared `space.colors` | same key, unchanged |
| Collapsed machines | `data/space-folders/store.json` `machines.folded` | `helm.prefs.machinesFolded` |
| Hide frozen | `data/space-folders/store.json` `frozen.hidden` | `helm.prefs.hideFrozen` |
| Per-space panel choice | `data/tabs-asks/store.json` `panels` | `helm.prefs.panels`; the value `claude-artifacts` becomes `artifacts` if the stack child is renamed (it is not renamed in this plan) |
| Agents sort | shared `agents.sort` | `helm.prefs.agentsSort` |
| Agent state-change times | `data/agents/store.json` `changed` | `helm.agents.changed` |
| Asks scope | `data/asks/store.json` `scope` | `helm.prefs.asksScope` |
| Artifacts scope | `data/claude-artifacts/store.json` `artifacts.scope` | `helm.prefs.artifactsScope` |
| Asks cards, history, checked turns | shared `asks.state` | `helm.asks` (copied once; `asks.state` left as is) |
| Decisions log | `~/.config/herdr-app/decisions/*.md` | same files, unchanged |
| Frozen spaces | label `herdr.frozen`, `~/.local/state/space-freeze/` | same, unchanged |

The `data/<mod>/store.json` files are read with `readTextFile(appHome() + …)`. Step 0.3 checks
that this file format is what Herdr uses for localStorage in 0.1.16.

Rule while both run: `helm` does not add top-level fields to the folder file. The old
`space-folders` rewrites the file with only `list`, `of` and `at`, and would drop new ones.
Fields inside a folder entry are safe (it spreads them).

### 3.2 Keys

New `layout:krog` section, installed from `keys/layout-krog.json`:

| Key | Command |
|---|---|
| `alt-down`, `ctrl-shift-down` | `helm.space-next` |
| `alt-up`, `ctrl-shift-up` | `helm.space-prev` |
| `ctrl-alt-a` | `helm.panel-asks` |
| `ctrl-alt-f` | `helm.panel-files` |
| `ctrl-alt-c` | `helm.panel-changes` |
| `ctrl-alt-r` | `helm.panel-artifacts` |
| `ctrl-shift-a` | `helm.panel-artifacts` (replaces the raw `layout.select`) |
| `ctrl-alt-j` | `helm.next-waiting` |
| `ctrl-alt-b` | `helm.space-back` |
| `ctrl-alt-h` | `helm.hide-frozen` |

This also does the survey's "cut the six next/previous space bindings to two": the other four
(`ctrl-shift-pagedown/pageup`, `ctrl-space shift-n/p`, `ctrl-shift-e`, `ctrl-shift-u`) fall back
to the `global` section. Oystein confirms which two stay at step 9.2.

### 3.3 Switch-over

1. Build `helm` and test it in the sandbox only (sections 6 and 7).
2. Install `helm` beside the old mods and add a second layout, `krog-next`, which is `krog` with
   every block pointing at `helm`. Its keys go in `layout:krog-next`. Oystein can switch with
   `ctrl-shift-l` and back. Only the shown layout's mods run, so the old and new Asks engines
   never run at the same time.
3. When every box in section 1 is ticked and Oystein has used `krog-next` on both desktops,
   swap: `krog.json` gets the `helm` blocks, and the old file is kept as `krog-legacy.json`
   (pointing at the old mods).
4. The old mods stay installed until Oystein says the swap is good. Then step 10.2 removes them.

### 3.4 Rollback

- Before step 3.3.3: switch back to `krog` (`ctrl-shift-l`).
- After it: `herdr-app do layout.switch '{"name":"krog-legacy"}'`. The folder file, freeze state
  and decisions log are shared, so nothing is lost. Asks cards made in `helm` after the swap stay
  in `helm.asks` only; the old engine finds still-open dialogs again on its next tick.
- `herdr-setup install` with the previous pin restores the previous `helm`.

---

## 4. Install

- `herdr-setup` gets one new row for herdr-helm, pinned to a commit:
  `helm/=mods/helm`, `layouts/krog.json=layouts/krog.json`. No patch file. The patch column
  becomes optional.
- `keys/layout-krog.json` is merged into the `layout:krog` section of the dotfiles copy of
  `keys.json` (that file stays in dotfiles, since it holds every layout's keys).
- The layout file moves from `~/.dotfiles/setup/herdr/files/layouts/krog.json` to this repo.
- After the swap (step 10.2): the rows `herdr-space-folders`, `herdr-agent-ask` and
  `herdr-artifacts` go, and so do `patches/space-folders.patch`, `patches/herdr-agent-ask.patch`,
  `patches/claude-artifacts.patch` and `files/mods/space-freeze/`. The `herdr-whitby` row and
  Shepherdr stay; other layouts use them.
- The second desktop: pull dotfiles, run `herdr-setup install` there. `helm` must be at the same
  commit on both, because the office runs `bin/freeze.sh` from the other desktop's install
  (`$HERDR_APP_HOME/mods/helm/bin/freeze.sh`) with `exec on`. `freeze.sh version` prints a number;
  the freeze engine refuses to freeze or thaw on a machine with another number and says so.
- Development never writes into the real `~/.config/herdr-app`. `tools/sbx/sync.sh` copies the
  working tree into the sandbox app home only. The real app gets a pinned install.

---

## 5. Licenses and credits

This must be done before any push that holds code taken from another repo. The first push
(PLAN.md, README.md, LICENSE) holds none.

| Source | License | Used for |
|---|---|---|
| herdrdev/herdr-app shipped mods (`agents`, `workspace-status`, `workspace-chrome`, `pane`, `tabs`, `spaces`, `menu`), version 0.1.16 | Apache-2.0 | agents, status, brand, footer, pane-header, tab bar, sidebar base, icons |
| jankeesvw/herdr-space-folders at 63a78b2 | MIT (its folder also carries Herdr's Apache-2.0, as it builds on `spaces`) | spaces part and folder engine |
| sachin-philip/herdr-agent-ask at 764155f | MIT | Asks engine, parser, panel, test stubs and fixtures |
| jmoyers/herdr-artifacts at 7d85899 | MIT | artifacts part and `artifacts.py` |
| Lucide icons, as shipped in Herdr's mods | ISC | `helm/icons/` |
| eliasstravik/shepherdr | MIT | ideas only so far (`sync-shared`); copy only with credit |
| VladTemp27/herdr-orca | Apache-2.0 | ideas only (parts, hibernate) |
| AkaraChen/2code | no license | ideas only. Never copy its code |

Rules:

- `NOTICE` lists each source repo, its commit and what came from it.
- `THIRD-PARTY-LICENSES/` holds the full license text of each source.
- Files derived from herdr-app keep the Apache-2.0 notice and say at the top that they were
  changed, and how. This is an Apache-2.0 requirement.
- Only copy from a repo with a license. Anything else is written fresh.
- The herdr-app commit for 0.1.16 is looked up and written into `NOTICE` in step 1.4.

---

## 6. Testing

Two kinds of test. Neither touches Oystein's real screen, real `hc` core or real app home.

### 6.1 Plain Node tests

`node --import ./tests/register.mjs --test` with stubs for `"herdr"` and `"gpui-kit"`, the
approach herdr-agent-ask already uses (its `tests/herdr-stub.mjs`, `gpui-stub.mjs`,
`register.mjs`, MIT). Engines are written as pure functions of a snapshot (terminals, agents,
spaces, panes, shared state) plus small effect functions, so most logic runs without Herdr:

- Asks: `parseScreen`, `parseReport`, `parseLastMessage` (Claude and Codex), `normalize`,
  `wizardOn`, `declinedOn`; the detect reducer (new, stale after 3 s, stopped, healed, 60 and 24 h
  limits); delivery with a stubbed `hc` (Enter only when still up, one resend at most, declined).
  Fixtures: the real screens in herdr-agent-ask's `tests/fixtures`.
- Spaces: `rule`, `reach`, `deepest`, `folderOf`, `machineFolder`; the order builder (folders,
  machines, folded, hidden frozen); next and previous wrap; adopt, join, settle, closed;
  git `due`.
- Freeze: `frozenSpaces` and `frozenTerminals` from labels with the fallback; mirror merge with `rev`.
- Agents: rank with sub-agents, labels and the duplicate-detail rule, title cleaning.
- Store and migration: write-only-when-changed, every row of table 3.1.
- UI: the hover rule (2.6), the command owner table (2.5).
- `freeze.sh`: `plan` and `list` against a stub `hc` on `PATH`, in a temp `HOME`.

### 6.2 The app in a sandbox

Load the `headless-app-ui` skill first. The scripts in `/var/tmp/claude/fz-app` and
`/var/tmp/claude/fz-sbx` already do this for `space-freeze`; `tools/sbx/` generalises them:

- Private Xvfb display (never `:0`, `WAYLAND_DISPLAY` unset), private `XDG_RUNTIME_DIR`,
  `XDG_CACHE_HOME`, `XDG_STATE_HOME`, its own D-Bus session (`dbus-run-session`).
- Private `hc` core (`hc server start` inside that runtime dir); `HC_SOCKET`,
  `HC_TERMINAL_SOCKET` and `HC_TERMINAL_ID` unset.
- `HERDR_APP_HOME` is a reflinked copy of the real app home, made once.
- A fake second machine from a second private core (as `fz-sbx` does), for remote spaces,
  remote folders and remote `freeze.sh`.
- `ui.sh` (xdotool clicks and keys into that window only) and `herdr-app shot` for screenshots.
  Both refuse to run if `DISPLAY` is `:0` or `HERDR_APP_HOME` is not a sandbox path.
- Fake agents: a small script that reports agent status (OSC 7501: working, blocked with a
  question report, idle, error), so Asks cards and agent rows can be made on demand. Its exact
  sequence comes from `hc --skill` in step 0.2.
- Only stop processes this sandbox started.

Scroll test (2.6a), for the spaces list and every other scrolling list: with enough rows to
scroll, scroll down, then freeze a space, thaw it, rename one, open and close a menu, fold and
unfold a folder, wait for the timed reloads (15 s and 60 s), and change agent statuses with fake
agents. The scroll position must not move in any of these. A keyboard space switch to a row that
is off screen scrolls just far enough to show it. With the list scrolled to the bottom, a space dragged to
the top edge strip and held there scrolls the list up to the folders and drops into one; a space
in a folder dragged onto the drop-out zone leaves it, and starting that drag does not move the list.

For each part: `herdr-app check` passes (`tools/check-all.sh`), then a scenario list with a
screenshot, compared side by side with the old mod in the same sandbox on the `krog` layout.

---

## 7. Work steps

Each step touches one to three files and ends with a commit. "Done when" is the test.
Steps in a phase run in order; phases 2 to 8 can overlap once phase 1 is done.

### Phase 0: repo, sandbox, facts

- **0.1 Repo.** `PLAN.md`, `README.md`, `LICENSE`. Done when: committed and pushed (this commit).
- **0.2 Sandbox tools.** `tools/sbx/start.sh`, `ui.sh`, `sync.sh` from the `fz-app` scripts,
  plus the fake agent. Done when: the sandbox window shows today's `krog` layout on a private
  display with a private core, a fake agent shows as blocked, a screenshot is saved, and both
  scripts refuse `DISPLAY=:0`.
- **0.3 Facts spike.** `helm/main.js`, `helm/mod.json` with two trivial parts. Find out and write
  into this plan: (a) what `nextCommand()` returns for `helm.space-next` and for a dotted name;
  (b) whether two parts of one mod share localStorage, and the `data/<mod>/store.json` format;
  (c) whether `herdr-app check` can check a part, or whether `main.js` must render all parts when
  `checking()` is true; (d) whether `on_hover` fires in popups on 0.1.16 (#753); (e) whether keys
  reach the tab bar copy in all cases. Done when: five answers are in a "Facts" section here.

### Phase 1: shared code

- **1.1** `helm/lib/store.js` + test. Done when: keys, prefs and write-only-when-changed pass tests.
- **1.2** `helm/lib/ui.js` + test. Done when: menu, button, dialog helpers exist and the hover
  rule test passes.
- **1.3** `helm/lib/layout.js`, `names.js`, `time.js` + tests. Done when: tests pass.
- **1.4** `NOTICE`, `THIRD-PARTY-LICENSES/`, `helm/icons/`. Done when: every source in section 5
  is listed with commit and full text, and every icon `helm` draws is in `helm/icons/`. This step
  comes before any push of copied code.
- **1.5** `helm/main.js`, `helm/engines/host.js` + test. Done when: parts are picked by
  `props.part`, the command owner table routes each command to one part, and the host guard
  starts engines once.
- **1.6** `tests/register.mjs`, `tests/herdr-stub.mjs`, `tests/gpui-stub.mjs`. Done when:
  `node --test` runs an empty part test.

### Phase 2: simple parts

- **2.1** `parts/brand.js`, `parts/footer.js`. Done when: matches 1.9 in the sandbox.
- **2.2** `parts/status.js`. Done when: matches 1.8, with an empty right-side slot.
- **2.3** `parts/pane-header.js`. Done when: matches 1.10.
- **2.4** `layouts/krog.json` as `krog-next`, using the three parts above and the old mods for
  the rest. Done when: `herdr-app check` passes and the layout loads in the sandbox.

### Phase 3: spaces

- **3.1** `engines/spaces/folders.js` + test. Done when: file read and write per machine, rules
  and folder choice pass tests and match today on the real folder file (read only).
- **3.2** `engines/spaces/git.js` + test. Done when: `due` passes tests and git runs no more often
  than table 1.2.
- **3.3** `engines/spaces/order.js` + test. Done when: the list as data, next and previous,
  adopt, join, settle and closed pass tests; `helm.spaces.order` is published.
- **3.4** `parts/spaces.js`. Done when: every box in 1.2 under spaces list, folders, machines and
  new spaces passes in the sandbox, including drag and drop.
- **3.5** `parts/folder-menu.js`, `parts/folder-edit.js`. Done when: colours, new space here,
  edit, delete and the rule hints match 1.2.

### Phase 4: freeze

- **4.1** `bin/freeze.sh` (copied from dotfiles, plus `version`), `engines/freeze.js` + test.
  The old path `~/.config/herdr-app/mods/space-freeze/freeze.sh` keeps working until the
  `herdr-sessions` skill and the managers call the new one: `herdr-setup` installs a one-line
  wrapper there that runs `mods/helm/bin/freeze.sh`. Commands, arguments and JSON output stay
  the same. Done when: tests pass, `freeze.sh list` runs on the fake second machine, and the old
  path gives the same output as the new one.
- **4.2** `parts/space-menu.js`. Done when: every item in 1.3, keyboard and pointer, with the
  selected highlight visible in gruvbox.
- **4.3** `parts/freeze.js`, `parts/thaw.js`. Done when: freeze and thaw a sandbox space with a
  fake Claude session on both machines; the snowflake shows; hiding frozen works.

### Phase 5: Asks

- **5.1** `engines/asks/parse.js` + tests and fixtures. Done when: all parser tests from
  herdr-agent-ask pass here.
- **5.2** `engines/asks/state.js`, `detect.js`, `sources.js` + tests. Done when: the reducer tests
  in 6.1 pass.
- **5.3** `engines/asks/classify.js` + test. Done when: both backends work with stubbed `exec`
  and the auth retry is remembered.
- **5.4** `engines/asks/deliver.js` + test. Done when: delivery tests in 6.1 pass.
- **5.5** `parts/asks.js`. Done when: every box in 1.5 passes in the sandbox with fake agents.
- **5.6** Host commands in `engines/host.js`: next waiting, space back, recheck, accept, toasts.
  Done when: the keys in 3.2 work in the sandbox, toasts open the panel.

### Phase 6: tab bar

- **6.1** `parts/tabbar.js`. Done when: every box in 1.4 under tab bar passes, panel choice per
  space works. (The engines run in the status part, see 2.3.)

### Phase 7: agents

- **7.1** `engines/agents.js` + test. Done when: rank, tree, labels and change times pass tests.
- **7.2** `parts/agents.js`, `parts/sort-menu.js`. Done when: every box in 1.6 passes.

### Phase 8: artifacts

- **8.1** `bin/artifacts.py`, `engines/artifacts.js`, `parts/artifacts.js`. Done when: every box
  in 1.7 passes against a sandbox Claude session with one published artifact.

### Phase 9: switch

- **9.1** `engines/migrate.js` + test. Done when: every row of table 3.1 passes on a copy of the
  real `data/` folder and `shared.json`.
- **9.2** `keys/layout-krog.json`, `layouts/krog.json` with every block on `helm`. Done when:
  every box in section 1 is ticked in the sandbox, and Oystein confirms the key list.
- **9.3** `herdr-setup` row and `krog-next` on both desktops. Done when: Oystein runs
  `krog-next` on his real window and says the swap can go ahead.
- **9.4** The swap (3.3 step 3). Done when: `krog` runs `helm`, `krog-legacy` exists, rollback
  tested once.

### Phase 10: clean up

- **10.1** Check that no code for the three dropped features (section 9) came across.
- **10.2** In dotfiles: remove the three add-on rows, three patches and `files/mods/space-freeze/`
  (the `freeze.sh` wrapper from step 4.1 stays until the `herdr-sessions` skill uses the new path).
  Done when: `herdr-setup check` is clean on both desktops and the old mod folders are gone after
  Oystein's yes.

### Later (not in this plan's scope)

Doing-now line and stuck warning; aiolos number and timeline panel; frozen state on agent and
tab rows. Each one starts with its own short plan that uses the slots in 2.7.

---

## 8. Risks

- **One mod, one reload.** Saving any file reloads every part, the host too. An answer being
  delivered at that moment is cut off and its card is left in `sending`. Fix: on host start, a
  card in `sending` for more than 30 s becomes `failed` with Retry (the heal rule then checks if
  it landed).
- **One broken file breaks every part.** Herdr keeps the last good build running and reports the
  error in `herdr-app status`, so the window keeps working. `tools/check-all.sh` runs before
  every commit.
- **Keys reach shown copies only.** If the tab bar is ever hidden, every `helm.*` key stops.
  `krog` never hides it; step 0.3 checks the details.
- **No more upstream fixes.** The Asks engine and the folder sidebar stop getting fixes from their
  authors. That is the trade Oystein chose. Read their changelogs now and then and port by hand.
- **Herdr 0.1.x changes its API.** Each Herdr update can break a part. Keep `helm` tested against
  the app version in `herdr-setup`, and run the sandbox scenarios after each app update.
- **Two desktops, two installs.** `freeze.sh` runs from the other desktop's install. The version
  check in section 4 stops a mismatch from freezing with the wrong script.
- **Shared state size.** `asks.state` is about 338 KB, and every write redraws every mod. Keep
  the 60-card and 24 h limits, and write only on change. If it gets slow, move the history to a file.
- **Popup hover (#753).** Menus may show a stale hover. The keyboard index and `t.selected` keep
  the target clear.
- **Running old and new together.** Both read the folder file and freeze state. The rule in 3.1
  (no new top-level fields) keeps the old mod from dropping data.
- **Other callers of `freeze.sh`.** The `herdr-sessions` skill and the manager sessions run it
  by path and parse its JSON. Moving or changing it breaks their freezing. Keep the wrapper at the
  old path and change the output only together with the skill.
- **Public repo.** A hostname or account name could slip into a fixture or a log. `check-public.sh`
  and a review of fixtures before each push.

---

## 9. Decisions and open questions

Decided by Oystein on 2026-11-20:

- The plan is approved; build it.
- Drop three features the current mods have and he does not use: worktree nesting in the spaces
  list, the "neither Claude nor Codex is installed" notice card, and the macOS window-button
  (traffic-light) padding.

Still open:

1. For the aiolos number in the status bar: which value is "percent free"? The fetcher has the
   usable capacity now (`capacity.now_avail`) and the weekly room. This is for the later item
   only and blocks nothing here.
