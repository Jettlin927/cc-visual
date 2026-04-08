import type { Session, SSEMessage, TileMap } from '../shared/types.js';
import { TILE_SIZE, MAP_W, MAP_H, CAMERA_LERP, LEGEND_TOOLS } from '../shared/constants.js';
import { generateMap, drawTile } from './world.js';
import { Character } from './character.js';
import { showToast, showBadge } from './notifications.js';
import { renderSessionList } from './sidebar.js';
import { initPanel, showPanel, hidePanel, renderPanel, fetchHistory } from './panel.js';
import { initInteraction } from './interaction.js';

// ─── Setup ───────────────────────────────────────────────
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const dpr = window.devicePixelRatio || 1;

const map: TileMap = generateMap();
let characters = new Map<string, Character>();
let sessions: Session[] = [];
let selected: string | null = null;

let camX = 0, camY = 0, camTargetX = 0, camTargetY = 0;
let lastTime = 0;

// DOM refs
const activeBadge   = document.getElementById('active-count')!;
const hudTime       = document.getElementById('hud-time')!;
const closePanel    = document.getElementById('close-panel')!;
const sessionListEl = document.getElementById('session-list')!;
const sidebarCount  = document.getElementById('sidebar-count')!;

// ─── Init panel ──────────────────────────────────────────
initPanel();

// ─── Sidebar Collapse ────────────────────────────────────
const sidebar = document.getElementById('session-sidebar')!;
const toggleBtn = document.getElementById('sidebar-toggle')!;
toggleBtn.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  toggleBtn.textContent = sidebar.classList.contains('collapsed') ? '\u25B6' : '\u25C0';
  resize();
});

// ─── Resize ──────────────────────────────────────────────
function resize(): void {
  const sidebarEl = document.getElementById('session-sidebar')!;
  const sw = sidebarEl.offsetWidth;
  const W  = window.innerWidth  - sw;
  const H  = window.innerHeight - 40;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ─── Camera ──────────────────────────────────────────────
const VIEW_W = (): number => canvas.width  / dpr;
const VIEW_H = (): number => canvas.height / dpr;
const WORLD_W = MAP_W * TILE_SIZE;
const WORLD_H = MAP_H * TILE_SIZE;

function clampCam(cx: number, cy: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(cx, WORLD_W - VIEW_W())),
    y: Math.max(0, Math.min(cy, WORLD_H - VIEW_H())),
  };
}

function centerOn(wx: number, wy: number): void {
  const c = clampCam(wx - VIEW_W() / 2, wy - VIEW_H() / 2);
  camTargetX = c.x;
  camTargetY = c.y;
}

centerOn(WORLD_W / 2, WORLD_H / 2);
camX = camTargetX;
camY = camTargetY;

// ─── World render ────────────────────────────────────────
function renderWorld(t: number): void {
  ctx.clearRect(0, 0, VIEW_W(), VIEW_H());
  const sx = Math.max(0, Math.floor(camX / TILE_SIZE));
  const sy = Math.max(0, Math.floor(camY / TILE_SIZE));
  const ex = Math.min(MAP_W, Math.ceil((camX + VIEW_W()) / TILE_SIZE));
  const ey = Math.min(MAP_H, Math.ceil((camY + VIEW_H()) / TILE_SIZE));
  for (let ty = sy; ty < ey; ty++) {
    for (let tx = sx; tx < ex; tx++) {
      drawTile(ctx, map[ty][tx], Math.floor(tx * TILE_SIZE - camX), Math.floor(ty * TILE_SIZE - camY), t);
    }
  }
}

