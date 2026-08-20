import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import fs from 'node:fs';
import { readLiveSessions } from '../claude/live.js';
import { indexTranscripts, locateForkPoint } from '../claude/transcripts.js';
import { readBranches, addBranch } from '../claude/branches.js';
import { buildGraph, flattenTree, type SessionNode, type TreeRow } from '../graph.js';
import { PtyManager } from '../pty.js';
import { TerminalPane } from './TerminalPane.js';
import { ACCENT, BranchForm, buildDisplay, HelpPane, SelectionInfo, TreeList, type ViewMode } from './Sidebar.js';

/** Append to $CLOOM_DEBUG if set — for driving the TUI under test harnesses. */
const debugLog = (m: string) => {
  if (process.env.CLOOM_DEBUG) fs.appendFileSync(process.env.CLOOM_DEBUG, `${m}\n`);
};

export interface AppProps {
  scopeDir: string;
  /** directory new sessions start in (the cwd cloomcloop was launched from) */
  startDir: string;
  scopeLabel: string;
  showAll: boolean;
}

type Focus = 'sidebar' | 'terminal';
type Overlay = 'none' | 'branch' | 'help';
const FOCUS_KEY = '\x1d'; // ctrl-]
const COLLAPSE_KEY = '\x1c'; // ctrl-\

