import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Quote for POSIX sh. */
export function sh(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Quote for embedding inside an AppleScript double-quoted string. */
function appleStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export type Launcher = 'tmux' | 'iterm' | 'terminal' | 'none';

export function detectLauncher(): Launcher {
  if (process.env.TMUX) return 'tmux';
  if (process.platform === 'darwin') {
    const tp = process.env.TERM_PROGRAM ?? '';
    if (/iTerm/i.test(tp)) return 'iterm';
    return 'terminal';
  }
  return 'none';
}

/**
 * Open `command` in a new terminal surface (tmux window, iTerm tab, or Terminal.app tab).
 * Returns a short human description of where it went.
 */
export async function openInNewTerminal(command: string, cwd: string, title?: string): Promise<string> {
  if (process.env.CLOOM_DRY_RUN) return `dry-run: ${command}`;
  const launcher = detectLauncher();
  const full = `cd ${sh(cwd)} && ${command}`;
  switch (launcher) {
    case 'tmux': {
      const args = ['new-window', '-c', cwd];
      if (title) args.push('-n', title);
      args.push(full);
      await run('tmux', args);
      return `tmux window${title ? ` "${title}"` : ''}`;
    }
    case 'iterm': {
      const script = [
        'tell application "iTerm2"',
        '  tell current window',
        '    create tab with default profile',
        `    tell current session to write text "${appleStr(full)}"`,
        '  end tell',
        'end tell',
      ].join('\n');
      await run('osascript', ['-e', script]);
      return 'new iTerm tab';
    }
    case 'terminal': {
      // Terminal.app has no "new tab" verb; cmd-T via System Events is the standard workaround.
      const script = [
        'tell application "Terminal" to activate',
        'tell application "System Events" to tell process "Terminal" to keystroke "t" using command down',
        'delay 0.3',
        `tell application "Terminal" to do script "${appleStr(full)}" in front window`,
      ].join('\n');
      await run('osascript', ['-e', script]);
      return 'new Terminal tab';
    }
    default:
      throw new Error(`No launcher available. Run inside tmux, or copy:\n${full}`);
  }
}
