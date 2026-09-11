import { spawn, type IPty } from 'node-pty';
import xterm from '@xterm/headless';
const { Terminal } = xterm;
type Terminal = InstanceType<typeof xterm.Terminal>;
import { EventEmitter } from 'node:events';

/**
 * One embedded Claude Code session: a real `claude` process on a pty,
 * mirrored into a headless xterm screen buffer for rendering.
 */
export interface ManagedSession {
  nodeId: string; // session id this pane is (or will become)
  /** false until the process writes its first byte (drives the "starting…" placeholder) */
  hasOutput: boolean;
  title: string;
  pty: IPty;
  term: Terminal;
  exited: boolean;
  exitCode?: number;
}

export const CLAUDE_BIN = process.env.CLOOM_CLAUDE_BIN ?? 'claude';

export class PtyManager extends EventEmitter {
  private sessions = new Map<string, ManagedSession>();
  private cols = 80;
  private rows = 24;

  /** ids in creation order (for pane cycling) */
  ids(): string[] {
    return [...this.sessions.keys()];
  }

  get(nodeId: string): ManagedSession | undefined {
    return this.sessions.get(nodeId);
  }

  setSize(cols: number, rows: number): void {
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    for (const s of this.sessions.values()) {
      if (!s.exited) {
        try {
          s.pty.resize(cols, rows);
        } catch {
          /* exited between check and resize */
        }
      }
      s.term.resize(cols, rows);
    }
  }

  /** Spawn `claude` (or any command) under a key. Emits 'data' (nodeId) and 'exit' (nodeId). */
  open(nodeId: string, args: string[], cwd: string, title: string): ManagedSession {
    const existing = this.sessions.get(nodeId);
    if (existing && !existing.exited) return existing;
    const term = new Terminal({ cols: this.cols, rows: this.rows, scrollback: 2000, allowProposedApi: true });
    // Strip nested-session markers so embedded claudes behave like fresh top-level
    // sessions (keep CLAUDE_CONFIG_DIR and other user config).
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v === undefined) continue;
      if (k === 'CLAUDECODE' || k === 'CLAUDE_CODE_CHILD_SESSION' || k === 'CLAUDE_CODE_SSE_PORT' || k === 'CLAUDE_CODE_ENTRYPOINT') continue;
      env[k] = v;
    }
    env.TERM_PROGRAM = 'cloomcloop';
    const pty = spawn(CLAUDE_BIN, args, {
      name: 'xterm-256color',
      cols: this.cols,
      rows: this.rows,
      cwd,
      env,
    });
    const session: ManagedSession = { nodeId, title, pty, term, exited: false, hasOutput: false };
    pty.onData((d) => {
      session.hasOutput = true;
      // Byte count rides along: the renderer pays attention to chunk size to tell a
      // small echo (paint now, keystrokes must feel instant) from a full-screen
      // repaint arriving in pieces (coalesce, or we paint a half-drawn screen).
      term.write(d, () => this.emit('data', nodeId, d.length));
    });
    pty.onExit(({ exitCode }) => {
      session.exited = true;
      session.exitCode = exitCode;
      this.emit('exit', nodeId);
    });
    this.sessions.set(nodeId, session);
    return session;
  }

  /** Write text into a pane's SCREEN BUFFER only (scrollback preload) — never to the process. */
  preloadScrollback(nodeId: string, lines: string[]): void {
    const s = this.sessions.get(nodeId);
    if (!s) return;
    s.term.write(lines.join('\r\n') + '\r\n');
  }

  write(nodeId: string, data: string): void {
    const s = this.sessions.get(nodeId);
    if (s && !s.exited) s.pty.write(data);
  }

  /** Re-key a pane once the real session id becomes known (fork gets a fresh id). */
  rekey(oldId: string, newId: string): void {
    const s = this.sessions.get(oldId);
    if (!s || this.sessions.has(newId)) return;
    this.sessions.delete(oldId);
    s.nodeId = newId;
    this.sessions.set(newId, s);
  }

  close(nodeId: string): void {
    const s = this.sessions.get(nodeId);
    if (!s) return;
    if (!s.exited) {
      try {
        s.pty.kill();
      } catch {
        /* already gone */
      }
    }
    s.term.dispose();
    this.sessions.delete(nodeId);
  }

  disposeAll(): void {
    for (const id of [...this.sessions.keys()]) this.close(id);
  }
}
