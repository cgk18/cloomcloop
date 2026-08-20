import React, { useMemo } from 'react';
import fs from 'node:fs';
import { Box, Text } from 'ink';
import type { ManagedSession } from '../pty.js';
import { viewportToAnsi } from './ansi.js';
import { ACCENT } from './Sidebar.js';

/**
 * Renders the screen of an embedded claude session. `frame` is a monotonically
 * increasing counter bumped on pty output so React re-renders on new data.
 */
export function TerminalPane(props: { session?: ManagedSession; focused: boolean; width: number; height: number; frame: number; scrollOffset?: number }) {
  const { session, focused, width, height, frame, scrollOffset = 0 } = props;
  const dbg = process.env.CLOOM_DEBUG;
  const lines = useMemo(
    () => (session ? viewportToAnsi(session.term, { cursor: focused && !session.exited && scrollOffset === 0, scrollOffset }) : []),
    [session, frame, focused, scrollOffset, width, height],
  );
  if (dbg) fs.appendFileSync(dbg, `pane render: sess=${session?.nodeId} frame=${frame} lines=${lines.length} nonempty=${lines.filter((l)=>l.trim()).length}\n`);
  if (!session) {
    return (
      <Box flexDirection="column" width={width} height={height} alignItems="center" justifyContent="center">
        <Text bold>nothing open yet</Text>
        <Box height={1} />
        <Text><Text color={ACCENT}>double-click a session</Text> on the left → its chat opens here</Text>
        <Text>press <Text color={ACCENT}>n</Text> → start a fresh claude in this repo</Text>
        <Text>press <Text color={ACCENT}>b</Text> → branch the selected session into a new agent</Text>
        <Box height={1} />
        <Text dimColor>in the chat, every key goes to claude · ctrl-] comes back to the list</Text>
        <Text dimColor>● live · ○ resumable · ▶ open here · ? shows all keys</Text>
      </Box>
    );
  }
  const banner = session.exited
    ? ` session ended (${session.exitCode ?? '?'}) — ctrl-] for sidebar, then enter reopens it `
    : scrollOffset > 0
      ? ` ↑ scrolled ${scrollOffset} lines — wheel down / pgdn or type to follow `
      : undefined;
  const bodyH = banner ? height - 1 : height; // keep the banner inside the pane, not clipped below it
  // One Text per row. A single joined block is faster to lay out, but Ink's
  // width measurement can disagree with xterm's by a column on odd glyphs, and
  // with a multiline string + truncate that clips the ENTIRE screen. Per-line,
  // a mismatch costs at most one line.
  const body = lines.slice(0, bodyH);
  return (
    <Box flexDirection="column" width={width} height={height}>
      {body.map((l, i) => (
        <Text key={i} wrap="truncate">{l || ' '}</Text>
      ))}
      {banner && (
        <Text backgroundColor={session.exited ? 'red' : 'gray'} color={session.exited ? 'white' : 'black'} wrap="truncate">
          {banner}
        </Text>
      )}
    </Box>
  );
}
