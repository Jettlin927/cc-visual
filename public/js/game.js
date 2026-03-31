import { generateMap, drawTile, TILE_SIZE, W as MAP_W, H as MAP_H } from './world.js';
import { Character, TOOL_META } from './character.js';
import { prettyProject, fmtDuration } from './utils/formatters.js';

// ─── Setup ───────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;

const map = generateMap();
let characters = new Map(); // sessionId → Character
let sessions   = [];        // latest session data array
let selected   = null;

let camX = 0, camY = 0, camTargetX = 0, camTargetY = 0;
let lastTime = 0;

// DOM refs
const activeBadge   = document.getElementById('active-count');
const hudTime       = document.getElementById('hud-time');
const sidePanel     = document.getElementById('side-panel');
const closePanel    = document.getElementById('close-panel');
const panelAvatar   = document.getElementById('panel-avatar');
const panelSession  = document.getElementById('panel-session');
const panelProject  = document.getElementById('panel-project');
const panelTool     = document.getElementById('panel-tool');
const panelHistory  = document.getElementById('panel-history');
const sessionListEl = document.getElementById('session-list');
const sidebarCount  = document.getElementById('sidebar-count');

// ─── Sidebar Collapse ────────────────────────────────────
const sidebar = document.getElementById('session-sidebar');
const toggleBtn = document.getElementById('sidebar-toggle');
toggleBtn.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  toggleBtn.textContent = sidebar.classList.contains('collapsed') ? '▶' : '◀';
  resize();
});

// ─── Resize ──────────────────────────────────────────────
function resize() {
  const sidebar = document.getElementById('session-sidebar');
  const sw = sidebar.offsetWidth;
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
const VIEW_W = () => canvas.width  / dpr;
const VIEW_H = () => canvas.height / dpr;
const WORLD_W = MAP_W * TILE_SIZE;
const WORLD_H = MAP_H * TILE_SIZE;

function clampCam(cx, cy) {
  return {
    x: Math.max(0, Math.min(cx, WORLD_W - VIEW_W())),
    y: Math.max(0, Math.min(cy, WORLD_H - VIEW_H())),
  };
}

function centerOn(wx, wy) {
  const c = clampCam(wx - VIEW_W() / 2, wy - VIEW_H() / 2);
  camTargetX = c.x;
  camTargetY = c.y;
}

centerOn(WORLD_W / 2, WORLD_H / 2);
camX = camTargetX;
camY = camTargetY;

// ─── World render ────────────────────────────────────────
function renderWorld(t) {
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
function gameLoop(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 0.1);
  lastTime = ts;

  camX += (camTargetX - camX) * 0.08;
  camY += (camTargetY - camY) * 0.08;

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

// ─── SSE: Active Sessions ────────────────────────────────
const evtSrc = new EventSource('/api/watch-active');
evtSrc.onmessage = (e) => {
  try {
    const data = JSON.parse(e.data);
    if (data.type === 'update') reconcileSessions(data.sessions || []);
  } catch {}
};

function reconcileSessions(incoming) {
  const ids = new Set(incoming.map(s => s.sessionId));

  for (const [id] of characters) {
    if (!ids.has(id)) {
      characters.delete(id);
      showToast(`⬜ Session ended: ${id.slice(0,8)}`);
    }
  }

  for (const session of incoming) {
    const id = session.sessionId;
    if (!characters.has(id)) {
      characters.set(id, new Character(session, map));
      showToast(`⬛ New session: ${id.slice(0,8)}`);
    } else {
      const prev = sessions.find(s => s.sessionId === id);
      const ch = characters.get(id);
      // Notify status change: running → waiting (needs review)
      if (prev?.status === 'running' && session.status === 'waiting') {
        showToast(`🔔 Needs review: ${id.slice(0,8)}`);
        showBadge(id, 'waiting');
      }
      ch.updateSession(session);
    }
  }

  sessions = incoming;
  activeBadge.textContent = `${characters.size} ACTIVE`;
  sidebarCount.textContent = characters.size;

  renderSessionList(incoming);

  if (selected && characters.has(selected)) {
    const s = incoming.find(s => s.sessionId === selected);
    if (s) { renderPanel(characters.get(selected), s); }
  }
}

// ─── Session List Sidebar ────────────────────────────────
function renderSessionList(list) {
  // Sort: waiting first, then running, then idle
  const order = { waiting: 0, running: 1, idle: 2 };
  const sorted = [...list].sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2));

  sessionListEl.innerHTML = '';
  for (const s of sorted) {
    sessionListEl.appendChild(buildSessionItem(s));
  }
}

