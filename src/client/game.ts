import type { Session, SSEMessage, TileMap, HealthResponse, StatsResponse } from '../shared/types.js';
import { TILE_SIZE, MAP_W, MAP_H, CAMERA_LERP, LEGEND_TOOLS } from '../shared/constants.js';
import { generateMap, drawTile } from './world.js';
import { Character } from './character.js';
import { showToast, showBadge, notifyWaiting, toggleMute, isMuted, getNotifSettings, setNotifEnabled, setDelayMinutes, setProjectWhitelist } from './notifications.js';
import { renderSessionList } from './sidebar.js';
import { initPanel, showPanel, hidePanel, renderPanel, fetchHistory } from './panel.js';
import { initInteraction } from './interaction.js';
import { focusWindow } from './utils/formatters.js';

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
const hudWaiting    = document.getElementById('hud-waiting')!;
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

function centerOn(wx: number, wy: number): void {
  camTargetX = wx - VIEW_W() / 2;
  camTargetY = wy - VIEW_H() / 2;
}

centerOn(WORLD_W / 2, WORLD_H / 2);
camX = camTargetX;
camY = camTargetY;

// ─── World render ────────────────────────────────────────
function renderWorld(t: number): void {
  ctx.fillStyle = '#1a2e0f';
  ctx.fillRect(0, 0, VIEW_W(), VIEW_H());
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

// ─── Empty State ─────────────────────────────────────────
let emptyStateEl: HTMLElement | null = null;
function updateEmptyState(isEmpty: boolean): void {
  if (isEmpty && !emptyStateEl) {
    emptyStateEl = document.createElement('div');
    emptyStateEl.className = 'empty-state';
    emptyStateEl.innerHTML = '<div class="empty-state-text">Start a Claude Code or Codex session<br>— I\'ll appear here</div>';
    canvas.parentElement!.appendChild(emptyStateEl);
  } else if (!isEmpty && emptyStateEl) {
    emptyStateEl.remove();
    emptyStateEl = null;
  }
}

// ─── Pet Cat NPC ─────────────────────────────────────────
interface CatState {
  x: number; y: number;
  targetX: number; targetY: number;
  moving: boolean; dir: number;
  frame: number; frameTime: number;
  state: 'idle' | 'walk' | 'groom' | 'sleep';
  stateTimer: number;
  tailWag: number;
}

const cat: CatState = {
  x: 11 * TILE_SIZE + TILE_SIZE / 2, y: 8 * TILE_SIZE + TILE_SIZE / 2,
  targetX: 0, targetY: 0,
  moving: false, dir: 0,
  frame: 0, frameTime: 0,
  state: 'idle', stateTimer: 2,
  tailWag: 0,
};

const catTargets = [
  { tx: 6, ty: 7 }, { tx: 10, ty: 8 }, { tx: 14, ty: 7 },
  { tx: 8, ty: 10 }, { tx: 16, ty: 10 }, { tx: 12, ty: 6 },
  { tx: 5, ty: 10 }, { tx: 18, ty: 8 },
  { tx: 11, ty: 13 }, { tx: 11, ty: 14 },
  { tx: 11, ty: 16 }, { tx: 11, ty: 17 },
  { tx: 8, ty: 15 }, { tx: 15, ty: 15 },
  { tx: 4, ty: 15 }, { tx: 19, ty: 13 },
  { tx: 6, ty: 17 }, { tx: 17, ty: 16 },
  { tx: 3, ty: 14 }, { tx: 20, ty: 14 },
];

function updateCat(dt: number): void {
  cat.frameTime += dt;
  cat.tailWag += dt * 5;
  cat.stateTimer -= dt;

  if (cat.stateTimer <= 0) {
    const r = Math.random();
    if (r < 0.4) {
      cat.state = 'walk';
      const dest = catTargets[Math.floor(Math.random() * catTargets.length)];
      cat.targetX = dest.tx * TILE_SIZE + TILE_SIZE / 2;
      cat.targetY = dest.ty * TILE_SIZE + TILE_SIZE / 2;
      cat.moving = true;
      cat.stateTimer = 5 + Math.random() * 5;
    } else if (r < 0.6) {
      cat.state = 'groom';
      cat.moving = false;
      cat.stateTimer = 2 + Math.random() * 3;
    } else if (r < 0.8) {
      cat.state = 'sleep';
      cat.moving = false;
      cat.stateTimer = 4 + Math.random() * 6;
    } else {
      cat.state = 'idle';
      cat.moving = false;
      cat.stateTimer = 1 + Math.random() * 3;
    }
  }

  if (cat.moving) {
    const dx = cat.targetX - cat.x;
    const dy = cat.targetY - cat.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 3) {
      cat.moving = false;
      cat.state = 'idle';
      cat.stateTimer = 1 + Math.random() * 2;
    } else {
      const spd = 35;
      cat.x += (dx / dist) * spd * dt;
      cat.y += (dy / dist) * spd * dt;
      cat.x = Math.max(TILE_SIZE, Math.min(cat.x, (MAP_W - 1) * TILE_SIZE));
      cat.y = Math.max(TILE_SIZE, Math.min(cat.y, (MAP_H - 1) * TILE_SIZE));
      if (Math.abs(dx) > Math.abs(dy)) cat.dir = dx > 0 ? 2 : 1;
      else cat.dir = dy > 0 ? 0 : 3;
      if (cat.frameTime > 0.15) { cat.frame = (cat.frame + 1) % 4; cat.frameTime = 0; }
    }
  }
}

