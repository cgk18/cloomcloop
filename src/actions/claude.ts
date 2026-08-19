import { addBranch } from '../claude/branches.js';
import { openInNewTerminal, sh } from './terminal.js';

export interface BranchRequest {
  parentSessionId: string;
  parentLabel: string;
  cwd: string;
  name: string;
  intent?: string;
  worktree: boolean;
}

function branchSystemNote(req: BranchRequest): string {
  return [
    `You are the branch "${req.name}", forked from the session "${req.parentLabel}" (${req.parentSessionId}).`,
    `You inherited that session's full conversation up to the fork point; everything after it happened only in the parent.`,
    req.intent ? `Your assignment: ${req.intent}` : `Wait for the user's instructions for this branch.`,
    `Stay within this assignment. When you finish, end with a short hand-back note: decisions made, files touched, open questions for the parent.`,
  ].join(' ');
}

/** Build the `claude` command that forks the parent into a new named session. */
export function branchCommand(req: BranchRequest): string {
  const parts = ['claude', '--resume', req.parentSessionId, '--fork-session', '--name', sh(req.name)];
  if (req.worktree) parts.push('--worktree', sh(req.name));
  parts.push('--append-system-prompt', sh(branchSystemNote(req)));
  if (req.intent) parts.push(sh(req.intent));
  return parts.join(' ');
}

export async function branchSession(req: BranchRequest): Promise<string> {
  const cmd = branchCommand(req);
  const where = await openInNewTerminal(cmd, req.cwd, req.name);
  await addBranch({
    name: req.name,
    parentSessionId: req.parentSessionId,
    intent: req.intent,
    worktree: req.worktree,
    createdAt: Date.now(),
  });
  return where;
}

/** Resume a dormant session in a new terminal surface. */
export async function resumeSession(sessionId: string, cwd: string, label: string): Promise<string> {
  return openInNewTerminal(`claude --resume ${sessionId}`, cwd, label);
}

/** Start a brand-new root session in the given directory. */
export async function newSession(cwd: string, name?: string): Promise<string> {
  const cmd = name ? `claude --name ${sh(name)}` : 'claude';
  return openInNewTerminal(cmd, cwd, name ?? 'claude');
}
