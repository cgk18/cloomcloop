import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import path from 'node:path';
import fs from 'node:fs';

/** Append to $CLOOM_DEBUG if set — for driving the TUI under test harnesses. */
const debugLog = (m: string) => {
  if (process.env.CLOOM_DEBUG) fs.appendFileSync(process.env.CLOOM_DEBUG, `${m}\n`);
};
import { readLiveSessions } from '../claude/live.js';
import { indexTranscripts, locateForkPoint } from '../claude/transcripts.js';
import { readBranches } from '../claude/branches.js';
import { buildGraph, flattenTree, type SessionNode, type TreeRow } from '../graph.js';
import { branchSession, resumeSession, newSession } from '../actions/claude.js';
import { detectLauncher } from '../actions/terminal.js';
import { shortId } from '../claude/paths.js';
import { formatAge, oneLine, shortenHome, truncate } from './format.js';

export interface AppProps {
  scopeDir: string;
  scopeLabel: string;
  showAll: boolean;
}

type Mode = 'tree' | 'branch' | 'help';

const STATUS_GLYPH: Record<SessionNode['status'], { glyph: string; color: string; word: string }> = {
  busy: { glyph: '●', color: 'yellow', word: 'busy' },
  idle: { glyph: '●', color: 'green', word: 'live' },
  dormant: { glyph: '○', color: 'gray', word: 'dormant' },
};

const ACCENT = '#3FB6C0';

