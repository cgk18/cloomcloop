import path from 'node:path';
import type { LiveSession } from './claude/live.js';
import type { TranscriptMeta } from './claude/transcripts.js';
import type { BranchRecord } from './claude/branches.js';
import { shortId } from './claude/paths.js';

export type NodeStatus = 'busy' | 'idle' | 'dormant';

export interface SessionNode {
  id: string;
  label: string;
  status: NodeStatus;
  live?: LiveSession;
  meta?: TranscriptMeta;
  branch?: BranchRecord;
  parentId?: string;
  /** uuid of the parent message this session forked from, if known */
  forkMessageUuid?: string;
  children: SessionNode[];
  cwd?: string;
  lastActive: number;
  started: number;
}

export interface Graph {
  nodes: Map<string, SessionNode>;
  roots: SessionNode[];
}

export interface TreeRow {
  node: SessionNode;
  depth: number;
  /** box-drawing prefix for this row, e.g. "│ └─" */
  prefix: string;
}

/** Claude Code auto-names unnamed sessions "<dir>-<2 hex>"; a title beats that. */
function isAutoName(name: string | undefined, cwd: string | undefined): boolean {
  if (!name) return true;
  const base = cwd ? path.basename(cwd) : '';
  return base !== '' && new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-[0-9a-f]{2}$`).test(name);
}

function labelFor(live?: LiveSession, meta?: TranscriptMeta, branch?: BranchRecord): string {
  const userName = live?.name && !isAutoName(live.name, live.cwd) ? live.name : undefined;
  const name =
    userName ||
    branch?.name ||
    meta?.customTitle ||
    meta?.aiTitle ||
    (meta?.firstPrompt ? meta.firstPrompt.replace(/\s+/g, ' ').slice(0, 48) : undefined) ||
    live?.name;
  return name || shortId(live?.sessionId ?? meta?.sessionId ?? '?');
}

export interface BuildOptions {
  /** Only show sessions whose cwd is inside this directory (plus their lineage). Omit for all. */
  scopeDir?: string;
  /** Hide dormant sessions older than this many ms (default 14 days). 0 = no limit. */
  maxAgeMs?: number;
}

export function buildGraph(
  live: LiveSession[],
  transcripts: TranscriptMeta[],
  branches: BranchRecord[],
  opts: BuildOptions = {},
): Graph {
  const nodes = new Map<string, SessionNode>();
  const byId = new Map<string, TranscriptMeta>();
  for (const t of transcripts) byId.set(t.sessionId, t);
  const liveById = new Map<string, LiveSession>();
  for (const l of live) liveById.set(l.sessionId, l);
  const branchByChild = new Map<string, BranchRecord>();
  const branchByName = new Map<string, BranchRecord>();
  for (const b of branches) {
    if (b.childSessionId) branchByChild.set(b.childSessionId, b);
    branchByName.set(b.name, b);
  }

  const ids = new Set<string>([...byId.keys(), ...liveById.keys()]);
  const now = Date.now();
  const maxAge = opts.maxAgeMs ?? 14 * 24 * 3600 * 1000;

  for (const id of ids) {
    const meta = byId.get(id);
    const l = liveById.get(id);
    const branch = branchByChild.get(id) ?? (l?.name ? branchByName.get(l.name) : undefined);
    const status: NodeStatus = l ? (l.status === 'busy' ? 'busy' : 'idle') : 'dormant';
    let lastActive = Math.max(l?.updatedAt ?? 0, meta?.lastTimestamp ?? 0, meta?.mtimeMs ?? 0);
    if (lastActive === 0) lastActive = l?.startedAt ?? now;
    const started = Math.min(l?.startedAt ?? Infinity, meta?.firstTimestamp ?? Infinity);
    nodes.set(id, {
      id,
      label: labelFor(l, meta, branch),
      status,
      live: l,
      meta,
      branch,
      parentId: meta?.forkedFrom?.sessionId ?? branch?.parentSessionId,
      forkMessageUuid: meta?.forkedFrom?.messageUuid,
      children: [],
      cwd: l?.cwd ?? meta?.cwd,
      lastActive,
      started: Number.isFinite(started) ? started : lastActive,
    });
  }

  // Link parents. A parent referenced but unknown (pruned transcript) makes the child a root.
  for (const n of nodes.values()) {
    if (n.parentId && nodes.has(n.parentId) && n.parentId !== n.id) {
      nodes.get(n.parentId)!.children.push(n);
    } else {
      n.parentId = undefined;
    }
  }

  // Scope filter: keep a node if it, an ancestor, or a descendant lives in scopeDir; always keep live.
  const inScope = (n: SessionNode): boolean => {
    if (!opts.scopeDir) return true;
    if (!n.cwd) return false;
    const rel = path.relative(opts.scopeDir, n.cwd);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  };
  const keep = new Set<string>();
  const markUp = (n: SessionNode) => {
    let cur: SessionNode | undefined = n;
    while (cur && !keep.has(cur.id)) {
      keep.add(cur.id);
      cur = cur.parentId ? nodes.get(cur.parentId) : undefined;
    }
  };
  const markDown = (n: SessionNode) => {
    keep.add(n.id);
    for (const c of n.children) markDown(c);
  };
  for (const n of nodes.values()) {
    const fresh = n.status !== 'dormant' || maxAge === 0 || now - n.lastActive <= maxAge;
    if (fresh && inScope(n)) {
      markUp(n);
      markDown(n);
    }
  }
  for (const id of [...nodes.keys()]) {
    if (!keep.has(id)) {
      const n = nodes.get(id)!;
      if (n.parentId) {
        const p = nodes.get(n.parentId);
        if (p) p.children = p.children.filter((c) => c.id !== id);
      }
      nodes.delete(id);
    }
  }

  const byStart = (a: SessionNode, b: SessionNode) => a.started - b.started;
  for (const n of nodes.values()) n.children.sort(byStart);
  const rank = (n: SessionNode) => (n.status === 'dormant' ? 1 : 0);
  const roots = [...nodes.values()]
    .filter((n) => !n.parentId)
    .sort((a, b) => rank(a) - rank(b) || b.lastActive - a.lastActive);
  return { nodes, roots };
}

/** Flatten to rows with box-drawing prefixes. */
export function flattenTree(roots: SessionNode[]): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (n: SessionNode, depth: number, ancestorsLast: boolean[], isLast: boolean) => {
    let prefix = '';
    for (const last of ancestorsLast) prefix += last ? '  ' : '│ ';
    if (depth > 0) prefix += isLast ? '└─' : '├─';
    rows.push({ node: n, depth, prefix });
    n.children.forEach((c, i) =>
      walk(c, depth + 1, depth > 0 ? [...ancestorsLast, isLast] : ancestorsLast, i === n.children.length - 1),
    );
  };
  roots.forEach((r) => walk(r, 0, [], true));
  return rows;
}
