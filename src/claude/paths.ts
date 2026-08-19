import os from 'node:os';
import path from 'node:path';

/** Root of Claude Code's on-disk state. Override with CLAUDE_CONFIG_DIR like Claude Code does. */
export const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude');
export const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
export const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');

/** cloomcloop's own state: branch intents, caches. */
export const CLOOM_DIR = process.env.CLOOMCLOOP_DIR ?? path.join(os.homedir(), '.cloomcloop');
export const CLOOM_BRANCHES = path.join(CLOOM_DIR, 'branches.json');
export const CLOOM_CACHE = path.join(CLOOM_DIR, 'transcript-cache.json');

export function shortId(id: string): string {
  return id.slice(0, 8);
}