function renderCat(ts: number): void {
  const sx = Math.floor(cat.x - camX);
  const sy = Math.floor(cat.y - camY);
  if (sx < -20 || sx > VIEW_W() + 20 || sy < -20 || sy > VIEW_H() + 20) return;

  ctx.save();
  ctx.translate(sx, sy);
  if (cat.dir === 1) ctx.scale(-1, 1);

  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(0, 6, 6, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  const sleepy = cat.state === 'sleep';
  const bob = sleepy ? 0 : Math.sin(ts / 800) * 0.5;

  ctx.fillStyle = '#f0a040';
  ctx.fillRect(-5, -2 + bob, 10, 7);
  ctx.fillStyle = '#d08020';
  ctx.fillRect(-3, -1 + bob, 2, 5);
  ctx.fillRect(1, -1 + bob, 2, 5);

  if (sleepy) {
    ctx.fillStyle = '#f0a040';
    ctx.beginPath();
    ctx.arc(0, 2, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d08020';
    ctx.fillRect(-2, -1, 2, 3);
    ctx.fillRect(2, 0, 2, 3);
    ctx.fillStyle = '#f0a040';
    ctx.fillRect(-4, -5, 8, 6);
    ctx.fillStyle = '#333';
    ctx.fillRect(-3, -3, 2, 1);
    ctx.fillRect(1, -3, 2, 1);
    ctx.fillStyle = '#aaf';
    ctx.font = '5px "Press Start 2P", monospace';
    const zzOff = Math.sin(ts / 800) * 2;
    ctx.fillText('z', 5, -6 + zzOff);
  } else {
    ctx.fillStyle = '#e09030';
    ctx.fillRect(-4, 4 + bob, 2, 3 + (cat.moving && cat.frame % 2 === 0 ? -1 : 0));
    ctx.fillRect(-1, 4 + bob, 2, 3 + (cat.moving && cat.frame % 2 === 1 ? -1 : 0));
    ctx.fillRect(1, 4 + bob, 2, 3 + (cat.moving && cat.frame % 2 === 0 ? -1 : 0));
    ctx.fillRect(3, 4 + bob, 2, 3 + (cat.moving && cat.frame % 2 === 1 ? -1 : 0));

    ctx.fillStyle = '#f0a040';
    ctx.fillRect(-5, -8 + bob, 10, 7);
    ctx.fillStyle = '#f0a040';
    ctx.fillRect(-5, -11 + bob, 3, 4);
    ctx.fillRect(3, -11 + bob, 3, 4);
    ctx.fillStyle = '#f8b8b8';
    ctx.fillRect(-4, -10 + bob, 1, 2);
    ctx.fillRect(4, -10 + bob, 1, 2);
    if (cat.dir !== 3) {
      ctx.fillStyle = '#333';
      ctx.fillRect(-3, -6 + bob, 2, 2);
      ctx.fillRect(2, -6 + bob, 2, 2);
      ctx.fillStyle = '#6a4';
      ctx.fillRect(-3, -6 + bob, 1, 1);
      ctx.fillRect(2, -6 + bob, 1, 1);
    }
    ctx.fillStyle = '#f88';
    ctx.fillRect(0, -4 + bob, 1, 1);

    const tailAngle = Math.sin(cat.tailWag) * 0.4;
    ctx.fillStyle = '#e09030';
    ctx.save();
    ctx.translate(5, -1 + bob);
    ctx.rotate(tailAngle);
    ctx.fillRect(0, -1, 6, 2);
    ctx.fillRect(5, -3, 2, 3);
    ctx.restore();

    if (cat.state === 'groom') {
      const lick = Math.sin(ts / 200) * 2;
      ctx.fillStyle = '#f0a040';
      ctx.fillRect(-6, -2 + bob + lick, 3, 4);
    }
  }

  ctx.restore();
}

// ─── Day/Night Cycle ─────────────────────────────────────
interface DayPhase {
  color: string;
  alpha: number;
  night: boolean;
}

function getDayPhase(): DayPhase {
  const h = new Date().getHours();
  const m = new Date().getMinutes();
  const t = h + m / 60;
  if (t >= 6 && t < 7)   return { color: '255,180,100', alpha: 0.15 * (7 - t), night: false };
  if (t >= 7 && t < 17)  return { color: '0,0,0',       alpha: 0,               night: false };
  if (t >= 17 && t < 19) return { color: '255,140,50',  alpha: 0.12 * (t - 17) / 2, night: false };
  if (t >= 19 && t < 20) return { color: '30,20,80',    alpha: 0.1 + 0.2 * (t - 19), night: true };
  return { color: '20,15,60', alpha: 0.35, night: true };
}

function renderDayNight(ts: number): void {
  const { color, alpha, night } = getDayPhase();
  if (alpha > 0) {
    ctx.fillStyle = `rgba(${color},${alpha})`;
    ctx.fillRect(0, 0, VIEW_W(), VIEW_H());
  }
  if (night) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 20; i++) {
      const starX = ((i * 137 + 50) % VIEW_W());
      const starY = ((i * 97 + 30) % (VIEW_H() * 0.3));
      const twinkle = Math.sin(ts / 500 + i * 2) * 0.4 + 0.6;
      ctx.globalAlpha = twinkle * 0.7;
      const sz = (i % 3 === 0) ? 2 : 1;
      ctx.fillRect(starX, starY, sz, sz);
    }
    ctx.globalAlpha = 1;
  }
}