export function App({ scopeDir, scopeLabel, showAll: initialShowAll }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [size, setSize] = useState({ cols: stdout.columns || 100, rows: stdout.rows || 30 });
  const [rows, setRows] = useState<TreeRow[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<Mode>('tree');
  const [showAll, setShowAll] = useState(initialShowAll);
  const [toast, setToast] = useState<{ text: string; kind: 'info' | 'error' } | null>(null);
  const [forkPoints, setForkPoints] = useState<Record<string, string>>({});
  const forkLookups = useRef(new Set<string>());
  const [tick, setTick] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  // Branch form state
  const [formName, setFormName] = useState('');
  const [formIntent, setFormIntent] = useState('');
  const [formWorktree, setFormWorktree] = useState(false);
  const [formField, setFormField] = useState<'name' | 'intent' | 'worktree'>('name');

  useEffect(() => {
    const onResize = () => setSize({ cols: stdout.columns || 100, rows: stdout.rows || 30 });
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  const refresh = useCallback(async () => {
    try {
      const [live, transcripts, branches] = await Promise.all([readLiveSessions(), indexTranscripts(), readBranches()]);
      const graph = buildGraph(live, transcripts, branches, { scopeDir: showAll ? undefined : scopeDir });
      setLiveCount(live.length);
      setRows(flattenTree(graph.roots));
    } catch (err: any) {
      debugLog(`refresh failed: ${err?.stack ?? err}`);
      setToast({ text: `refresh failed: ${err?.message ?? err}`, kind: 'error' });
    }
  }, [scopeDir, showAll]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 2000);
    const clock = setInterval(() => setTick((n) => n + 1), 10000);
    return () => {
      clearInterval(t);
      clearInterval(clock);
    };
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (selected >= rows.length) setSelected(Math.max(0, rows.length - 1));
  }, [rows, selected]);

  const current = rows[selected]?.node;

  // Lazily resolve "forked at turn N" for the selected node.
  useEffect(() => {
    const n = current;
    if (!n?.parentId || !n.forkMessageUuid || forkPoints[n.id] || forkLookups.current.has(n.id)) return;
    const parent = rows.find((r) => r.node.id === n.parentId)?.node;
    if (!parent?.meta?.file) return;
    forkLookups.current.add(n.id);
    void locateForkPoint(parent.meta.file, n.forkMessageUuid).then((fp) => {
      if (fp) setForkPoints((m) => ({ ...m, [n.id]: `turn ${fp.turn}${fp.preview ? ` — “${oneLine(fp.preview, 60)}”` : ''}` }));
    });
  }, [current, rows, forkPoints]);

  const listHeight = Math.max(3, size.rows - 4); // header + footer + toast
  useEffect(() => {
    if (selected < scrollTop) setScrollTop(selected);
    else if (selected >= scrollTop + listHeight) setScrollTop(selected - listHeight + 1);
  }, [selected, scrollTop, listHeight]);

  const openBranchForm = () => {
    if (!current) return;
    setFormName('');
    setFormIntent('');
    setFormWorktree(false);
    setFormField('name');
    setMode('branch');
  };

  const submitBranch = async () => {
    if (!current) return;
    const name = formName.trim();
    if (!name) {
      setToast({ text: 'branch needs a name', kind: 'error' });
      return;
    }
    const cwd = current.cwd ?? scopeDir;
    try {
      const where = await branchSession({
        parentSessionId: current.id,
        parentLabel: current.label,
        cwd,
        name,
        intent: formIntent.trim() || undefined,
        worktree: formWorktree,
      });
      setToast({ text: `branched “${name}” from “${current.label}” → ${where}`, kind: 'info' });
      setMode('tree');
    } catch (err: any) {
      setToast({ text: String(err?.message ?? err), kind: 'error' });
    }
  };

  useInput((rawInput, key) => {
    // Coalesced keystrokes arrive as one string (e.g. "jj"); replay them one at a time,
    // except in text-entry mode where TextInput owns the characters.
    const inputs = mode === 'tree' && rawInput.length > 1 ? [...rawInput] : [rawInput];
    for (const input of inputs) handleKey(input, key);
  });

  const handleKey = (input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) => {
    if (mode === 'help') {
      if (key.escape || input === 'q' || input === '?') setMode('tree');
      return;
    }
    if (mode === 'branch') {
      if (key.escape) {
        setMode('tree');
        return;
      }
      const order = ['name', 'intent', 'worktree'] as const;
      if (key.tab || key.downArrow || key.upArrow) {
        const delta = key.upArrow || (key.tab && key.shift) ? -1 : 1;
        setFormField((f) => order[(order.indexOf(f) + delta + order.length) % order.length]);
        return;
      }
      if (formField === 'worktree' && input === ' ') {
        setFormWorktree((w) => !w);
        return;
      }
      if (key.return) {
        if (formField === 'name' && formName.trim()) setFormField('intent');
        else void submitBranch();
      }
      return;
    }
    // tree mode
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }
    if (key.downArrow || input === 'j') setSelected((i) => Math.min(rows.length - 1, i + 1));
    else if (key.upArrow || input === 'k') setSelected((i) => Math.max(0, i - 1));
    else if (input === 'g') setSelected(0);
    else if (input === 'G') setSelected(Math.max(0, rows.length - 1));
    else if (input === 'r') void refresh().then(() => setToast({ text: 'refreshed', kind: 'info' }));
    else if (input === 'a') {
      setShowAll((v) => !v);
      setToast({ text: showAll ? `scoped to ${scopeLabel}` : 'showing all projects', kind: 'info' });
    } else if (input === '?') setMode('help');
    else if (input === 'b') openBranchForm();
    else if (input === 'n') {
      void newSession(current?.cwd ?? scopeDir)
        .then((w) => setToast({ text: `new session → ${w}`, kind: 'info' }))
        .catch((e) => setToast({ text: String(e?.message ?? e), kind: 'error' }));
    } else if (key.return && current) {
      if (current.status !== 'dormant') {
        setToast({ text: `“${current.label}” is already running (pid ${current.live?.pid}) — switch to that window`, kind: 'info' });
      } else {
        void resumeSession(current.id, current.cwd ?? scopeDir, current.label)
          .then((w) => setToast({ text: `resumed “${current.label}” → ${w}`, kind: 'info' }))
          .catch((e) => setToast({ text: String(e?.message ?? e), kind: 'error' }));
      }
    }
  };

  const detailWidth = size.cols >= 110 ? 46 : size.cols >= 80 ? 36 : 0;
  const treeWidth = size.cols - detailWidth - (detailWidth ? 3 : 0);
  const visible = rows.slice(scrollTop, scrollTop + listHeight);

  return (
    <Box flexDirection="column" width={size.cols} height={size.rows}>
      <Header scopeLabel={showAll ? 'all projects' : scopeLabel} liveCount={liveCount} total={rows.length} cols={size.cols} />
      <Box flexGrow={1} flexDirection="row">
        <Box flexDirection="column" width={treeWidth} paddingX={1}>
          {rows.length === 0 ? (
            <Text dimColor>
              No sessions here yet. Press <Text color={ACCENT}>n</Text> to start one, or <Text color={ACCENT}>a</Text> to show every project.
            </Text>
          ) : (
            visible.map((r, i) => (
              <Row key={r.node.id} row={r} selected={scrollTop + i === selected} width={treeWidth - 2} tick={tick} />
            ))
          )}
        </Box>
        {detailWidth > 0 && (
          <Box flexDirection="column" width={detailWidth} borderStyle="single" borderColor="gray" borderTop={false} borderBottom={false} borderRight={false} paddingX={1}>
            {mode === 'branch' && current ? (
              <BranchForm
                parent={current}
                name={formName}
                intent={formIntent}
                worktree={formWorktree}
                field={formField}
                onName={setFormName}
                onIntent={setFormIntent}
              />
            ) : mode === 'help' ? (
              <Help />
            ) : (
              <Detail node={current} forkPoint={current ? forkPoints[current.id] : undefined} width={detailWidth - 3} />
            )}
          </Box>
        )}
      </Box>
      <Footer mode={mode} toast={toast} cols={size.cols} />
    </Box>
  );
}