export function App({ scopeDir, startDir, scopeLabel, showAll: initialShowAll }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [size, setSize] = useState({ cols: stdout.columns || 100, rows: stdout.rows || 30 });
  const [rows, setRows] = useState<TreeRow[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  const [selected, setSelected] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [showAll, setShowAll] = useState(initialShowAll);
  const [view, setView] = useState<ViewMode>('metro');
  const [focus, setFocus] = useState<Focus>('sidebar');
  const [collapsed, setCollapsed] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [toast, setToast] = useState<{ text: string; kind: 'info' | 'error' } | null>(null);
  const [activePane, setActivePane] = useState<string | undefined>();
  const [frame, setFrame] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [forkPoints, setForkPoints] = useState<Record<string, string>>({});
  const forkLookups = useRef(new Set<string>());

  // Branch form
  const [formName, setFormName] = useState('');
  const [formIntent, setFormIntent] = useState('');
  const [formWorktree, setFormWorktree] = useState(false);
  const [formField, setFormField] = useState<'name' | 'intent' | 'worktree'>('name');

  const ptyRef = useRef<PtyManager | null>(null);
  if (!ptyRef.current) ptyRef.current = new PtyManager();
  const ptys = ptyRef.current;

  const focusRef = useRef(focus);
  focusRef.current = focus;
  const activeRef = useRef(activePane);
  activeRef.current = activePane;
  const stateRef = useRef({ rows, scrollTop, view, sidebarW: 0, overlay, selected, collapsed, display: { lines: [] as ReturnType<typeof buildDisplay>['lines'], lineOfRow: [] as number[] } });


  // ---- layout ----
  const STRIP_W = 2;
  const sidebarW = collapsed ? STRIP_W : Math.max(30, Math.min(42, Math.floor(size.cols * 0.28)));
  const termW = size.cols - sidebarW - 1;
  const termH = size.rows - 1; // footer
  const listHeight = Math.max(3, termH - 4 - (overlay === 'branch' ? 8 : 0));
  const display = buildDisplay(rows, view);
  stateRef.current = { rows, scrollTop, view, sidebarW, overlay, selected, collapsed, display };

  const toggleCollapsed = (focusSidebarOnExpand = false) => {
    setCollapsed((c) => {
      const next = !c;
      // Collapsing hides the sidebar: if it had focus, hand focus to the chat.
      if (next && focusRef.current === 'sidebar' && activeRef.current) setFocus('terminal');
      // Expanding keeps focus where it was (VS Code-style), unless asked.
      if (!next && focusSidebarOnExpand) setFocus('sidebar');
      return next;
    });
  };
  const toggleCollapsedRef = useRef<(f?: boolean) => void>(toggleCollapsed);
  toggleCollapsedRef.current = toggleCollapsed;

  useEffect(() => {
    ptys.setSize(Math.max(20, termW), Math.max(5, termH));
  }, [ptys, termW, termH]);

  useEffect(() => {
    const onResize = () => setSize({ cols: stdout.columns || 100, rows: stdout.rows || 30 });
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  // ---- data refresh ----
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
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // ---- pty events: leading-edge render, then trailing throttle for bursts ----
  useEffect(() => {
    let pending = false;
    let last = 0;
    const onData = (id: string) => {
      if (id !== activeRef.current || pending) return;
      const now = Date.now();
      if (now - last > 12) {
        last = now;
        setFrame((f) => f + 1); // first byte of a burst paints immediately
        return;
      }
      pending = true;
      setTimeout(() => {
        pending = false;
        last = Date.now();
        setFrame((f) => f + 1);
      }, 12);
    };
    const onExit = (id: string) => {
      if (id === activeRef.current) setFrame((f) => f + 1);
      void refreshRef.current();
    };
    ptys.on('data', onData);
    ptys.on('exit', onExit);
    return () => {
      ptys.off('data', onData);
      ptys.off('exit', onExit);
    };
  }, [ptys]);

  useEffect(() => () => ptys.disposeAll(), [ptys]);

  // ---- raw stdin routing ----
  // Mouse events (SGR: ESC [ < b ; x ; y M/m) are parsed and stripped here so they
  // never reach the pty as typed bytes; remaining bytes pass to the pty when the
  // chat is focused. Sidebar-focused keyboard input is left to Ink's useInput.
  const MOUSE_RE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])|\x1b\[M([\s\S]{3})/g;
  const lastClick = useRef({ at: 0, idx: -1 });
  const onMouse = (btn: number, x: number, y: number, kind: string) => {
    if (kind !== 'M') return; // presses and wheel only
    const st = stateRef.current;
    const inSidebar = x <= st.sidebarW;
    if (btn === 64 || btn === 65) {
      // wheel up / down
      const dir = btn === 64 ? -1 : 1;
      if (inSidebar) {
        setSelected((i) => Math.max(0, Math.min(st.rows.length - 1, i + dir)));
        setFocus('sidebar');
      } else {
        setScrollOffset((o) => {
          const s2 = activeRef.current ? ptys.get(activeRef.current) : undefined;
          if (!s2) return 0;
          const max = Math.max(0, s2.term.buffer.active.length - s2.term.rows);
          return Math.max(0, Math.min(max, o + (dir === -1 ? 3 : -3)));
        });
      }
      return;
    }
    if (btn !== 0) return; // left button only
    if (x === st.sidebarW + 1) {
      // divider column: toggle collapse either way
      toggleCollapsedRef.current(false);
      return;
    }
    if (!inSidebar) {
      if (activeRef.current) setFocus('terminal');
      return;
    }
    if (st.collapsed) {
      toggleCollapsedRef.current(true); // click on strip: expand and focus the tree
      return;
    }
    setFocus('sidebar');
    if (st.overlay !== 'none') return;
    const line = st.display.lines[st.scrollTop + (y - 2)]; // row 1 = header
    if (y < 2 || !line || line.kind === 'gap') return;
    const idx = line.idx;
    if (idx < 0 || idx >= st.rows.length) return;
    const now = Date.now();
    const dbl = now - lastClick.current.at < 450 && lastClick.current.idx === idx;
    lastClick.current = { at: now, idx };
    setSelected(idx);
    if (dbl) {
      const node = st.rows[idx]?.node;
      if (node) openPaneRef.current(node);
    }
  };
  const onMouseRef = useRef(onMouse);
  onMouseRef.current = onMouse;

  useEffect(() => {
    const onData = (data: Buffer | string) => {
      const raw = typeof data === 'string' ? data : data.toString('utf8');
      let str = '';
      let last = 0;
      for (const m of raw.matchAll(MOUSE_RE)) {
        str += raw.slice(last, m.index);
        last = (m.index ?? 0) + m[0].length;
        if (m[5] !== undefined) {
          // legacy X10: 3 bytes, each value+32; release is btn 3 (ignored)
          const btn = m[5].charCodeAt(0) - 32;
          const x = m[5].charCodeAt(1) - 32;
          const y = m[5].charCodeAt(2) - 32;
          if (btn !== 3) onMouseRef.current(btn, x, y, 'M');
        } else {
          onMouseRef.current(Number(m[1]), Number(m[2]), Number(m[3]), m[4]);
        }
      }
      str += raw.slice(last);
      if (focusRef.current !== 'terminal' || str === '') return;
      const cIdx = str.indexOf(COLLAPSE_KEY);
      if (cIdx !== -1) {
        const rest = str.slice(0, cIdx) + str.slice(cIdx + 1);
        if (rest && activeRef.current) ptys.write(activeRef.current, rest);
        toggleCollapsedRef.current();
        return;
      }
      // PageUp/PageDown scroll the pane's history (wheel-independent fallback).
      const PAGE_RE = /\x1b\[([56])~/g;
      let paged = false;
      str = str.replace(PAGE_RE, (_m, which) => {
        paged = true;
        setScrollOffset((o) => {
          const s2 = activeRef.current ? ptys.get(activeRef.current) : undefined;
          if (!s2) return 0;
          const page = Math.max(1, Math.floor(s2.term.rows / 2));
          const max = Math.max(0, s2.term.buffer.active.length - s2.term.rows);
          return Math.max(0, Math.min(max, o + (which === '5' ? page : -page)));
        });
        return '';
      });
      if (str === '') return;
      if (!paged) setScrollOffset(0); // typing snaps back to the live tail
      const idx = str.indexOf(FOCUS_KEY);
      if (idx !== -1) {
        const rest = str.slice(0, idx) + str.slice(idx + 1);
        if (rest && activeRef.current) ptys.write(activeRef.current, rest);
        setFocus('sidebar');
        return;
      }
      if (activeRef.current) ptys.write(activeRef.current, str);
    };
    process.stdin.on('data', onData);
    return () => {
      process.stdin.off('data', onData);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptys]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 2500);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (selected >= rows.length) setSelected(Math.max(0, rows.length - 1));
  }, [rows, selected]);

  useEffect(() => {
    const line = display.lineOfRow[selected] ?? 0;
    if (line < scrollTop) setScrollTop(line);
    else if (line >= scrollTop + listHeight) setScrollTop(line - listHeight + 1);
    else if (scrollTop > Math.max(0, display.lines.length - 1)) setScrollTop(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, scrollTop, listHeight, view, rows.length]);

  const current = rows[selected]?.node;

  // fork-point lookup for selection
  useEffect(() => {
    const n = current;
    if (!n?.parentId || !n.forkMessageUuid || forkPoints[n.id] || forkLookups.current.has(n.id)) return;
    const parentMeta = rows.find((r) => r.node.id === n.parentId)?.node.meta;
    if (!parentMeta?.file) return;
    forkLookups.current.add(n.id);
    void locateForkPoint(parentMeta.file, n.forkMessageUuid).then((fp) => {
      if (fp) setForkPoints((m) => ({ ...m, [n.id]: `turn ${fp.turn}` }));
    });
  }, [current, rows, forkPoints]);

  // Adopt real session ids once a spawned pane registers itself
  useEffect(() => {
    const placeholders = ptys.ids().filter((id) => id.startsWith('branch-') || id.startsWith('new-'));
    if (placeholders.length === 0) return;
    void readLiveSessions().then((live) => {
      for (const id of placeholders) {
        const s = ptys.get(id);
        if (!s || s.exited) continue;
        const hit = live.find((l) => l.pid === s.pty.pid);
        if (hit) {
          ptys.rekey(id, hit.sessionId);
          if (activeRef.current === id) setActivePane(hit.sessionId);
        }
      }
    });
  }, [ptys, rows]);

  // ---- actions ----
  const openPaneRef = useRef<(node: SessionNode) => void>(() => {});
  const openPane = (node: SessionNode) => {
    const existing = ptys.get(node.id);
    if (existing && !existing.exited) {
      setActivePane(node.id);
      setScrollOffset(0);
      setFocus('terminal');
      return;
    }
    if (existing) ptys.close(node.id); // dead pane: drop it and respawn fresh
    if (node.status !== 'dormant') {
      setToast({ text: `“${node.label}” is running in another terminal (pid ${node.live?.pid})`, kind: 'error' });
      return;
    }
    try {
      ptys.open(node.id, ['--resume', node.id], node.cwd ?? scopeDir, node.label);
    } catch (err: any) {
      setToast({ text: `couldn't start claude: ${err?.message ?? err}`, kind: 'error' });
      return;
    }
    setActivePane(node.id);
    setScrollOffset(0);
    setFocus('terminal');
  };
  openPaneRef.current = openPane;

  const newRoot = () => {
    const id = `new-${Date.now().toString(36)}`;
    ptys.open(id, [], startDir, 'new session');
    setActivePane(id);
    setFocus('terminal');
  };

  const submitBranch = async () => {
    if (!current) return;
    const name = formName.trim();
    if (!name) {
      setToast({ text: 'branch needs a name', kind: 'error' });
      return;
    }
    const intent = formIntent.trim();
    const note = [
      `You are the branch "${name}", forked from "${current.label}" (${current.id}).`,
      `You inherited that session's conversation up to the fork point.`,
      intent ? `Your assignment: ${intent}` : `Wait for instructions for this branch.`,
      `When done, finish with a short hand-back note: decisions, files touched, open questions.`,
    ].join(' ');
    const args = ['--resume', current.id, '--fork-session', '--name', name];
    if (formWorktree) args.push('--worktree', name);
    args.push('--append-system-prompt', note);
    if (intent) args.push(intent);
    const paneId = `branch-${Date.now().toString(36)}`;
    ptys.open(paneId, args, current.cwd ?? scopeDir, name);
    await addBranch({ name, parentSessionId: current.id, intent: intent || undefined, worktree: formWorktree, createdAt: Date.now() });
    setOverlay('none');
    setActivePane(paneId);
    setFocus('terminal');
    setToast({ text: `⑂ “${name}” branched from “${current.label}”`, kind: 'info' });
  };

  // ---- input (sidebar focus; terminal focus handled by the raw listener) ----
  useInput((rawInput, key) => {
    if (focus === 'terminal') return;
    if (rawInput.includes('\x1b[<') || rawInput.includes('[<')) return; // mouse reports
    const splittable = overlay === 'none' && rawInput.length > 1 && !rawInput.includes('\x1b');
    const inputs = splittable ? [...rawInput] : [rawInput];
    for (const input of inputs) handleKey(input, key);
  });

  const handleKey = (input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) => {
    if (input === COLLAPSE_KEY || (key.ctrl && input === '\\')) {
      toggleCollapsed();
      return;
    }
    if (input === FOCUS_KEY || (key.ctrl && input === ']')) {
      if (collapsed) {
        setCollapsed(false);
        setFocus('sidebar');
        return;
      }
      if (activePane) setFocus('terminal');
      return;
    }
    if (overlay === 'help') {
      if (key.escape || input === 'q' || input === '?') setOverlay('none');
      return;
    }
    if (overlay === 'branch') {
      if (key.escape) {
        setOverlay('none');
        return;
      }
      const order = ['name', 'intent', 'worktree'] as const;
      if (key.tab || key.downArrow || key.upArrow) {
        const d = key.upArrow || (key.tab && key.shift) ? -1 : 1;
        setFormField((f) => order[(order.indexOf(f) + d + order.length) % order.length]);
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
    // plain sidebar
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }
    if (key.downArrow || input === 'j') setSelected((i) => Math.min(rows.length - 1, i + 1));
    else if (key.upArrow || input === 'k') setSelected((i) => Math.max(0, i - 1));
    else if (key.pageDown) setSelected((i) => Math.min(rows.length - 1, i + 10));
    else if (key.pageUp) setSelected((i) => Math.max(0, i - 10));
    else if (input === 'g') setSelected(0);
    else if (input === 'G') setSelected(Math.max(0, rows.length - 1));
    else if (input === 'v') setView((v) => (v === 'tree' ? 'metro' : 'tree'));
    else if (input === 'a') setShowAll((v) => !v);
    else if (input === 'r') void refresh();
    else if (input === '?') setOverlay('help');
    else if (input === 'x') {
      if (activePane) {
        ptys.close(activePane);
        const next = ptys.ids().at(-1);
        setActivePane(next);
        if (!next) setFocus('sidebar');
      }
    } else if (input === 'n') newRoot();
    else if (input === 'b') {
      if (!current) return;
      setFormName('');
      setFormIntent('');
      setFormWorktree(false);
      setFormField('name');
      setOverlay('branch');
    } else if (key.return && current) openPane(current);
  };

  const active = activePane ? ptys.get(activePane) : undefined;
  void frame; // frame bumps re-render the terminal pane on pty output

  return (
    <Box flexDirection="column" width={size.cols} height={size.rows}>
      <Box flexGrow={1} flexDirection="row">
        {/* sidebar (or collapsed strip) */}
        {collapsed ? (
          <Box flexDirection="column" width={sidebarW} height={termH}>
            <Text color={ACCENT}>‹</Text>
            {rows.slice(0, termH - 2).map((r) => {
              const n = r.node;
              const open = n.id === activePane;
              const color = open ? ACCENT : n.status === 'busy' ? 'yellow' : n.status === 'idle' ? 'green' : 'gray';
              return (
                <Text key={n.id} color={color}>{open ? '▶' : n.status === 'dormant' ? '○' : '●'}</Text>
              );
            })}
          </Box>
        ) : (
        <Box flexDirection="column" width={sidebarW} height={termH}>
          <Box paddingX={1} justifyContent="space-between">
            <Text bold color={focus === 'sidebar' ? ACCENT : 'gray'}>cloomcloop</Text>
            <Text dimColor>
              {showAll ? 'all' : scopeLabel} · {view}
            </Text>
          </Box>
          {overlay === 'help' ? (
            <HelpPane />
          ) : (
            <>
              <Box flexGrow={1} flexDirection="column" overflow="hidden">
                <TreeList rows={rows} selected={selected} scrollTop={scrollTop} height={listHeight} width={sidebarW} attachedId={activePane} view={view} />
              </Box>
              {overlay === 'branch' && current ? (
                <BranchForm parent={current} name={formName} intent={formIntent} worktree={formWorktree} field={formField} onName={setFormName} onIntent={setFormIntent} />
              ) : (
                <SelectionInfo node={current} forkPoint={current ? forkPoints[current.id] : undefined} width={sidebarW} />
              )}
            </>
          )}
        </Box>
        )}
        {/* divider */}
        <Box width={1} flexDirection="column">
          {Array.from({ length: termH }, (_, i) => (
            <Text key={i} dimColor>│</Text>
          ))}
        </Box>
        {/* terminal */}
        <TerminalPane session={active} focused={focus === 'terminal'} width={termW} height={termH} frame={frame} scrollOffset={scrollOffset} />
      </Box>
      {/* footer */}
      <Box paddingX={1} justifyContent="space-between">
        <Text dimColor wrap="truncate">
          {toast ? (
            <Text color={toast.kind === 'error' ? 'red' : ACCENT}>{toast.text}</Text>
          ) : focus === 'terminal' ? (
            <>
              chat: keys go to claude · <Text color={ACCENT}>ctrl-]</Text> sidebar · <Text color={ACCENT}>ctrl-\</Text> {collapsed ? 'expand' : 'collapse'}
            </>
          ) : overlay === 'branch' ? (
            <>enter open here · tab fields · esc cancel</>
          ) : (
            <>enter open · b branch · n new · v view · x close · a all · ? help · q quit</>
          )}
        </Text>
        <Text dimColor wrap="truncate">
          {liveCount} live · {rows.length} shown
          {active ? (
            <>
              {' '}· pane: <Text color={ACCENT}>{active.title}</Text>
            </>
          ) : null}
        </Text>
      </Box>
    </Box>
  );
}
