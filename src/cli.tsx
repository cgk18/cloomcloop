import React from 'react';
import { render } from 'ink';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { App } from './ui/App.js';
import { readLiveSessions } from './claude/live.js';
import { indexTranscripts } from './claude/transcripts.js';
import { readBranches } from './claude/branches.js';
import { buildGraph, flattenTree } from './graph.js';
import { shortId } from './claude/paths.js';

const argv = process.argv.slice(2);

function usage(): never {
  console.log(`cloomcloop — a live tree of your Claude Code sessions

usage: cloomcloop [options] [dir]

  dir              scope to this directory (default: git root of cwd, or cwd)
  -a, --all        show sessions from every project
  --list           print the tree once and exit (no TUI)
  -h, --help       this help

keys (in the TUI): ↑↓ move · enter resume · b branch · n new · a all · ? help · q quit`);
  process.exit(0);
}

let showAll = false;
let listOnly = false;
let dirArg: string | undefined;
for (const a of argv) {
  if (a === '-h' || a === '--help') usage();
  else if (a === '-a' || a === '--all') showAll = true;
  else if (a === '--list') listOnly = true;
  else if (!a.startsWith('-')) dirArg = a;
  else {
    console.error(`unknown option ${a}`);
    process.exit(2);
  }
}

function gitRoot(dir: string): string | undefined {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

const start = path.resolve(dirArg ?? process.cwd());
const scopeDir = gitRoot(start) ?? start; // filter scope: whole repo
const startDir = start; // where new sessions begin: the dir you launched from
const scopeLabel = path.basename(scopeDir);

if (listOnly) {
  const [live, transcripts, branches] = await Promise.all([readLiveSessions(), indexTranscripts(), readBranches()]);
  const graph = buildGraph(live, transcripts, branches, { scopeDir: showAll ? undefined : scopeDir });
  for (const r of flattenTree(graph.roots)) {
    const st = r.node.status === 'dormant' ? '○' : '●';
    console.log(`${r.prefix}${st} ${r.node.label}  ${shortId(r.node.id)}  [${r.node.status}]`);
  }
  process.exit(0);
}

if (!process.stdout.isTTY) {
  console.error('cloomcloop needs a TTY. Use --list for plain output.');
  process.exit(1);
}

// Take over the screen the way full-screen TUIs do; restore on exit.
// Also enable SGR mouse reporting (clicks + wheel; hold Option to select text).
const ALT_ON = '\x1b[?1049h\x1b[H\x1b[?1000h\x1b[?1006h';
const ALT_OFF = '\x1b[?1000l\x1b[?1006l\x1b[?1049l';
process.stdout.write(ALT_ON);
const restore = () => process.stdout.write(ALT_OFF);
process.on('exit', restore);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => process.exit(0));

const app = render(<App scopeDir={scopeDir} startDir={startDir} scopeLabel={scopeLabel} showAll={showAll} />, { exitOnCtrlC: false, maxFps: 120 });
try {
  await app.waitUntilExit();
} finally {
  restore();
}