// ─── Ambient Particles ───────────────────────────────────
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  type: 'leaf' | 'firefly';
  rot: number;
}

const particles: Particle[] = [];
const MAX_PARTICLES = 25;

function spawnParticle(): Particle {
  const { night } = getDayPhase();
  if (night) {
    return {
      x: Math.random() * WORLD_W, y: Math.random() * WORLD_H,
      vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 10,
      life: 4 + Math.random() * 6, maxLife: 10,
      type: 'firefly', rot: 0,
    };
  } else {
    return {
      x: Math.random() * WORLD_W, y: -10,
      vx: 10 + Math.random() * 20, vy: 15 + Math.random() * 20,
      life: 5 + Math.random() * 5, maxLife: 10,
      type: 'leaf', rot: Math.random() * Math.PI * 2,
    };
  }
}

function updateParticles(dt: number): void {
  while (particles.length < MAX_PARTICLES) {
    particles.push(spawnParticle());
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.type === 'firefly') {
      p.vx += (Math.random() - 0.5) * 30 * dt;
      p.vy += (Math.random() - 0.5) * 20 * dt;
    }
    if (p.type === 'leaf') {
      p.rot += dt * 2;
      p.vx += Math.sin(p.rot) * 5 * dt;
    }
    if (p.life <= 0 || p.y > WORLD_H + 20) {
      particles.splice(i, 1);
    }
  }
}