function buildSessionItem(s) {
  const el = document.createElement('div');
  el.className = `sess-item ${s.status}`;
  el.dataset.id = s.sessionId;
  if (s.sessionId === selected) el.classList.add('selected');

  const tool = s.lastTool;
  const toolName = tool ? tool.name : '—';
  const toolMeta = TOOL_META[toolName] || {};
  const toolIcon = toolMeta.icon || '';
  const ago = timeAgo(s.modifiedAt);
  const needsReview = s.status === 'waiting';

  el.innerHTML = `
    <div class="sess-top">
      <span class="sess-status-dot"></span>
      <span class="sess-id">${s.sessionId.slice(0,8)}</span>
      ${needsReview ? `<span class="sess-alert" title="Needs your review">🔔</span>` : ''}
    </div>
    <div class="sess-project">${prettyProject(s.project)}</div>
    <div class="sess-status-row">
      <span class="sess-badge ${s.status}">${s.status.toUpperCase()}</span>
      <span class="sess-tool">${toolIcon} ${toolName}</span>
    </div>
    <div class="sess-meta">
      <span class="sess-count">${s.toolCount ?? 0} calls</span>
      <span class="sess-ago">${ago}</span>
    </div>
  `;

  el.addEventListener('click', () => selectSession(s.sessionId));
  return el;
}

function selectSession(id) {
  selected = id;
  const ch = characters.get(id);
  const s  = sessions.find(s => s.sessionId === id);
  if (!ch || !s) return;

  for (const c of characters.values()) c.selected = false;
  ch.selected = true;
  centerOn(ch.x, ch.y);

  renderPanel(ch, s);
  fetchHistory(ch);
  sidePanel.classList.remove('hidden');

  // Highlight in sidebar
  document.querySelectorAll('.sess-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id);
  });
}

// ─── Right Detail Panel ──────────────────────────────────
function renderPanel(ch, s) {
  panelAvatar.innerHTML = '';
  const ac = document.createElement('canvas');
  ch.drawPortrait(ac);
  ac.style.width = '64px'; ac.style.height = '64px';
  panelAvatar.appendChild(ac);

  panelSession.textContent = ch.id.slice(0, 16) + '...';
  panelProject.textContent = prettyProject(ch.session.project);

  const tool = s?.lastTool || ch.currentTool;
  if (tool) {
    const meta = TOOL_META[tool.name] || { icon: '⚙️', color: '#888', label: tool.name };
    panelTool.innerHTML = `
      <div style="color:${meta.color};font-size:10px;margin-bottom:4px">${meta.icon} ${tool.name}</div>
      <div style="color:#888;font-size:7px;word-break:break-all;line-height:1.5">${esc(getPreview(tool.input))}</div>
      <div style="color:${statusColor(tool.status)};font-size:7px;margin-top:4px">${tool.status.toUpperCase()}</div>
    `;
  } else {
    panelTool.innerHTML = `<span style="color:#555">IDLE</span>`;
  }
}

async function fetchHistory(ch) {
  try {
    const r = await fetch(`/api/transcript?path=${encodeURIComponent(ch.session.filePath)}`);
    const d = await r.json();
    const recent = (d.toolCalls || []).slice(-12).reverse();
    panelHistory.innerHTML = recent.map(tc => {
      const meta = TOOL_META[tc.name] || { icon: '⚙️', color: '#888' };
      return `<div class="ph-item ${tc.status}" style="border-color:${meta.color}">
        <span class="ph-name" style="color:${meta.color}">${meta.icon} ${tc.name}</span>
        <span class="ph-dur">${fmtDuration(tc.duration)}</span>
      </div>`;
    }).join('');
  } catch {}
}

