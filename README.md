# cloomcloop

A live tree of your Claude Code sessions, in the terminal — branch one agent into many without writing handoff markdown.

```
 cloomcloop · all projects                                   11 live · 86 sessions
 ● api refactor research                    2de16ee9   6s │ api refactor research
 ├─● api-refactor                           951047ea   4m │ status  ● busy · pid 63334
 │ └─○ tests                                745b8752  12m │ cwd     ~/GitHub/myproject
 └─● docs                                   f0e43970  12m │ forked  from 2de16ee9 at turn 37
 ○ Handoff escalation queue page search     7b2901fc  23h │ ...
 └─○ old version of the handoff page        c591a2a4  23h │
```

## What it does

- **Sees every session** — running ones (via Claude Code's live session registry) and past ones (via transcript files), drawn as a tree using Claude Code's own `forkedFrom` lineage records.
- **`b` = branch**: fork the selected session into a new named agent (`claude --resume <id> --fork-session`) that inherits the full conversation, optionally in its own git worktree, launched into a new tmux window / iTerm tab / Terminal tab. You type a name and a one-line intent; the intent is injected via `--append-system-prompt` along with instructions to end with a hand-back note. No handoff .md files.
- **`enter` = resume** a dormant session in a new terminal surface.
- **`n` = new** root session in the current project.
- **`a`** toggles this-project ↔ all-projects; **`?`** help; **`q`** quit.

## Install / run

```sh
npm install && npm run build
node dist/cli.js            # or: npm link && cloomcloop
cloomcloop --list           # plain-text tree, no TUI
cloomcloop --all            # start in all-projects view
```

Needs Node ≥ 20 and Claude Code ≥ 2.1.198 (for `--fork-session`). Launcher preference: tmux (if inside tmux) → iTerm2 → Terminal.app.

## How it works

| Source | Used for |
|---|---|
| `~/.claude/sessions/<pid>.json` | live sessions: name, cwd, busy/idle, pid |
| `~/.claude/projects/<proj>/<id>.jsonl` | titles, prompts, `forkedFrom` lineage, timestamps (head+tail scan, cached by mtime in `~/.cloomcloop/`) |
| `claude --resume <id> --fork-session --name … --worktree …` | the branch gesture |
| `~/.cloomcloop/branches.json` | the intent you typed for each branch |

The transcript JSONL and session registry are **internal Claude Code formats** — everything is read defensively and may need updating when Claude Code changes (tested against 2.1.236).

Env vars: `CLOOM_DRY_RUN=1` shows launch commands instead of executing; `CLOOM_DEBUG=<file>` appends diagnostics; `CLOOMCLOOP_DIR` moves cloomcloop's state; `CLAUDE_CONFIG_DIR` is honored like Claude Code does.

## Roadmap

- Hand-back relay: a `Stop` hook in child sessions that summarizes (decisions / files touched / open questions) via `claude -p --output-format json` and posts it to the parent's messaging socket.
- Fork at an arbitrary turn (transcript slicing), not just the tip.
- `d` diff view between a child worktree and its parent branch.
- Message a node (`m`) via Claude Code's cross-session socket.
