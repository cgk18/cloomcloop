# cloomcloop — 2 minute manual

## Start

```sh
cd ~/GitHub/your-repo     # any repo
cloomcloop                # sidebar = this repo's sessions · right pane = chat
```

(`cloomcloop --all` for every project, `cloomcloop --list` for plain text.)

## The screen

```
 sidebar: your sessions          │  chat: a real claude
 ● busy  ● idle  ○ dormant  ▶ open here
```

## The 20-second workflow

1. **Open a chat.** Click a session (double-click opens it), or press `ctrl-n` for a brand-new one. Dormant sessions resume with their full history — opening one IS `claude --resume`.
2. **Talk to claude normally.** When the chat is focused, every key goes to claude. It *is* Claude Code.
3. **Branch when a side-quest appears.** `ctrl-]` (or click the sidebar), select the parent, press `ctrl-b` → give it a name + one-line intent (+ optional worktree) → enter. A fork opens in the pane carrying the *entire parent conversation* plus your intent. No handoff files.
4. **Hop between agents.** Click nodes / double-click to open their chats. `▶` marks the one in the pane. Branch again from anywhere — parents can have any number of children.

## How memory works across branches

- **Forks copy the conversation** — after that, every session's context is independent. A child compacting (or `/rewind`ing) never affects its parent or siblings. Parent compaction after a fork doesn't touch the children either; fork *before* compacting if you want children to inherit the full history.
- **What is shared**: the repo's auto-memory directory (all sessions, loaded at session start), CLAUDE.md + the code itself (via git — worktree children merge back), and `SendMessage` for live text between running sessions. Nothing else bleeds between branches.

## Answers to the questions you'll have

- **"Can I use a resumed session as a parent?"** Yes — any session in the tree can be branched, live or dormant, opened or not. `b` forks from its saved transcript directly; you don't need to open it first. A session you resumed in a plain terminal (`claude --resume`) shows in the tree too, and `b` works on it (the fork copies the transcript as it is on disk at that moment).
- **"Session is running in another terminal?"** You can't *embed* its chat (that terminal owns it) — but you can still **branch from it**, and you can open it here after you close it there.
- **"Where did my branch's name go?"** Sidebar bottom shows the selected session's id, cwd, `⑂ from <parent> @ turn N`, and last prompt.
- **"How do I quit?"** `ctrl-q` in the sidebar (twice if chats are open). Embedded claudes end but every session stays resumable — reopen cloomcloop and double-click.

## Keys

| Sidebar — navigate (plain) | Sidebar — act (ctrl+key) | Chat |
|---|---|---|
| `↑↓` `jk` wheel — move | `ctrl-b` — branch selected | everything → claude |
| `enter` / dbl-click — open in pane | `ctrl-n` — new session here | `ctrl-]` / click sidebar — back |
| `u` / `d` — scroll the open chat | `ctrl-x` — close pane (twice) | wheel / `fn+↑↓` — scrollback |
| `?` — help | `ctrl-v` tree/metro · `ctrl-a` all projects | `ctrl-\` — collapse sidebar |
| | `ctrl-r` refresh · `ctrl-q` quit (twice if chats open) | |

Actions need **ctrl** so typing into the wrong pane can never branch or quit by accident; destructive ones ask for a second press. Error messages stay on screen until your next keypress.

Mouse: click select · double-click open · click pane to focus · wheel scroll. Hold **Option** to select/copy text.

**Collapse the sidebar**: `ctrl-\` from anywhere — or **click the divider line** between the panes — shrinks it to a thin status strip and gives the chat the full width (claude reflows). Toggle back the same way (divider or strip click, or `ctrl-\`). The strip still shows one status dot per session (`▶` = your open pane).

**Scrolling the chat**: claude runs full-screen and scrolls its own transcript; cloomcloop hands it your wheel — real wheel events in iTerm2/Kitty/WezTerm, and in Terminal.app (no wheel reporting) the wheel arrives as arrow-key bursts that cloomcloop converts into proper wheel events for claude. `PageUp`/`PageDown` (`fn+↑`/`fn+↓`) and, from the sidebar, `u`/`d` scroll too. Single arrow presses still reach claude's input history untouched.