function renderParticles(ts: number): void {
  for (const p of particles) {
    const px = p.x - camX;
    const py = p.y - camY;
    if (px < -10 || px > VIEW_W() + 10 || py < -10 || py > VIEW_H() + 10) continue;

    const fade = Math.min(1, p.life / 2);

    if (p.type === 'firefly') {
      const glow = Math.sin(ts / 200 + p.x) * 0.3 + 0.7;
      ctx.globalAlpha = fade * glow * 0.8;
      ctx.fillStyle = '#aaff44';
      ctx.fillRect(px - 1, py - 1, 3, 3);
      ctx.fillStyle = 'rgba(170,255,68,0.15)';
      ctx.fillRect(px - 4, py - 4, 9, 9);
    } else {
      ctx.globalAlpha = fade * 0.6;
      ctx.fillStyle = '#9a7a30';
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.rot);
      ctx.fillRect(-2, -1, 4, 2);
      ctx.fillStyle = '#8a6a20';
      ctx.fillRect(-1, -2, 2, 4);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

// ─── Chimney Smoke ───────────────────────────────────────
interface SmokeParticle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; life: number;
}

const smokeParticles: SmokeParticle[] = [];

function updateSmoke(dt: number): void {
  const cx = 17 * TILE_SIZE + TILE_SIZE / 2;
  const cy = 0;
  if (smokeParticles.length < 12 && Math.random() < dt * 3) {
    smokeParticles.push({
      x: cx + (Math.random() - 0.5) * 6,
      y: cy,
      vy: -12 - Math.random() * 8,
      vx: 3 + Math.random() * 4,
      size: 3 + Math.random() * 3,
      life: 3 + Math.random() * 2,
    });
  }
  for (let i = smokeParticles.length - 1; i >= 0; i--) {
    const s = smokeParticles[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.size += dt * 2;
    s.life -= dt;
    if (s.life <= 0) smokeParticles.splice(i, 1);
  }
}

function renderSmoke(): void {
  for (const s of smokeParticles) {
    const sx = s.x - camX;
    const sy = s.y - camY;
    const fade = Math.min(1, s.life / 1.5);
    ctx.globalAlpha = fade * 0.25;
    ctx.fillStyle = '#aaa';
    ctx.beginPath();
    ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ─── Game Loop ───────────────────────────────────────────
function gameLoop(ts: number): void {
  const dt = Math.min((ts - lastTime) / 1000, 0.1);
  lastTime = ts;

  // Camera
  if (selected && characters.has(selected)) {
    const ch = characters.get(selected)!;
    centerOn(ch.x, ch.y);
  } else {
    centerOn(WORLD_W / 2, WORLD_H / 2);
  }
  camX += (camTargetX - camX) * CAMERA_LERP;
  camY += (camTargetY - camY) * CAMERA_LERP;

  // Update systems
  updateParticles(dt);
  updateSmoke(dt);
  updateCat(dt);

  // 1. Render world tiles
  renderWorld(ts);

  // 2. Y-sorted drawables (characters + cat)
  const chars = [...characters.values()];
  const drawables: { y: number; draw: () => void }[] = chars.map(ch => ({
    y: ch.y,
    draw: () => { ch.update(dt, ts); ch.draw(ctx, camX, camY, ts); },
  }));
  drawables.push({ y: cat.y, draw: () => renderCat(ts) });
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  // 3. Ambient particles
  renderParticles(ts);

  // 4. Chimney smoke
  renderSmoke();

  // 5. Day/night overlay + stars
  renderDayNight(ts);

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
        notifyWaiting(id, session.project);
      }
      ch.updateSession(session);
    }
  }

  sessions = incoming;
  activeBadge.textContent = `${characters.size} ACTIVE`;
  sidebarCount.textContent = String(characters.size);

  // HUD waiting badge with pulse
  const waitingCount = incoming.filter(s => s.status === 'waiting').length;
  if (waitingCount > 0) {
    hudWaiting.textContent = `⚠ ${waitingCount} waiting`;
    hudWaiting.classList.add('has-waiting');
  } else {
    hudWaiting.textContent = 'All clear';
    hudWaiting.classList.remove('has-waiting');
    hudWaiting.style.display = '';
  }

  // Empty state
  updateEmptyState(incoming.length === 0);

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

// ─── Focus window for waiting sessions ──────────────────
async function focusWaitingSession(id: string): Promise<void> {
  const session = sessions.find(s => s.sessionId === id);
  if (!session) return;
  try {
    const pid = 'pid' in session && typeof session.pid === 'number' ? session.pid : undefined;
    const msg = await focusWindow({ pid, project: session.project });
    showToast(msg);
  } catch (err) {
    showToast(`\u2717 Focus failed: ${err instanceof Error ? err.message : 'network error'}`);
  }
}

// ─── Interaction (drag, click, keyboard) ─────────────────
initInteraction(canvas, {
  getCam: () => ({ x: camX, y: camY }),
  getCharacters: () => characters as Map<string, { x: number; y: number; selected: boolean; id: string }>,
  getSessions: () => sessions,
  getSelected: () => selected,
  selectSession,
  clearSelection,
  focusWaitingSession: (id: string) => void focusWaitingSession(id),
});

// ─── Panel toggle helper ────────────────────────────────
function bindPanel(panelId: string, openBtnId: string, closeBtnId: string, onOpen?: () => void): void {
  const panel = document.getElementById(panelId)!;
  const openBtn = document.getElementById(openBtnId)!;
  const closeBtn = document.getElementById(closeBtnId)!;
  openBtn.addEventListener('click', () => {
    const wasHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    if (wasHidden && onOpen) onOpen();
  });
  closeBtn.addEventListener('click', () => panel.classList.add('hidden'));
}

// ─── Unified Details Panel (stats + diagnostics + settings) ──
const statsBody  = document.getElementById('stats-body')!;
const diagBody   = document.getElementById('diag-body')!;

function statsBar(label: string, value: number, max: number, color: string): string {
  const pct = max > 0 ? (value / max * 100) : 0;
  return `<div class="stats-bar-row">
    <span class="stats-bar-label">${label}</span>
    <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${pct}%;background:${color}"></div></div>
    <span class="stats-bar-value">${value}</span>
  </div>`;
}

async function refreshStats(): Promise<void> {
  try {
    const r = await fetch('/api/stats');
    const d: StatsResponse = await r.json();
    const total = d.claudeCount + d.codexCount || 1;

    let html = '';
    html += `<div class="diag-row"><span class="diag-label">Sessions</span><span class="diag-value ok">${d.totalSessions} total / ${d.activeSessions} active</span></div>`;
    html += `<div class="diag-row"><span class="diag-label">Tool calls</span><span class="diag-value ok">${d.totalToolCalls}</span></div>`;
    html += '<div style="margin-top:6px;font-size:10px;color:#666;letter-spacing:1px;font-family:var(--px)">SOURCE SPLIT</div>';
    html += statsBar('Claude', d.claudeCount, total, '#3a3');
    html += statsBar('Codex', d.codexCount, total, '#58a6ff');

    const toolEntries = Object.entries(d.byTool).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (toolEntries.length > 0) {
      const maxTool = toolEntries[0][1];
      html += '<div style="margin-top:6px;font-size:10px;color:#666;letter-spacing:1px;font-family:var(--px)">TOP TOOLS</div>';
      for (const [name, count] of toolEntries) {
        html += statsBar(name, count, maxTool, '#fa0');
      }
    }

    statsBody.innerHTML = html;
  } catch {
    statsBody.innerHTML = '<div class="diag-row"><span class="diag-value error">Failed to load stats</span></div>';
  }
}

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

function refreshDetailsPanel(): void {
  void refreshStats();
  void refreshDiag();
  syncSettingsUI();
}

bindPanel('details-panel', 'hud-diag-btn', 'details-close', refreshDetailsPanel);

// ─── Mute Button ────────────────────────────────────────
const muteBtn = document.getElementById('hud-mute-btn')!;
muteBtn.textContent = isMuted() ? '🔇' : '🔊';
muteBtn.addEventListener('click', () => {
  toggleMute();
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
});

// ─── Notification Settings ──────────────────────────────
const setEnabled    = document.getElementById('set-enabled') as HTMLInputElement;
const setDelay      = document.getElementById('set-delay') as HTMLInputElement;
const setProjects   = document.getElementById('set-projects') as HTMLInputElement;

function syncSettingsUI(): void {
  const ns = getNotifSettings();
  setEnabled.checked = ns.enabled;
  setDelay.value = String(ns.delayMinutes);
  setProjects.value = ns.projectWhitelist.join(', ');
}

setEnabled.addEventListener('change', () => setNotifEnabled(setEnabled.checked));
setDelay.addEventListener('change', () => setDelayMinutes(Math.max(0, parseInt(setDelay.value, 10) || 0)));
setProjects.addEventListener('change', () => {
  const list = setProjects.value.split(',').map(s => s.trim()).filter(Boolean);
  setProjectWhitelist(list);
});

// ─── Legend ──────────────────────────────────────────────
document.getElementById('legend-items')!.innerHTML = LEGEND_TOOLS.map(([name, icon, color]) => `
  <div class="legend-item">
    <div class="legend-dot" style="background:${color}"></div>
    ${icon} ${name}
  </div>
`).join('');
