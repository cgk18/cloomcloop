# Loop engineering → graph engineering (research notes, Aug 2026)

> What people mean by the shift, the primary sources, and what it implies for cloomcloop.

## The definitions

- A **loop** is one agent's control cycle: LLM → tool → observe → repeat until a verifier says stop. "Loop engineering" (Addy Osmani, Jun 2026; O'Reilly repost) is designing that cycle: verifiers, worktrees, skills, subagents.
- A **graph** is the wiring *between* loops: nodes (agents, deterministic steps, routers, checkpoints), edges (sequential / conditional / fan-out / fan-in), and the state that travels along edges. The Jul 2026 framing splits a stable **org graph** (long-lived roles, zones, persistent memory) from an ephemeral **work graph** (per-task nodes that split/merge/vanish).
- Layer stack in circulation: prompt (2023–24) → context (2024) → harness (OpenAI, Feb 2026) → loop (Jun 2026) → graph (Jul 2026). Term crystallised on X 18–19 Jul 2026 (Steinberger, Saboo); critics note it's LangGraph's 2024 thesis renamed ("loops are just shitty graphs").

## Primary sources worth reading

1. **Anthropic — multi-agent research system** (Jun 2025): orchestrator-worker, 3–5 parallel subagents with isolated contexts; +90% over single-agent at ~15× tokens. https://www.anthropic.com/engineering/multi-agent-research-system
2. **Cognition — "Don't Build Multi-Agents"** (Jun 2025): parallel workers make conflicting implicit decisions; share full traces. https://cognition.com/blog/dont-build-multi-agents
3. **LangChain — how/when to build multi-agent** (Jun 2025): read-heavy fan-out easy, write-heavy hard; the crux is context engineering. https://www.langchain.com/blog/how-and-when-to-build-multi-agent-systems
4. **MAST — "Why Do Multi-Agent LLM Systems Fail?"** (NeurIPS 2025): 14 failure modes — spec/design, inter-agent misalignment, weak verification. https://arxiv.org/abs/2503.13657
5. **Anthropic — when to use multi-agent** (Jan 2026) + **five coordination patterns** (Apr 2026): split only for context pollution / parallelism / specialization; **decompose by context boundary**; patterns: generator-verifier, orchestrator-subagent, agent teams, message bus, shared state. https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them
6. **Cognition — "Multi-Agents: What's Actually Working"** (Apr 2026): **single writer**; extra agents add intelligence, not actions; reviewer with clean context; "smart friend" receives a **fork of the full context**; "the open problems are all communication problems." https://cognition.com/blog/multi-agents-working
7. The Jul 2026 wave: Steinberger https://x.com/steipete/status/2078277297791189132 · Saboo https://x.com/Saboo_Shubham_/status/2078301249376825397 · guides: aibuilderclub.com/blog/graph-engineering-guide-2026, truefoundry.com/blog/graph-engineering-enterprise-guide, marktechpost.com (29 Jul).

## For / against graphs (evidence-backed)

**For:** context isolation (clean-context reviewers beat shared-context; Context-Folding arXiv 2510.11967 keeps active context ~10× smaller) · parallel wall-clock · determinism/auditability (graph_id/run_id/node_id) · resumability (LangGraph checkpoint forks; OpenAI Agents SDK checkpoints Apr 2026) · branching for competing hypotheses (SPORK arXiv 2607.03333).

**Against:** context fragmentation (parallel *writers* still banned by Cognition in 2026) · MAST misalignment failures; ClawArena-Team (arXiv 2606.31174): no model >50% precision scoping subagent permissions · 3–10× token cost; months of multi-agent work matched by better single-agent prompting (Anthropic) · handoff information loss · "not new".

## The four mechanics (2026 state of the art)

- **Fork a live context** → Claude Code `fork`/`/subtask` (full history + prompt cache, result-only return, no nesting); LangGraph `forkFrom: {checkpointId}`; Cognition's smart-friend fork.
- **Merge branches back** → production answer everywhere is **parent synthesis**. Claude Code issue #32631 (open) proposes `/merge <branch>` (LLM summary injected into parent) + `/diff` + `/tree` + `/switch`. KV-cache merging is research-only (Parallel-Synthesis arXiv 2606.14672; CanonicalMerge arXiv 2607.01308). Code merges stay git.
- **Share without handoff docs** → transcript/prefix forking; shared FS/memory (Managed Agents `/mnt/memory`); shared task list + mailbox (agent teams); graph memory (Zep/Graphiti, Mem0, Neo4j context graphs — *data* graphs, distinct from orchestration graphs). None track which *branch* a fact came from.
- **Human-in-the-loop navigation** → Claude Code agent panel / tmux panes; LangGraph branching chat + Studio time travel; all list- or chat-shaped, none show a session DAG with provenance. ← the gap cloomcloop fills.

## Design constraints cloomcloop adopts from this research

1. **Single writer per file set** — default branches to worktrees; warn on overlapping paths.
2. **Decompose by context boundary** — the branch intent should define what the child *doesn't* need to see.
3. **Results flow up, not sideways, by default** — parent-directed synthesis is the only merge with production evidence.
4. **Budget visibility** — forks share prompt cache but N children still multiply spend.
5. **Version-guard internals** — transcript JSONL and the registry are undocumented.
