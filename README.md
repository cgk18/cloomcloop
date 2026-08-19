# cloomcloop

An IDE-style shell for Claude Code: your sessions as a tree/graph on the left, a **real embedded `claude` chat** on the right. Branch one agent into many without writing handoff markdown.

```
 cloomcloop      myproj · tree  │╭─── Claude Code v2.1.x ─────────────────────────╮
 ● api refactor research    6s  ││                                                │
 ├─▶ api-refactor           4m  ││  > tighten the parser and fix the tests        │
 │ └─○ tests               12m  ││                                                │
 └─● docs                  12m  ││  ⏺ I'll start by reading parser.ts …           │
 ○ old spike               23h  │╰────────────────────────────────────────────────╯
 ────────────────────────────── │
 951047ea · ~/GitHub/myproj     │
 ⑂ from 2de16ee9 @ turn 37      │
 enter open · b branch · n new …│  2 live · 6 shown · pane: api-refactor
```

## What it does

The right pane hosts an actual `claude` process on a pty — it looks identical to Claude Code because it *is* Claude Code. The left sidebar is the session tree (toggle to a 2-line graph-card view with `v`).

- **`enter`** — open the selected session in the pane (resumes dormant sessions; sessions running in *other* terminals can't be embedded and say so).
- **`b`** — branch the selected session: name + one-line intent (+ optional git worktree). Runs `claude --resume <id> --fork-session` right in the pane; the child inherits the whole conversation and the intent goes in via `--append-system-prompt` with hand-back instructions. **Branching a parent that already has children just adds a sibling** — fork as many times as you like, from any node.
- **`ctrl-]`** — jump between sidebar and chat. In chat focus every other key goes straight to claude.
- **`n`** new root session · **`x`** close pane · **`v`** tree ↔ graph · **`a`** this project ↔ all · **`?`** help · **`q`** quit (embedded sessions end but stay resumable).
- Sees every session on the machine — live ones via the session registry, past ones via transcripts — and draws lineage from Claude Code's own `forkedFrom` records ("⑂ from &lt;id&gt; @ turn N").

## Install / run

```sh
npm install                          # `prepare` builds dist/ automatically
ln -sf "$PWD/bin/cloomcloop.js" /opt/homebrew/bin/cloomcloop   # or: sudo npm link
```

Then from **any repo**:

```sh
cd ~/code/some-other-project
cloomcloop            # sidebar scoped to that repo, new sessions start in your cwd
cloomcloop --all      # every project on the machine
cloomcloop --list     # plain-text tree, no TUI
cloomcloop ~/code/x   # scope to an explicit directory
```

Scoping: the sidebar shows sessions whose cwd is inside the git root of where you ran it (plus their lineage); `n` starts new sessions in the exact directory you launched from.

Needs Node ≥ 20 and Claude Code ≥ 2.1.198 (for `--fork-session`).

## How it works

| Source | Used for |
|---|---|
| `~/.claude/sessions/<pid>.json` | live sessions: name, cwd, busy/idle, pid |
| `~/.claude/projects/<proj>/<id>.jsonl` | titles, prompts, `forkedFrom` lineage, timestamps (head+tail scan, cached by mtime in `~/.cloomcloop/`) |
| `claude` on a pty (node-pty) + headless xterm screen buffer | the embedded chat pane |
| `claude --resume <id> --fork-session --name … --worktree …` | the branch gesture |
| `~/.cloomcloop/branches.json` | the intent you typed for each branch |

The transcript JSONL and session registry are **internal Claude Code formats** — everything is read defensively and may need updating when Claude Code changes (tested against 2.1.236).

Env vars: `CLOOM_CLAUDE_BIN` swaps the binary run in panes (testing); `CLOOM_DEBUG=<file>` appends diagnostics; `CLOOMCLOOP_DIR` moves cloomcloop's state; `CLAUDE_CONFIG_DIR` is honored like Claude Code does. Nested-session env markers are scrubbed so embedded claudes behave like top-level ones.

## Roadmap

- Hand-back relay: a `Stop` hook in child sessions that summarizes (decisions / files touched / open questions) via `claude -p --output-format json` and posts it to the parent's messaging socket.
- Fork at an arbitrary turn (transcript slicing), not just the tip.
- Multiple visible panes (split chat view), scrollback in the pane.
- `d` diff view between a child worktree and its parent branch.
- Message a node (`m`) via Claude Code's cross-session socket.
