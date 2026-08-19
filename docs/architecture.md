# cloomcloop architecture & build log

## What it is

An IDE-style shell for Claude Code: session tree/graph in a left sidebar, a **real `claude` process embedded in the right pane**. Branching is a gesture; lineage comes from Claude Code's own records; no handoff markdown.

```
┌ sidebar (tree ⇄ graph) ──────┬─ chat: real claude on a pty ─────────┐
│ ● research session        6s │ ╭─── Claude Code v2.1.236 ─────────╮ │
│ ├─▶ api-refactor          4m │ │  > tighten the parser …          │ │
│ │ └─○ tests              12m │ │  ⏺ Reading parser.ts …           │ │
│ └─● docs                 12m │ ╰──────────────────────────────────╯ │
├──────────────────────────────┴──────────────────────────────────────┤
│ enter open · b branch · n new · v view · … ·   2 live · 6 shown     │
└─────────────────────────────────────────────────────────────────────┘
```

## Module map

| Path | Role |
|---|---|
| `src/cli.tsx` | arg parsing, git-root scoping, alt-screen takeover, `--list` mode |
| `src/claude/paths.ts` | `~/.claude` + `~/.cloomcloop` locations, `CLAUDE_CONFIG_DIR` honored |
| `src/claude/live.ts` | live registry reader (`~/.claude/sessions/<pid>.json`), dead-pid filtering |
| `src/claude/transcripts.ts` | transcript indexer: head+tail chunk scan per `.jsonl`, mtime+size cache in `~/.cloomcloop/transcript-cache.json`; `locateForkPoint()` streams the parent to find "forked at turn N" |
| `src/claude/branches.ts` | `~/.cloomcloop/branches.json` — the *intent* you typed per branch (the one thing Claude Code doesn't record) |
| `src/graph.ts` | merges live + transcripts + branches into a tree; labels (title > branch name > ai-title > first prompt > auto-name); scope filter keeps lineage; live roots sort first |
| `src/pty.ts` | `PtyManager`: `claude` under node-pty, mirrored into `@xterm/headless` screen buffers; env scrubbing; `rekey()` placeholder→real session id |
| `src/ui/ansi.ts` | xterm screen buffer → ANSI strings (SGR runs, wide chars, cursor invert) |
| `src/ui/TerminalPane.tsx` | renders the active pane's viewport |
| `src/ui/Sidebar.tsx` | tree rows, 2-line graph cards, selection info, branch form, help |
| `src/ui/App.tsx` | layout, focus routing, refresh loop, actions |

## Key mechanisms

- **Lineage**: child transcripts carry `forkedFrom: {sessionId, messageUuid}` — Claude Code writes this itself on `/branch`/`--fork-session`. We never invent edges; `branches.json` only adds intent metadata.
- **Branch gesture** (`b`): `claude --resume <parent> --fork-session --name <n> [--worktree <n>] --append-system-prompt <intent + hand-back instructions> [<intent>]` spawned **in the embedded pane**. Works on any node, any number of times — forks are independent siblings.
- **Focus model**: `ctrl-]` (0x1d) toggles sidebar ↔ chat. In chat focus a raw `process.stdin` data listener forwards bytes verbatim to the pty (Ink's parsed `useInput` is bypassed for fidelity); the focus byte is stripped from the stream.
- **Pane identity**: spawned panes start under placeholder ids (`new-…`/`branch-…`); an effect matches `pty.pid` against the live registry and rekeys to the real session id, so the pane shows as `▶` on its own tree node.
- **Env scrubbing**: `CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_SSE_PORT`, `CLAUDE_CODE_ENTRYPOINT` are stripped from pane env — inheriting the child marker silently disables transcript saving.
- **Scoping**: sidebar filters by git root of the launch dir (ancestors/descendants of lineage kept); `n` starts sessions in the exact launch dir (monorepo-friendly).

## Build log & hard-won lessons

**v0.1** (tree TUI + external-tab branching) → **v0.2** (embedded chat pane, graph view) → global launcher.

1. **Ink 7 coalesces fast keystrokes** into a single `useInput` string (`"jj"`); handlers comparing `input === 'j'` silently drop them. Split multi-char input and replay per char (except in text fields).
2. **Testing TUIs under `expect`: drain the pty continuously.** Node's tty writes are synchronous; if the harness `sleep`s without reading, the pty buffer fills and blocks the whole process — which presents as "timers don't fire" and "effects never run". A real terminal always drains. Harness: drain loop between keys, wait for a painted marker, run the *compiled* build (tsx cold-start is seconds).
3. **npm strips the execute bit** from node-pty's prebuilt `spawn-helper` → `posix_spawnp failed`. `chmod +x node_modules/node-pty/prebuilds/darwin-*/spawn-helper`.
4. `@xterm/headless` is CJS — default-import and destructure in ESM.
5. Transcript labels: prefer `custom-title` (`/rename`) > `ai-title` > first human prompt; auto-names look like `<dir>-<2hex>` and rank last.
6. `.jsonl` head+tail chunk reads (256KB/96KB) + mtime cache index 135 transcripts (~0.5GB) in well under a second; never parse whole files on the hot path.

## Known limits / roadmap

- Sessions running in *other* terminals can't be embedded (pty ownership) — they're marked and refuse politely. Future: talk to them via Claude Code's cross-session sockets.
- No pane scrollback yet; one visible pane at a time (`x` closes, reopening is cheap).
- **Hand-back relay** (next): Stop hook in child sessions → `claude -p --output-format json` summary (decisions / files touched / open questions) → parent's messaging socket → payload stored on the tree edge.
- Fork at an arbitrary turn (transcript slicing behind a version guard); `d` diff view child-worktree vs parent.

See `docs/research/` for the research this design rests on.
