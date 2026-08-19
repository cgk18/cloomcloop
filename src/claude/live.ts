import fs from 'node:fs/promises';
import path from 'node:path';
import { SESSIONS_DIR } from './paths.js';

/** A running Claude Code process, as registered in ~/.claude/sessions/<pid>.json. */
export interface LiveSession {
  pid: number;
  sessionId: string;
  cwd: string;
  name?: string;
  status?: 'idle' | 'busy' | string;
  kind?: string; // 'interactive' | ...
  entrypoint?: string;
  version?: string;
  startedAt?: number;
  updatedAt?: number;
  messagingSocketPath?: string;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    // EPERM means it exists but we can't signal it — still alive.
    return err?.code === 'EPERM';
  }
}

/** Read the live registry, dropping entries whose process is gone. */
export async function readLiveSessions(): Promise<LiveSession[]> {
  let names: string[];
  try {
    names = await fs.readdir(SESSIONS_DIR);
  } catch {
    return [];
  }
  const out: LiveSession[] = [];
  await Promise.all(
    names
      .filter((n) => n.endsWith('.json'))
      .map(async (n) => {
        try {
          const raw = await fs.readFile(path.join(SESSIONS_DIR, n), 'utf8');
          const j = JSON.parse(raw) as LiveSession;
          if (!j.sessionId || typeof j.pid !== 'number') return;
          if (!isAlive(j.pid)) return;
          out.push(j);
        } catch {
          /* partial write or stale file — skip */
        }
      }),
  );
  return out;
}
