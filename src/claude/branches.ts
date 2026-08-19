import fs from 'node:fs/promises';
import { CLOOM_BRANCHES, CLOOM_DIR } from './paths.js';

/**
 * A branch cloomcloop asked Claude Code to create. Claude Code records the
 * actual lineage (forkedFrom) in the child's transcript; this store keeps
 * what only we know: the human intent and the name we launched it with.
 */
export interface BranchRecord {
  name: string;
  parentSessionId: string;
  intent?: string;
  worktree: boolean;
  createdAt: number;
  /** Filled in once the child session shows up in the live registry / transcripts. */
  childSessionId?: string;
}

export async function readBranches(): Promise<BranchRecord[]> {
  try {
    const j = JSON.parse(await fs.readFile(CLOOM_BRANCHES, 'utf8'));
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

export async function writeBranches(list: BranchRecord[]): Promise<void> {
  await fs.mkdir(CLOOM_DIR, { recursive: true });
  await fs.writeFile(CLOOM_BRANCHES, JSON.stringify(list, null, 2));
}

export async function addBranch(rec: BranchRecord): Promise<void> {
  const list = await readBranches();
  list.push(rec);
  await writeBranches(list);
}
