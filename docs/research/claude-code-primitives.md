# Claude Code native primitives for branching & multi-agent work

> Researched 2026-08-19 against official docs (code.claude.com) and Claude Code **2.1.236** on this machine. These are the primitives cloomcloop builds on.

## Session branching

| Feature | Since | What it does |
|---|---|---|
| `/branch [name]` (alias `/fork`) | 2.1.198 | Copies the conversation into a **new session ID**; original untouched. Carries session permissions, Remote Control, in-flight subagents. CLI: `claude --resume <id> --fork-session`. |
| `/subtask [prompt]` | 2.1.212 | Fork that inherits the full conversation, runs in a **background panel**; only the final result returns to the parent. Recommended fork method. |
| `fork` subagent (`subagent_type: "fork"`) | default-on 2.1.232 | Model-initiated fork: inherits full history + system prompt + **prompt cache** (cheap). Forks can't nest. Disable: `CLAUDE_CODE_FORK_SUBAGENT=0`. |
| `/rewind` (Esc Esc) | — | Restore conversation and/or files to a checkpoint (one per prompt, last 100). "Summarize from here / up to here". |

**Key fact:** forking a parent that already has children just creates another sibling. Lineage is recorded in the child's transcript as `forkedFrom: { sessionId, messageUuid }`.

## Sessions

- `--continue`, `--resume [id|name]` (cross-project lookup since 2.1.223), `/resume`, `-n/--name`, `/rename` (collision → `name-suffix`), `--session-id`, `--no-session-persistence`.
- Resume-from-summary dialog for >100K-token sessions (Pro/Max).
- `/export` → plain text. Transcripts: `~/.claude/projects/<proj>/<session>.jsonl` — **internal format, may drift**. `transcript_path` is exposed to hooks/statusline.

## Multi-agent

- **SendMessage / ListAgents** (2.1.224+, macOS/Linux): session→session plain text over per-session Unix sockets (`/tmp/cc-socks/<pid>.sock`); cross-machine via Remote Control; ~1M char cap; `crossSessionInbound: accept|hold|refuse`.
- **Agent teams** (experimental, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`): lead + teammates as separate CC instances; shared file-locked task list (`~/.claude/tasks/<team>/`), JSON mailboxes (`~/.claude/teams/<team>/inboxes/`); tmux/iTerm2 split panes. **Teammates do NOT inherit the lead's history.**
- Custom subagents: `.claude/agents/*.md` (frontmatter: model, tools, skills, `isolation: worktree`, background).
- Dynamic workflows (`ultracode`, 2.1.154+): JS orchestration script; ≤16 concurrent, 1000 agents/run.
- Background sessions: `/bg`, `claude --bg`, `claude agents [--json]`; each gets an auto-worktree.

## Worktrees

`claude --worktree [name] / -w`, `--tmux`; containment enforced; `.worktreeinclude` copies gitignored files into new worktrees; `worktree.baseRef`; `--worktree "#1234"` branches from a PR; `EnterWorktree` / `ExitWorktree` tools.

## Context sharing

- CLAUDE.md hierarchy (org → user → project → local), `@imports` (depth 4), `.claude/rules/*.md` path-scoped rules.
- Auto memory: `~/.claude/projects/<proj>/memory/` (MEMORY.md first 200 lines / 25KB loaded; shared across worktrees).
- `--append-system-prompt`, `--system-prompt-file` (per invocation); hooks (SessionStart etc.) inject context.
- `claude -p --output-format json|stream-json` → returns `session_id` for programmatic chaining.
- Agent SDK: `resume` / `fork_session` / `continue`; `SessionStore` adapter mirrors transcripts to custom backends.

## On-disk formats observed locally (internal — version-guard everything)

- **Transcript JSONL is a message tree**: each record has `uuid` + `parentUuid`, plus `isSidechain`, `promptId`, `cwd`, `gitBranch`, `version`. Record types seen: `user`, `assistant`, `attachment`, `ai-title`, `custom-title` (from `/rename`), `last-prompt`, `mode`, `permission-mode`, `file-history-snapshot/-delta`, `queue-operation`, `agent-name`, `atis-latch`, `frame-link`.
- **Live registry** `~/.claude/sessions/<pid>.json`: `sessionId`, `cwd`, `name` (+`nameSince`), `status` (idle/busy), `kind`, `startedAt`, `updatedAt`, `messagingSocketPath`, `peerProtocol`. Auto-names look like `<dirname>-<2 hex>`.
- Env markers set inside a running session: `CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION` (inheriting the latter disables transcript saving in a spawned claude — scrub it).
