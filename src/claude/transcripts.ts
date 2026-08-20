import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { PROJECTS_DIR, CLOOM_CACHE, CLOOM_DIR } from './paths.js';

/**
 * Metadata about one Claude Code session transcript
 * (~/.claude/projects/<project>/<sessionId>.jsonl).
 *
 * The JSONL format is internal to Claude Code and may change; everything here
 * is read defensively and treated as best-effort.
 */
export interface TranscriptMeta {
  sessionId: string;
  file: string;
  project: string; // project dir name
  cwd?: string;
  gitBranch?: string;
  version?: string;
  /** Present when this session was created by /branch, /fork, or --fork-session. */
  forkedFrom?: { sessionId: string; messageUuid: string };
  firstPrompt?: string;
  lastPrompt?: string;
  aiTitle?: string;
  customTitle?: string; // set via /rename
  firstTimestamp?: number;
  lastTimestamp?: number;
  mtimeMs: number;
  size: number;
}

interface CacheEntry {
  size: number;
  mtimeMs: number;
  meta: TranscriptMeta;
}
type Cache = Record<string, CacheEntry>;

const HEAD_BYTES = 256 * 1024;
const TAIL_BYTES = 96 * 1024;

async function readChunk(file: string, start: number, length: number): Promise<string> {
  const fh = await fs.open(file, 'r');
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, start);
    return buf.subarray(0, bytesRead).toString('utf8');
  } finally {
    await fh.close();
  }
}

function promptText(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const t = content.find((b) => b && typeof b === 'object' && (b as any).type === 'text') as any;
    if (t?.text) return String(t.text);
  }
  return undefined;
}

function isHumanPrompt(rec: any): boolean {
  if (rec?.type !== 'user' || rec.isMeta) return false;
  const text = promptText(rec.message?.content);
  if (!text) return false;
  const trimmed = text.trimStart();
  // Skip slash-command echoes, caveats, system-injected wrappers.
  if (trimmed.startsWith('<')) return false;
  return true;
}

function applyRecord(meta: TranscriptMeta, rec: any, fromTail: boolean): void {
  if (!rec || typeof rec !== 'object') return;
  if (!meta.cwd && typeof rec.cwd === 'string') meta.cwd = rec.cwd;
  if (!meta.gitBranch && typeof rec.gitBranch === 'string') meta.gitBranch = rec.gitBranch;
  if (!meta.version && typeof rec.version === 'string') meta.version = rec.version;
  if (!meta.forkedFrom && rec.forkedFrom?.sessionId) {
    meta.forkedFrom = { sessionId: String(rec.forkedFrom.sessionId), messageUuid: String(rec.forkedFrom.messageUuid ?? '') };
  }
  if (rec.type === 'ai-title' && rec.aiTitle) meta.aiTitle = String(rec.aiTitle);
  if (rec.type === 'custom-title' && rec.customTitle) meta.customTitle = String(rec.customTitle);
  if (rec.type === 'last-prompt' && rec.lastPrompt) meta.lastPrompt = String(rec.lastPrompt);
  if (!fromTail && !meta.firstPrompt && isHumanPrompt(rec)) {
    meta.firstPrompt = promptText(rec.message.content);
  }
  if (typeof rec.timestamp === 'string') {
    const t = Date.parse(rec.timestamp);
    if (!Number.isNaN(t)) {
      if (meta.firstTimestamp === undefined || t < meta.firstTimestamp) meta.firstTimestamp = t;
      if (meta.lastTimestamp === undefined || t > meta.lastTimestamp) meta.lastTimestamp = t;
    }
  }
}

function parseLines(text: string, dropFirst: boolean, dropLast: boolean): any[] {
  const lines = text.split('\n');
  if (dropFirst) lines.shift();
  if (dropLast) lines.pop();
  const out: any[] = [];
  for (const l of lines) {
    if (!l) continue;
    try {
      out.push(JSON.parse(l));
    } catch {
      /* truncated or malformed line */
    }
  }
  return out;
}

