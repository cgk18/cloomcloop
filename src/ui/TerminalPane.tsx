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
        <Text dimColor>no session open</Text>
        <Text dimColor>
          <Text color={ACCENT}>enter</Text> opens the selected session here · <Text color={ACCENT}>b</Text> branches it · <Text color={ACCENT}>n</Text> starts new
        </Text>
      </Box>
    );
  }
  const banner = session.exited
    ? ` session ended (${session.exitCode ?? '?'}) — ctrl-] for sidebar, then enter reopens it `
    : scrollOffset > 0
      ? ` ↑ scrolled ${scrollOffset} lines — wheel down / pgdn or type to follow `
      : undefined;
  const bodyH = banner ? height - 1 : height; // keep the banner inside the pane, not clipped below it
  const block = lines.slice(0, bodyH).map((l) => l || ' ').join('\n');
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Text wrap="truncate-end">{block}</Text>
      {banner && (
        <Text backgroundColor={session.exited ? 'red' : 'gray'} color={session.exited ? 'white' : 'black'} wrap="truncate">
          {banner}
        </Text>
      )}
    </Box>
  );
}
