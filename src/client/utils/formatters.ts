// Re-export from shared
export { getToolColor, getToolClass } from '../../shared/tool-metadata.js';

export function fmtTime(ts: string | number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '...';
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return Math.floor(ms / 60000) + 'm' + Math.floor((ms % 60000) / 1000) + 's';
}

export function fmtElapsed(startMs: number): string {
  const s = Math.floor((Date.now() - startMs) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

export function truncate(s: unknown, n: number = 80): string {
  if (!s) return '';
  const str = typeof s === 'string' ? s : JSON.stringify(s);
  return str.length > n ? str.slice(0, n) + '...' : str;
}

export function inputPreview(input: Record<string, unknown> | null | undefined): string {
  if (!input) return '';
  return (
    (input.command as string) ||
    (input.file_path as string) ||
    (input.pattern as string) ||
    (input.query as string) ||
    (input.description as string) ||
    truncate(input.prompt as string, 60) ||
    ''
  );
}

const escDiv = document.createElement('div');
export function esc(s: string): string {
  escDiv.textContent = s || '';
  return escDiv.innerHTML;
}

export function prettyProject(name: string): string {
  return name.replace(/^-Users-[^-]+-/, '~/').replace(/-/g, '/');
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1048576).toFixed(1) + 'MB';
}

/** Shared focus-window helper. Returns toast message. */
export async function focusWindow(session: { pid?: number; project: string }): Promise<string> {
  if (!session.pid) {
    throw new Error('Process not running — session may have ended');
  }
  const res = await fetch('/api/focus-window', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pid: session.pid }),
  });
  const data = await res.json() as { ok: boolean; error?: string; reason?: string };
  if (data.ok) return `Focused: ${prettyProject(session.project)}`;
  throw new Error(data.error || data.reason || 'unknown');
}