function Header({ scopeLabel, liveCount, total, cols }: { scopeLabel: string; liveCount: number; total: number; cols: number }) {
  const right = `${liveCount} live · ${total} sessions`;
  return (
    <Box paddingX={1} justifyContent="space-between" width={cols}>
      <Text>
        <Text bold color={ACCENT}>cloomcloop</Text>
        <Text dimColor> · </Text>
        <Text>{scopeLabel}</Text>
      </Text>
      <Text dimColor>{right}</Text>
    </Box>
  );
}

function Row({ row, selected, width, tick }: { row: TreeRow; selected: boolean; width: number; tick: number }) {
  void tick; // re-render ages periodically
  const { node, prefix } = row;
  const st = STATUS_GLYPH[node.status];
  const age = formatAge(node.lastActive);
  const id = shortId(node.id);
  const tail = `${id}  ${age.padStart(3)}`;
  const labelRoom = Math.max(6, width - prefix.length - 2 - tail.length - 2);
  const label = truncate(node.label, labelRoom);
  const pad = Math.max(1, width - prefix.length - 2 - label.length - tail.length);
  return (
    <Text inverse={selected} wrap="truncate">
      <Text dimColor>{prefix}</Text>
      <Text color={st.color}>{st.glyph}</Text>
      <Text> {label}</Text>
      <Text>{' '.repeat(pad)}</Text>
      <Text dimColor>{tail}</Text>
    </Text>
  );
}

function Field({ k, v, color }: { k: string; v?: string; color?: string }) {
  if (!v) return null;
  return (
    <Box flexDirection="row">
      <Box width={10}>
        <Text dimColor>{k}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text color={color} wrap="wrap">
          {v}
        </Text>
      </Box>
    </Box>
  );
}

function Detail({ node, forkPoint, width }: { node?: SessionNode; forkPoint?: string; width: number }) {
  if (!node) return <Text dimColor>select a session</Text>;
  const st = STATUS_GLYPH[node.status];
  const textWidth = Math.max(10, width - 10);
  return (
    <Box flexDirection="column">
      <Text bold wrap="wrap">
        {node.label}
      </Text>
      <Text dimColor>{node.id}</Text>
      <Box height={1} />
      <Field k="status" v={`${st.glyph} ${st.word}${node.live ? ` · pid ${node.live.pid}` : ''}`} color={st.color} />
      <Field k="cwd" v={shortenHome(node.cwd)} />
      <Field k="git" v={node.meta?.gitBranch} />
      <Field k="claude" v={node.meta?.version ?? node.live?.version} />
      <Field k="active" v={`${formatAge(node.lastActive)} ago`} />
      {node.parentId && <Field k="forked" v={`from ${shortId(node.parentId)}${forkPoint ? ` at ${forkPoint}` : ''}`} color={ACCENT} />}
      {node.branch?.intent && <Field k="intent" v={oneLine(node.branch.intent, textWidth * 3)} />}
      {node.children.length > 0 && <Field k="children" v={String(node.children.length)} />}
      <Box height={1} />
      {node.meta?.firstPrompt && (
        <Box flexDirection="column">
          <Text dimColor>first prompt</Text>
          <Text wrap="wrap">{oneLine(node.meta.firstPrompt, textWidth * 3)}</Text>
        </Box>
      )}
      {node.meta?.lastPrompt && node.meta.lastPrompt !== node.meta.firstPrompt && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>last prompt</Text>
          <Text wrap="wrap">{oneLine(node.meta.lastPrompt, textWidth * 3)}</Text>
        </Box>
      )}
      {node.meta?.forkedFrom === undefined && node.parentId === undefined && node.meta && (
        <Box marginTop={1}>
          <Text dimColor>root session</Text>
        </Box>
      )}
    </Box>
  );
}