// ─── Game Loop ───────────────────────────────────────────
function gameLoop(ts: number): void {
  const dt = Math.min((ts - lastTime) / 1000, 0.1);
  lastTime = ts;

  camX += (camTargetX - camX) * CAMERA_LERP;
  camY += (camTargetY - camY) * CAMERA_LERP;

  renderWorld(ts);

  const chars = [...characters.values()].sort((a, b) => a.y - b.y);
  for (const ch of chars) {
    ch.update(dt, ts);
    ch.draw(ctx, camX, camY, ts);
  }

  hudTime.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame((ts) => { lastTime = ts; gameLoop(ts); });

// ─── SSE: Active Sessions (with reconnection) ──────────
const sseStatusEl = document.getElementById('sse-status')!;
let sseRetries = 0;
const MAX_SSE_RETRIES = 5;

function connectSSE(): EventSource {
  const src = new EventSource('/api/watch-active');

  src.onopen = () => {
    if (sseRetries > 0) {
      showToast('✅ Connection restored');
      sseStatusEl.classList.add('hidden');
    }
    sseRetries = 0;
  };

  src.onmessage = (e: MessageEvent) => {
    try {
      const data: SSEMessage = JSON.parse(e.data);
      if (data.type === 'update') reconcileSessions((data.sessions || []) as Session[]);
    } catch { /* ignore parse errors */ }
  };

  src.onerror = () => {
    src.close();
    sseRetries++;
    if (sseRetries <= MAX_SSE_RETRIES) {
      sseStatusEl.textContent = `⚠ Disconnected — reconnecting (${sseRetries}/${MAX_SSE_RETRIES})...`;
      sseStatusEl.className = 'sse-status disconnected';
      const delay = Math.min(2000 * sseRetries, 10000);
      setTimeout(() => connectSSE(), delay);
    } else {
      sseStatusEl.textContent = '✕ Connection failed — please check the server';
      sseStatusEl.className = 'sse-status disconnected';
    }
  };

  return src;
}

connectSSE();

function reconcileSessions(incoming: Session[]): void {
  const ids = new Set(incoming.map(s => s.sessionId));

  for (const [id] of characters) {
    if (!ids.has(id)) {
      characters.delete(id);
      showToast(`\u2B1C Session ended: ${id.slice(0,8)}`);
    }
  }

  for (const session of incoming) {
    const id = session.sessionId;
    if (!characters.has(id)) {
      characters.set(id, new Character(session, map));
      showToast(`\u2B1B New session: ${id.slice(0,8)}`);
    } else {
      const prev = sessions.find(s => s.sessionId === id);
      const ch = characters.get(id)!;
      if (prev?.status === 'running' && session.status === 'waiting') {
        showToast(`\uD83D\uDD14 Needs review: ${id.slice(0,8)}`);
        showBadge(id, 'waiting');
      }
      ch.updateSession(session);
    }
  }

  sessions = incoming;
  activeBadge.textContent = `${characters.size} ACTIVE`;
  sidebarCount.textContent = String(characters.size);

  renderSessionList(sessionListEl, incoming, selected, {
    onSelect: selectSession,
  });

  if (selected && characters.has(selected)) {
    const s = incoming.find(s => s.sessionId === selected);
    if (s) { renderPanel(characters.get(selected)!, s); }
  }
}

// ─── Session selection ───────────────────────────────────
function selectSession(id: string): void {
  selected = id;
  const ch = characters.get(id);
  const s  = sessions.find(s => s.sessionId === id);
  if (!ch || !s) return;

  for (const c of characters.values()) c.selected = false;
  ch.selected = true;
  centerOn(ch.x, ch.y);

  renderPanel(ch, s);
  fetchHistory(ch);
  showPanel();

  document.querySelectorAll('.sess-item').forEach(el => {
    el.classList.toggle('selected', (el as HTMLElement).dataset.id === id);
  });
}

function clearSelection(): void {
  hidePanel();
  selected = null;
  for (const ch of characters.values()) ch.selected = false;
  document.querySelectorAll('.sess-item').forEach(el => el.classList.remove('selected'));
}

closePanel.addEventListener('click', clearSelection);

// ─── Interaction (drag, click, keyboard) ─────────────────
initInteraction(canvas, {
  clampCam,
  getCam: () => ({ x: camX, y: camY }),
  setCam: (x, y) => { camX = x; camY = y; },
  setCamTarget: (x, y) => { camTargetX = x; camTargetY = y; },
  getCharacters: () => characters as Map<string, { x: number; y: number; selected: boolean; id: string }>,
  getSessions: () => sessions,
  getSelected: () => selected,
  selectSession,
  clearSelection,
});

// ─── Diagnostic Panel ───────────────────────────────────
interface HealthResponse {
  claudeDir: { path: string; exists: boolean };
  codexDir: { path: string; exists: boolean };
  codexSqlite: { readable: boolean };
  lastScanAt: string | null;
  scannedFiles: number;
  filteredSessions: number;
  sseClients: number;
}

const diagPanel = document.getElementById('diag-panel')!;
const diagBody  = document.getElementById('diag-body')!;
const diagBtn   = document.getElementById('hud-diag-btn')!;
const diagClose = document.getElementById('diag-close')!;

function diagRow(label: string, value: string, ok: boolean): string {
  return `<div class="diag-row"><span class="diag-label">${label}</span><span class="diag-value ${ok ? 'ok' : 'error'}">${value}</span></div>`;
}

async function refreshDiag(): Promise<void> {
  try {
    const res = await fetch('/api/health');
    const d: HealthResponse = await res.json();
    const sseOk = sseRetries === 0;
    const scanAgo = d.lastScanAt
      ? Math.floor((Date.now() - new Date(d.lastScanAt).getTime()) / 1000) + 's ago'
      : '—';

    diagBody.innerHTML = [
      diagRow('Claude data dir', d.claudeDir.exists ? 'EXISTS' : 'MISSING', d.claudeDir.exists),
      diagRow('Codex data dir', d.codexDir.exists ? 'EXISTS' : 'MISSING', d.codexDir.exists),
      diagRow('Codex SQLite', d.codexSqlite.readable ? 'OK' : 'ERROR', d.codexSqlite.readable),
      diagRow('Last scan', scanAgo, true),
      diagRow('SSE connection', sseOk ? 'CONNECTED' : 'DISCONNECTED', sseOk),
      diagRow('Scanned JSONL files', String(d.scannedFiles), true),
      diagRow('Filtered sessions', String(d.filteredSessions), true),
    ].join('');
  } catch {
    diagBody.innerHTML = diagRow('Health API', 'UNREACHABLE', false);
  }
}

diagBtn.addEventListener('click', () => {
  const isHidden = diagPanel.classList.contains('hidden');
  diagPanel.classList.toggle('hidden');
  if (isHidden) void refreshDiag();
});

diagClose.addEventListener('click', () => {
  diagPanel.classList.add('hidden');
});

// ─── Legend ──────────────────────────────────────────────
document.getElementById('legend-items')!.innerHTML = LEGEND_TOOLS.map(([name, icon, color]) => `
  <div class="legend-item">
    <div class="legend-dot" style="background:${color}"></div>
    ${icon} ${name}
  </div>
`).join('');
