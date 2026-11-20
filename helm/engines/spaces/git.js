// Git facts for the spaces list: branch, ahead and behind, and the repo of each place a space
// works in. `git status` walks the whole tree (and on another machine starts a process there),
// so a place is looked at only when its answer could have changed (due()).
//
// From herdr-space-folders at 63a78b2 (MIT, see NOTICE). Changed for helm: a class of its own
// that the spaces part owns (the git tail is only drawn there), with due() testable on its own.
import { exec, watchFolder } from "herdr";
import { place } from "./folders.js";

// A place: [machine or null, folder], as a string key.
export const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app) are looked for this
// often, in repos the list shows, while the window is in front.
export const FALLBACK = 60000;

export class GitTracker {
  constructor() {
    this.git = {};           // where -> { name, branch, ahead, behind, repo, linked } | null (not a repo)
    this.checked = {};       // where -> when it was last looked at
    this.unsure = new Set(); // wheres git could not answer for (a machine away)
    this.pending = new Set();
    this.busy = {};          // pane -> an agent working or a program in front of its shell
    this.ready = {};         // machine -> its layout was readable at the last look
    this.at = {};            // space -> its where at the last look
    this.watching = new Set();
    this.refreshing = false;
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a command or an
  // agent's turn just ended, those on a machine that is back, and repos in view whose fallback
  // is due. `folded` is the set of folded machine names; `active` whether the window is in front.
  due(now, sp, ps, machineList, active, folded) {
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machineList) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead and behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refresh(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const list = [...this.pending];
        this.pending.clear();
        for (const k of list) await this.check(k, cx);
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git. No optional locks and no fsmonitor: a status that wrote under .git would
  // wake the folder watch again.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      const r = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch"], { cwd, on });
      if (r.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.stderr)) this.unsure.add(key);
        this.git[key] = null;
        return;
      }
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
      const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on });
      this.git[key] = parseStatus(r.stdout, common.stdout.trim(), top.stdout.trim(), on);
      if (!on) this.watch(common.stdout.trim(), cx);
    } catch {
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refresh(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }
}

// `git status --porcelain=v2 --branch` output plus the repo's .git folder and the checkout's top.
export function parseStatus(stdout, common, top, on = null) {
  const name = common.endsWith("/.git") ? base(common.slice(0, -5)) : base(common).replace(/\.git$/, "");
  const info = { name, branch: null, ahead: 0, behind: 0, repo: JSON.stringify([on, common]), linked: common !== `${top}/.git` };
  for (const line of stdout.split("\n")) {
    if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
    else if (line.startsWith("# branch.ab ")) {
      const [a, b] = line.slice(12).split(" ");
      info.ahead = Math.abs(parseInt(a, 10)) || 0;
      info.behind = Math.abs(parseInt(b, 10)) || 0;
    }
  }
  return info;
}

// The tail after a space's name, only what is unusual: the repo and branch when the name does
// not already say them, never main or master.
export function tail(g, name) {
  const raw = g.branch ?? "detached";
  const same = (a) => a.toLowerCase() === name.toLowerCase();
  const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
  const repo = same(g.name) ? "" : g.name;
  return { where: [repo, branch].filter(Boolean).join(" · "), ahead: g.ahead, behind: g.behind };
}