function BranchForm(props: {
  parent: SessionNode;
  name: string;
  intent: string;
  worktree: boolean;
  field: 'name' | 'intent' | 'worktree';
  onName: (s: string) => void;
  onIntent: (s: string) => void;
}) {
  const { parent, name, intent, worktree, field, onName, onIntent } = props;
  return (
    <Box flexDirection="column">
      <Text bold color={ACCENT}>branch from “{truncate(parent.label, 30)}”</Text>
      <Text dimColor>child inherits the full conversation so far</Text>
      <Box height={1} />
      <Box>
        <Text color={field === 'name' ? ACCENT : undefined}>name   </Text>
        {field === 'name' ? <TextInput value={name} onChange={onName} placeholder="api-refactor" /> : <Text>{name || <Text dimColor>—</Text>}</Text>}
      </Box>
      <Box>
        <Text color={field === 'intent' ? ACCENT : undefined}>intent </Text>
        {field === 'intent' ? <TextInput value={intent} onChange={onIntent} placeholder="what should this branch do?" /> : <Text>{intent || <Text dimColor>(optional)</Text>}</Text>}
      </Box>
      <Box>
        <Text color={field === 'worktree' ? ACCENT : undefined}>worktr </Text>
        <Text color={worktree ? 'green' : 'gray'}>{worktree ? '[x] isolated worktree' : '[ ] isolated worktree'}</Text>
        {field === 'worktree' && <Text dimColor> space toggles</Text>}
      </Box>
      <Box height={1} />
      <Text dimColor>enter next / launch · tab cycle · esc cancel</Text>
      <Box height={1} />
      <Text dimColor wrap="wrap">
        Runs: claude --resume {shortId(parent.id)}… --fork-session --name {name || '<name>'}{worktree ? ` --worktree ${name || '<name>'}` : ''} in a new tab.
      </Text>
    </Box>
  );
}

function Help() {
  const L = (k: string, d: string) => (
    <Box key={k}>
      <Box width={9}>
        <Text color={ACCENT}>{k}</Text>
      </Box>
      <Text>{d}</Text>
    </Box>
  );
  return (
    <Box flexDirection="column">
      <Text bold>keys</Text>
      {L('↑↓ j k', 'move')}
      {L('enter', 'resume dormant session in new tab')}
      {L('b', 'branch: fork selected into a new named agent')}
      {L('n', 'new root session in this directory')}
      {L('a', 'toggle: this project ↔ all projects')}
      {L('r', 'refresh now')}
      {L('?', 'close help')}
      {L('q', 'quit')}
      <Box height={1} />
      <Text dimColor wrap="wrap">
        Launcher: {detectLauncher()}. Lineage comes from Claude Code's own forkedFrom records; branches you make here also record their intent in ~/.cloomcloop.
      </Text>
    </Box>
  );
}

function Footer({ mode, toast, cols }: { mode: Mode; toast: { text: string; kind: 'info' | 'error' } | null; cols: number }) {
  const keys =
    mode === 'branch'
      ? 'enter launch · tab cycle fields · esc cancel'
      : mode === 'help'
        ? 'esc close'
        : '↑↓ move · enter resume · b branch · n new · a all · ? help · q quit';
  return (
    <Box flexDirection="column" width={cols}>
      <Box paddingX={1} height={1}>
        {toast ? <Text color={toast.kind === 'error' ? 'red' : ACCENT} wrap="truncate">{toast.text}</Text> : <Text> </Text>}
      </Box>
      <Box paddingX={1}>
        <Text dimColor wrap="truncate">{keys}</Text>
      </Box>
    </Box>
  );
}