async function readMeta(file: string, project: string, st: { size: number; mtimeMs: number }): Promise<TranscriptMeta> {
  const meta: TranscriptMeta = {
    sessionId: path.basename(file, '.jsonl'),
    file,
    project,
    mtimeMs: st.mtimeMs,
    size: st.size,
  };
  const headLen = Math.min(HEAD_BYTES, st.size);
  const head = await readChunk(file, 0, headLen);
  const headComplete = headLen === st.size;
  for (const rec of parseLines(head, false, !headComplete)) applyRecord(meta, rec, false);

  if (!headComplete) {
    const tailStart = Math.max(headLen, st.size - TAIL_BYTES);
    const tail = await readChunk(file, tailStart, st.size - tailStart);
    for (const rec of parseLines(tail, true, false)) applyRecord(meta, rec, true);
  }
  return meta;
}

async function loadCache(): Promise<Cache> {
  try {
    return JSON.parse(await fs.readFile(CLOOM_CACHE, 'utf8')) as Cache;
  } catch {
    return {};
  }
}

async function saveCache(cache: Cache): Promise<void> {
  try {
    await fs.mkdir(CLOOM_DIR, { recursive: true });
    await fs.writeFile(CLOOM_CACHE, JSON.stringify(cache));
  } catch {
    /* cache is best-effort */
  }
}

/** Index every top-level transcript across all projects. Cached by (size, mtime). */
export async function indexTranscripts(): Promise<TranscriptMeta[]> {
  const cache = await loadCache();
  const next: Cache = {};
  const out: TranscriptMeta[] = [];
  let projects: string[] = [];
  try {
    projects = await fs.readdir(PROJECTS_DIR);
  } catch {
    return [];
  }
  await Promise.all(
    projects.map(async (project) => {
      const dir = path.join(PROJECTS_DIR, project);
      let names: string[];
      try {
        names = await fs.readdir(dir);
      } catch {
        return;
      }
      await Promise.all(
        names
          .filter((n) => n.endsWith('.jsonl'))
          .map(async (n) => {
            const file = path.join(dir, n);
            try {
              const st = await fs.stat(file);
              if (!st.isFile()) return;
              const hit = cache[file];
              if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) {
                next[file] = hit;
                out.push(hit.meta);
                return;
              }
              const meta = await readMeta(file, project, { size: st.size, mtimeMs: st.mtimeMs });
              next[file] = { size: st.size, mtimeMs: st.mtimeMs, meta };
              out.push(meta);
            } catch {
              /* unreadable transcript */
            }
          }),
      );
    }),
  );
  await saveCache(next);
  return out;
}

/** A rendered dialogue turn for scrollback preload. */
export interface DialogueTurn {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * Read the last human/assistant turns of a transcript (for scrollback preload).
 * Reads at most tailBytes from the end; returns up to maxTurns turns.
 */
export async function readDialogueTail(file: string, maxTurns = 30, tailBytes = 768 * 1024): Promise<DialogueTurn[]> {
  let st;
  try {
    st = await fs.stat(file);
  } catch {
    return [];
  }
  const start = Math.max(0, st.size - tailBytes);
  const chunk = await readChunk(file, start, st.size - start);
  const turns: DialogueTurn[] = [];
  for (const rec of parseLines(chunk, start > 0, false)) {
    if (rec?.type === 'user' && !rec.isMeta && isHumanPrompt(rec)) {
      const t = promptText(rec.message?.content);
      if (t) turns.push({ role: 'user', text: t });
    } else if (rec?.type === 'assistant') {
      const content = rec.message?.content;
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b?.type === 'text' && typeof b.text === 'string' && b.text.trim()) turns.push({ role: 'assistant', text: b.text });
        }
      }
    }
  }
  return turns.slice(-maxTurns);
}

/**
 * Find how far into the parent a fork happened: returns the 1-based index of the
 * human prompt at/just before `messageUuid`, and the total human prompts seen.
 * Streams the file; stops early once the uuid is found.
 */
export async function locateForkPoint(
  parentFile: string,
  messageUuid: string,
): Promise<{ turn: number; preview?: string } | undefined> {
  const rl = readline.createInterface({ input: createReadStream(parentFile, { encoding: 'utf8' }), crlfDelay: Infinity });
  let turn = 0;
  let preview: string | undefined;
  try {
    for await (const line of rl) {
      if (!line) continue;
      let rec: any;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      if (isHumanPrompt(rec)) {
        turn += 1;
        preview = promptText(rec.message.content);
      }
      if (rec.uuid === messageUuid) return { turn, preview };
    }
  } finally {
    rl.close();
  }
  return undefined;
}