closePanel.addEventListener('click', () => {
  sidePanel.classList.add('hidden');
  selected = null;
  for (const ch of characters.values()) ch.selected = false;
  document.querySelectorAll('.sess-item').forEach(el => el.classList.remove('selected'));
});

// ─── Map drag ────────────────────────────────────────────
let isDragging = false;
let dragMoved  = false;
let dragStartX = 0, dragStartY = 0;
let dragStartCamX = 0, dragStartCamY = 0;

canvas.addEventListener('mousedown', (e) => {
  isDragging   = true;
  dragMoved    = false;
  dragStartX   = e.clientX;
  dragStartY   = e.clientY;
  dragStartCamX = camX;
  dragStartCamY = camY;
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  if (Math.hypot(dx, dy) > 4) {
    dragMoved = true;
    canvas.style.cursor = 'grabbing';
  }
  if (dragMoved) {
    const c = clampCam(dragStartCamX - dx, dragStartCamY - dy);
    camX = camTargetX = c.x;
    camY = camTargetY = c.y;
  }
});

const endDrag = () => {
  isDragging = false;
  canvas.style.cursor = 'default';
};
canvas.addEventListener('mouseup',    endDrag);
canvas.addEventListener('mouseleave', endDrag);

// ─── Canvas click → select character ────────────────────
canvas.addEventListener('click', (e) => {
  if (dragMoved) return; // drag ended, not a click
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  let closest = null, closestDist = 28;
  for (const ch of characters.values()) {
    const d = Math.hypot(ch.x - camX - mx, ch.y - camY - my);
    if (d < closestDist) { closest = ch; closestDist = d; }
  }

  if (closest) {
    selectSession(closest.id);
  } else {
    sidePanel.classList.add('hidden');
    selected = null;
    for (const ch of characters.values()) ch.selected = false;
    document.querySelectorAll('.sess-item').forEach(el => el.classList.remove('selected'));
  }
});

// Space = cycle through sessions
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && sessions.length) {
    e.preventDefault();
    const ids = sessions.map(s => s.sessionId);
    const idx = ids.indexOf(selected);
    const next = ids[(idx + 1) % ids.length];
    selectSession(next);
  }
});

// ─── Legend ──────────────────────────────────────────────
const LEGEND_TOOLS = [
  ['Bash','⚡','#fa0'], ['Read','📖','#0ff'], ['Edit','✏️','#0f0'],
  ['Grep','🔍','#bc8cff'], ['Agent','🤖','#f0f'], ['Web','🌐','#58a6ff'],
];
document.getElementById('legend-items').innerHTML = LEGEND_TOOLS.map(([name, icon, color]) => `
  <div class="legend-item">
    <div class="legend-dot" style="background:${color}"></div>
    ${icon} ${name}
  </div>
`).join('');

// ─── Toast ───────────────────────────────────────────────
function showToast(msg) {
  const area = document.getElementById('toast-area');
  const div  = document.createElement('div');
  div.className = 'toast';
  div.textContent = msg;
  area.appendChild(div);
  setTimeout(() => div.remove(), 3200);
}

function showBadge(id, status) {
  // Flash the sidebar item
  const el = document.querySelector(`.sess-item[data-id="${id}"]`);
  if (!el) return;
  el.style.transition = 'background 0.3s';
  el.style.background = status === 'waiting' ? 'rgba(255,165,0,0.25)' : '';
  setTimeout(() => { el.style.background = ''; }, 1500);
}

// ─── Helpers ─────────────────────────────────────────────
function getPreview(input) {
  if (!input) return '';
  return (input.command || input.file_path || input.pattern || input.query || input.description || (input.prompt || '')).slice(0, 80);
}


function timeAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)   return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  return Math.floor(s / 3600) + 'h ago';
}

function statusColor(s) {
  return s === 'running' ? '#ff0' : s === 'error' ? '#f44' : '#0f0';
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
