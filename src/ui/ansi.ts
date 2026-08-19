import type xterm from '@xterm/headless';
type Terminal = InstanceType<typeof xterm.Terminal>;

/**
 * Convert the visible viewport of a headless xterm into ANSI-colored strings,
 * one per row, each exactly `cols` display columns wide.
 */
export function viewportToAnsi(term: Terminal, opts: { cursor?: boolean; scrollOffset?: number } = {}): string[] {
  const buf = term.buffer.active;
  const rows = term.rows;
  const cols = term.cols;
  const maxTop = Math.max(0, buf.length - rows);
  const top = Math.max(0, maxTop - (opts.scrollOffset ?? 0));
  const cursorAbs = buf.baseY + buf.cursorY;
  const out: string[] = [];
  const cell = buf.getNullCell();

  for (let y = 0; y < rows; y++) {
    const line = buf.getLine(top + y);
    if (!line) {
      out.push('');
      continue;
    }
    let s = '';
    let prevSgr = '';
    for (let x = 0; x < cols; x++) {
      line.getCell(x, cell);
      const width = cell.getWidth();
      if (width === 0) continue; // continuation of a wide char
      const isCursor = opts.cursor === true && top + y === cursorAbs && x === buf.cursorX;
      const sgr = sgrFor(cell, isCursor);
      if (sgr !== prevSgr) {
        s += `[0m${sgr}`;
        prevSgr = sgr;
      }
      const ch = cell.getChars();
      s += ch === '' ? ' ' : ch;
    }
    if (prevSgr !== '') s += '[0m';
    out.push(s);
  }
  return out;
}

function sgrFor(cell: ReturnType<Terminal['buffer']['active']['getNullCell']>, cursor: boolean): string {
  const parts: string[] = [];
  if (cell.isBold()) parts.push('1');
  if (cell.isDim()) parts.push('2');
  if (cell.isItalic()) parts.push('3');
  if (cell.isUnderline()) parts.push('4');
  if (cell.isInverse() !== 0 !== cursor) parts.push('7');
  if (cell.isStrikethrough()) parts.push('9');

  const fg = cell.getFgColor();
  if (cell.isFgRGB()) parts.push(`38;2;${(fg >> 16) & 255};${(fg >> 8) & 255};${fg & 255}`);
  else if (cell.isFgPalette()) parts.push(fg < 8 ? String(30 + fg) : fg < 16 ? String(90 + fg - 8) : `38;5;${fg}`);

  const bg = cell.getBgColor();
  if (cell.isBgRGB()) parts.push(`48;2;${(bg >> 16) & 255};${(bg >> 8) & 255};${bg & 255}`);
  else if (cell.isBgPalette()) parts.push(bg < 8 ? String(40 + bg) : bg < 16 ? String(100 + bg - 8) : `48;5;${bg}`);

  return parts.length > 0 ? `[${parts.join(';')}m` : '';
}
