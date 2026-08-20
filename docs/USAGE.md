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

1. **Open a chat.** Click a session (double-click opens it), or press `n` for a brand-new one. Dormant sessions resume with their full history — opening one IS `claude --resume`.
2. **Talk to claude normally.** When the chat is focused, every key goes to claude. It *is* Claude Code.
3. **Branch when a side-quest appears.** `ctrl-]` (or click the sidebar), select the parent, press `b` → give it a name + one-line intent (+ optional worktree) → enter. A fork opens in the pane carrying the *entire parent conversation* plus your intent. No handoff files.
4. **Hop between agents.** Click nodes / double-click to open their chats. `▶` marks the one in the pane. Branch again from anywhere — parents can have any number of children.

## Answers to the questions you'll have

- **"Can I use a resumed session as a parent?"** Yes — any session in the tree can be branched, live or dormant, opened or not. `b` forks from its saved transcript directly; you don't need to open it first. A session you resumed in a plain terminal (`claude --resume`) shows in the tree too, and `b` works on it (the fork copies the transcript as it is on disk at that moment).
- **"Session is running in another terminal?"** You can't *embed* its chat (that terminal owns it) — but you can still **branch from it**, and you can open it here after you close it there.
- **"Where did my branch's name go?"** Sidebar bottom shows the selected session's id, cwd, `⑂ from <parent> @ turn N`, and last prompt.
- **"How do I quit?"** `q` in the sidebar. Embedded claudes end but every session stays resumable — reopen cloomcloop and double-click.

## Keys

| Sidebar | | Chat |
|---|---|---|
| `↑↓` `jk` wheel — move | | everything → claude |
| `enter` / dbl-click — open in pane | | `ctrl-]` / click sidebar — back |
| `b` — branch selected | | wheel — scrollback |
| `n` — new session here | | |
| `x` — close pane · `v` — tree/graph · `a` — all projects · `r` — refresh · `?` — help · `q` — quit | | |

Mouse: click select · double-click open · click pane to focus · wheel scroll. Hold **Option** to select/copy text.
