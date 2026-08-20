import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { SessionNode, TreeRow } from '../graph.js';
import { shortId } from '../claude/paths.js';
import { formatAge, oneLine, shortenHome, truncate } from './format.js';

export const ACCENT = '#3FB6C0';

export type ViewMode = 'tree' | 'graph';

const GLYPH: Record<SessionNode['status'], { g: string; color: string }> = {
  busy: { g: '●', color: 'yellow' },
  idle: { g: '●', color: 'green' },
  dormant: { g: '○', color: 'gray' },
};

export function TreeList(props: {
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
  const perItem = view === 'graph' ? 2 : 1;
  const visible = rows.slice(scrollTop, scrollTop + Math.max(1, Math.floor(height / perItem)));
  return (
    <Box flexDirection="column" paddingX={1}>
      {visible.map((r, i) => {
        const idx = scrollTop + i;
        const n = r.node;
        const st = GLYPH[n.status];
        const attached = n.id === attachedId;
        if (view === 'graph') {
          return (
            <GraphRow key={n.id} row={r} selected={idx === selected} attached={attached} width={width - 2} />
          );
        }
        const age = formatAge(n.lastActive);
        const tailTxt = `${age.padStart(3)}`;
        const room = Math.max(4, width - 2 - r.prefix.length - 2 - tailTxt.length - 2);
        const label = truncate(n.label, room);
        const pad = Math.max(1, width - 2 - r.prefix.length - 2 - label.length - tailTxt.length);
        return (
          <Text key={n.id} inverse={idx === selected} wrap="truncate">
            <Text dimColor>{r.prefix}</Text>
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

/** Two-line card for the graph view: name row + detail row hanging off the rail. */
function GraphRow({ row, selected, attached, width }: { row: TreeRow; selected: boolean; attached: boolean; width: number }) {
  const n = row.node;
  const st = GLYPH[n.status];
  const rail = row.prefix; // e.g. "│ ├─"
  // Continuation rail for the second line: verticals persist, ├─ → │ , └─ → "  "
  const cont = rail.replace(/├─/g, '│ ').replace(/└─/g, '  ');
  const childRail = n.children.length > 0 ? '│' : ' ';
  const room = Math.max(4, width - rail.length - 3);
  const name = truncate(n.label, room);
  const meta = `${n.status}${attached ? ' · open' : ''} · ${formatAge(n.lastActive)}${n.children.length ? ` · ⑂${n.children.length}` : ''}`;
  const sub = n.branch?.intent ? `${meta} · ${n.branch.intent}` : meta;
  return (
    <Box flexDirection="column">
      <Text inverse={selected} wrap="truncate">
        <Text dimColor>{rail}</Text>
        <Text color={attached ? ACCENT : st.color}>{attached ? '▶' : st.g}</Text>
        <Text bold={selected || attached}> {name}</Text>
      </Text>
      <Text wrap="truncate">
        <Text dimColor>{cont}</Text>
        <Text dimColor>{childRail} </Text>
        <Text dimColor color={selected ? ACCENT : undefined}>{truncate(sub, Math.max(4, width - cont.length - 4))}</Text>
      </Text>
    </Box>
  );
}

export function SelectionInfo({ node, forkPoint, width }: { node?: SessionNode; forkPoint?: string; width: number }) {
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
      {L('v', 'tree ↔ graph view')}
      {L('a', 'this project ↔ all projects')}
      {L('r', 'refresh')}
      {L('q', 'quit (panes end; sessions resumable)')}
      <Box height={1} />
      <Text bold>terminal focus</Text>
      {L('ctrl-]', 'jump between sidebar and chat')}
      {L('ctrl-\\', 'collapse/expand the sidebar')}
      {L('…', 'every other key goes to claude')}
    </Box>
  );
}
