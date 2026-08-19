export function formatAge(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

export function truncate(s: string, width: number): string {
  if (width <= 0) return '';
  if (s.length <= width) return s;
  if (width <= 1) return '…';
  return s.slice(0, width - 1) + '…';
}

export function oneLine(s: string | undefined, width: number): string {
  if (!s) return '';
  return truncate(s.replace(/\s+/g, ' ').trim(), width);
}

export function shortenHome(p: string | undefined): string {
  if (!p) return '';
  const home = process.env.HOME;
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
}
