# Third-party landscape: orchestrating multiple Claude Code sessions (Aug 2026)

> ~40 tools surveyed. The recurring question: **how does context move between sessions?** Almost always: "it doesn't", or "plain text". Star counts are as-fetched on 2026-08-19 where noted; treat others as approximate.

## Terminal/TUI multiplexers (isolation, no context flow)

| Tool | Shape | Context between sessions |
|---|---|---|
| [Claude Squad](https://github.com/smtg-ai/claude-squad) (8.3k★) | tmux + worktree per task; multi-CLI | none by design |
| [ccmanager](https://github.com/kbwo/ccmanager) | TUI, 8 agent CLIs, multi-project | **can copy CC session data into a new worktree** — coarse one-shot clone |
| [agent-deck](https://github.com/asheshgoplani/agent-deck) | TUI mission control | session forking (transcript copy) |
| amux · dmux · herdr · repomon · agent-console · thurbox · tmux-ide · Zellij "Agent Lanes" | tmux/layout multiplexers | none (thurbox: text messaging) |
| Cursor 3 Agents Window · Codex app · OpenAI Symphony | vendor-native parallel agents | repo only |

## Desktop / web apps

| Tool | Notes |
|---|---|
| [Conductor](https://conductor.build) | closed, Mac; parallel workspaces, diff/review/merge; no cross-workspace context |
| Crystal → [Nimbalyst](https://github.com/nimbalyst/nimbalyst) | Crystal deprecated Feb 2026; Nimbalyst MIT (Apr 2026), kanban + worktrees |
| [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) | Bloop shut down Apr 2026; community-maintained |
| [coder/mux](https://github.com/coder/mux) (2k★) · Berd (Block) · Emdash · jean · supacode · … | 2026 wave of worktree-per-agent desktops; all isolation, no context flow |
| [Maestri](https://www.themaestri.app/en) | closed, Mac; **infinite canvas; draw a line → one agent types into another's PTY**; closest UX metaphor, raw keystrokes only |
| [Traycer](https://github.com/traycerai/traycer) (1.2k★) | shared context store across model providers |
| [Tempest](https://github.com/tempestai-dev/tempest) (125★) | shared *code* knowledge graph (not conversation) |

## Graph/DAG UIs — the closest neighbors

| Tool | What | Context flow | Gap |
|---|---|---|---|
| [GraphCode](https://github.com/scgopi/GraphCode) (44★, 638 commits) | macOS; ≤10 CC sessions as live graph nodes, attachable terminals; loop types turn/goal/time/composite | edges = hand-offs (fire on resolve), messages (`graphcode node send`), memos | Mac-only, CC-only, tiny community, text payloads |
| [claude-studio](https://github.com/androidZzT/claude-studio) | drag-drop DAG editor for Agent Teams; 4 edge types; NL→DAG | agent-teams semantics (task list + mailbox, no transcript) | design-time |
| [claude-workflow-composer](https://github.com/fayzan123/claude-workflow-composer) (34★) | canvas; edges carry artifacts; exports `.claude/agents/*.md` | artifacts declared at design time | compiles to prompts |
| [agent-flow](https://github.com/patoles/agent-flow) (1.6k★) | real-time graph *visualization* via hooks | observe-only | can't spawn/control |
| [Open Multi-Agent](https://github.com/open-multi-agent/open-multi-agent) (6.8k★) | TS runtime: coordinator builds task DAG, deterministic scheduler | shared memory + execution receipts | backend, no canvas |

## Frameworks that spawn Claude Code

| Tool | Model | Context sharing | Why we didn't build on it |
|---|---|---|---|
| [Ruflo](https://github.com/ruvnet/ruflo) (ex claude-flow, 68k★) | MCP swarms/hive-mind | AgentDB vector store + SQLite | heavy, opaque, contested benchmarks |
| [oh-my-claudecode](https://github.com/yeachan-heo/oh-my-claudecode) (38.7k★) | plan→exec→verify pipeline on agent teams | task list + `.omc/artifacts/` markdown | still markdown handoffs |
| [Paperclip](https://github.com/paperclipai/paperclip) (78.9k★) | heartbeat-driven "company" | issues + comments | ticket-shaped, no memory yet |
| [Gastown](https://github.com/gastownhall/gastown) + [Beads](https://github.com/steveyegge/beads) | 20–30 agents in worktrees | Dolt-versioned dependency-graph issue DB | heavy Go/Dolt stack, token-hungry |
| [hcom](https://github.com/aannoo/hcom) (456★) · [guild](https://github.com/mathomhaus/guild) (312★) · [tutti](https://github.com/nutthouse/tutti) (112★) · [gnap](https://github.com/farol-team/gnap) (81★) | hooks-based spawn/fork · MCP briefs/lore · typed artifacts injected into worktrees · git-native JSON bus | good ideas, no UI | each requires adopting a whole framework |

**Memory layers** (claude-mem, Mem0, Letta, Graphiti/Zep): all "search-then-inject"; none record which *branch* of which session a fact came from. No maintained git-notes handoff tool found.

## The gap (why cloomcloop exists)

1. Branching with context is **native but invisible** — no tree view, no "forked from X at turn 37".
2. **Teams don't inherit; forks don't coordinate** — nothing combines inherit-at-spawn with ongoing structured sharing.
3. Sibling context flow is **text-only everywhere**.
4. Visual graph tools are **tiny or design-time** (GraphCode 44★ is the only live-node canvas).
5. **Merging conversational results is unsolved** — everyone does manual parent synthesis.
6. Non-markdown handoff exists **only inside heavyweight frameworks**.

Open slot: a thin layer on native primitives (`--fork-session`, messaging sockets, worktrees, hooks) with a tree/graph UI where forking is a gesture and edges carry typed payloads. Full illustrated report: https://claude.ai/code/artifact/9f270399-1db6-4caf-a227-5be4a76728ca
