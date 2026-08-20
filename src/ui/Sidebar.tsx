import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { SessionNode, TreeRow } from '../graph.js';
import { shortId } from '../claude/paths.js';
import { formatAge, oneLine, shortenHome, truncate } from './format.js';

export const ACCENT = '#3FB6C0';

export type ViewMode = 'tree' | 'metro';

/** One renderable sidebar line. `idx` points into the flattened row array. */
export interface DisplayLine {
  kind: 'node' | 'sub' | 'gap';
  idx: number;
}

/**
 * Flatten tree rows into display lines for a view.
 * metro: 1 line per node, an intent line under branches that have one,
 * and a blank separator between root subtrees.
 */
export function buildDisplay(rows: TreeRow[], view: ViewMode): { lines: DisplayLine[]; lineOfRow: number[] } {
  const lines: DisplayLine[] = [];
  const lineOfRow: number[] = [];
  rows.forEach((r, i) => {
    if (view === 'metro' && r.depth === 0 && i > 0) lines.push({ kind: 'gap', idx: i });
    lineOfRow[i] = lines.length;
    lines.push({ kind: 'node', idx: i });
    if (view === 'metro' && r.node.branch?.intent) lines.push({ kind: 'sub', idx: i });
  });
  return { lines, lineOfRow };
}

const metroRail = (prefix: string) => prefix.replace(/│/g, '┃').replace(/├─/g, '┣━').replace(/└─/g, '┗━');


const GLYPH: Record<SessionNode['status'], { g: string; color: string }> = {
  busy: { g: '●', color: 'yellow' },
  idle: { g: '●', color: 'green' },
  dormant: { g: '○', color: 'gray' },
};

function TreeListInner(props: {
  rows: TreeRow[];
  selected: number;
  scrollTop: number;
  height: number;
  width: number;
  attachedId?: string;
  view: ViewMode;
}) {
  const { rows, selected, scrollTop, height, width, attachedId, view } = props;
  if (rows.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor wrap="wrap">
          No sessions yet — press <Text color={ACCENT}>n</Text> for a new one, <Text color={ACCENT}>a</Text> for all projects.
        </Text>
      </Box>
    );
  }
  const { lines } = buildDisplay(rows, view);
  const visible = lines.slice(scrollTop, scrollTop + height);
  return (
    <Box flexDirection="column" paddingX={1}>
      {visible.map((l, i) => {
        const key = `${l.kind}-${l.idx}-${scrollTop + i}`;
        if (l.kind === 'gap') return <Text key={key}> </Text>;
        const r = rows[l.idx];
        if (!r) return <Text key={key}> </Text>;
        const n = r.node;
        const isSel = l.idx === selected;
        const attached = n.id === attachedId;
        const prefix = view === 'metro' ? metroRail(r.prefix) : r.prefix;
        if (l.kind === 'sub') {
          const cont = view === 'metro'
            ? metroRail(r.prefix.replace(/├─/g, '│ ').replace(/└─/g, '  '))
            : r.prefix;
          const railTail = n.children.length > 0 ? '┃  ' : '   ';
          return (
            <Text key={key} wrap="truncate">
              <Text dimColor>{cont}{railTail}</Text>
              <Text dimColor color={isSel ? ACCENT : undefined} italic>“{truncate(n.branch?.intent ?? '', Math.max(4, width - 2 - cont.length - 5))}”</Text>
            </Text>
          );
        }
        const st = GLYPH[n.status];
        const age = formatAge(n.lastActive);
        const tailTxt = `${age.padStart(3)}`;
        const room = Math.max(4, width - 2 - prefix.length - 2 - tailTxt.length - 2);
        const label = truncate(n.label, room);
        const pad = Math.max(1, width - 2 - prefix.length - 2 - label.length - tailTxt.length);
        return (
          <Text key={key} inverse={isSel} wrap="truncate">
            <Text dimColor>{prefix}</Text>
            <Text color={attached ? ACCENT : st.color}>{attached ? '▶' : st.g}</Text>
            <Text bold={attached}> {label}</Text>
            <Text>{' '.repeat(pad)}</Text>
            <Text dimColor>{tailTxt}</Text>
          </Text>
        );
      })}
    </Box>
  );
}

export const TreeList = React.memo(TreeListInner);

function SelectionInfoInner({ node, forkPoint, width }: { node?: SessionNode; forkPoint?: string; width: number }) {
  if (!node) return null;
  return (
    <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor="gray" borderLeft={false} borderRight={false} borderBottom={false}>
      <Text dimColor wrap="truncate">{shortId(node.id)} · {shortenHome(node.cwd) || '?'}</Text>
      {node.parentId && (
        <Text color={ACCENT} wrap="truncate">⑂ from {shortId(node.parentId)}{forkPoint ? ` @ ${forkPoint}` : ''}</Text>
      )}
      {node.meta?.lastPrompt && (
        <Text dimColor wrap="truncate">“{oneLine(node.meta.lastPrompt, width - 4)}”</Text>
      )}
    </Box>
  );
}

export const SelectionInfo = React.memo(SelectionInfoInner);

export function BranchForm(props: {
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
    <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor={ACCENT} marginX={1}>
      <Text bold color={ACCENT} wrap="truncate">⑂ branch “{truncate(parent.label, 24)}”</Text>
      <Text dimColor wrap="wrap">child inherits the whole conversation; siblings are fine</Text>
      <Box marginTop={1}>
        <Text color={field === 'name' ? ACCENT : undefined}>name   </Text>
        {field === 'name' ? <TextInput value={name} onChange={onName} placeholder="api-refactor" /> : <Text>{name || <Text dimColor>—</Text>}</Text>}
      </Box>
      <Box>
        <Text color={field === 'intent' ? ACCENT : undefined}>intent </Text>
        {field === 'intent' ? <TextInput value={intent} onChange={onIntent} placeholder="what should it do?" /> : <Text>{intent || <Text dimColor>(optional)</Text>}</Text>}
      </Box>
      <Box>
        <Text color={field === 'worktree' ? ACCENT : undefined}>{worktree ? '[x]' : '[ ]'} isolated worktree</Text>
        {field === 'worktree' && <Text dimColor> (space)</Text>}
      </Box>
      <Text dimColor>enter open here · tab · esc</Text>
    </Box>
  );
}

export function HelpPane() {
  const L = (k: string, d: string) => (
    <Box key={k}>
      <Box width={8}>
        <Text color={ACCENT}>{k}</Text>
      </Box>
      <Text wrap="truncate">{d}</Text>
    </Box>
  );
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>sidebar keys</Text>
      {L('↑↓ jk', 'move')}
      {L('enter', 'open session in the pane →')}
      {L('b', 'branch selected (works on any node)')}
      {L('n', 'new root session')}
      {L('x', 'close embedded pane')}
      {L('v', 'tree ↔ metro view')}
      {L('a', 'this project ↔ all projects')}
      {L('r', 'refresh')}
      {L('q', 'quit (panes end; sessions resumable)')}
      <Box height={1} />
      <Text bold>terminal focus</Text>
      {L('ctrl-]', 'jump between sidebar and chat')}
      {L('ctrl-\\', 'collapse/expand the sidebar')}
      {L('pgup/dn', 'scroll chat history (fn+↑/↓)')}
      {L('…', 'every other key goes to claude')}
    </Box>
  );
}
