import React, { useMemo } from 'react';
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
  const lines = useMemo(
    () => (session ? viewportToAnsi(session.term, { cursor: focused && !session.exited && scrollOffset === 0, scrollOffset }) : []),
    [session, frame, focused, scrollOffset, width, height],
  );
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
  return (
    <Box flexDirection="column" width={width} height={height}>
      {lines.slice(0, height).map((l, i) => (
        <Text key={i} wrap="truncate">{l || ' '}</Text>
      ))}
      {scrollOffset > 0 && (
        <Text backgroundColor="gray" color="black" wrap="truncate">{` ↑ scrolled ${scrollOffset} lines — wheel down or type to follow `}</Text>
      )}
      {session.exited && (
        <Text backgroundColor="gray" color="black" wrap="truncate">
          {` session ended (${session.exitCode ?? '?'}) — ctrl-] for sidebar, enter to reopen `}
        </Text>
      )}
    </Box>
  );
}
