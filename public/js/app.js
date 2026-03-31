import { initParticles } from './components/particles.js';
import { drawLogo } from './components/pixel-logo.js';
import { Timeline } from './components/timeline.js';
import { EventStream } from './components/event-stream.js';
import { Stats } from './components/stats.js';
import { FileWatcher } from './utils/sse-client.js';
import { fmtElapsed, prettyProject, fmtSize } from './utils/formatters.js';

// ---- Init decorations ----
initParticles(document.getElementById('particles'));
drawLogo(document.getElementById('logo-canvas'));

// ---- State ----
let currentFile = null;
let watcher = null;
let lastLineCount = 0;
let sessionStartTime = null;
let timerInterval = null;

// ---- Elements ----
const sessionPicker = document.getElementById('session-picker');
const sessionList = document.getElementById('session-list');
const dashboard = document.getElementById('dashboard');
const sessionLabel = document.getElementById('session-label');
const statusBadge = document.getElementById('status-indicator');
const timerEl = document.getElementById('timer');
const refreshBtn = document.getElementById('refresh-btn');

// ---- Components ----
const timeline = new Timeline(document.getElementById('timeline-canvas'));
const eventStream = new EventStream(
  document.getElementById('event-list'),
  document.getElementById('event-count')
);
const stats = new Stats();

// ---- Load sessions ----
async function loadSessions() {
  sessionList.innerHTML = '<div class="loading-text">LOADING...</div>';
  try {
    const res = await fetch('/api/projects');
    const projects = await res.json();

    if (!projects.length) {
      sessionList.innerHTML = '<div class="loading-text">NO SESSIONS FOUND</div>';
      return;
    }

    sessionList.innerHTML = '';
    for (const p of projects) {
      const item = document.createElement('div');
      item.className = 'session-item';

      const time = new Date(p.modifiedAt);
      const timeStr = time.toLocaleString();

      item.innerHTML = `
        <span class="session-id">${p.sessionId.slice(0, 8)}</span>
        <span class="session-project">${prettyProject(p.project)}</span>
        <span class="session-size">${fmtSize(p.size)}</span>
        <span class="session-time">${timeStr}</span>
      `;

      item.addEventListener('click', () => selectSession(p));
      sessionList.appendChild(item);
    }
  } catch (err) {
    sessionList.innerHTML = `<div class="loading-text">ERROR: ${err.message}</div>`;
  }
}

// ---- Select & watch a session ----
async function selectSession(project) {
  currentFile = project.filePath;
  lastLineCount = 0;

  sessionPicker.style.display = 'none';
  dashboard.classList.remove('hidden');

  sessionLabel.textContent = prettyProject(project.project) + ' / ' + project.sessionId.slice(0, 8);
  statusBadge.className = 'pixel-badge online';
  statusBadge.textContent = 'LIVE';

  sessionStartTime = Date.now();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timerEl.textContent = fmtElapsed(sessionStartTime);
  }, 1000);

  // Initial load
  await fetchTranscript();

  // Watch for changes
  if (watcher) watcher.stop();
  watcher = new FileWatcher(currentFile);
  watcher.onChange = () => fetchTranscript();
  watcher.start();
}

// ---- Fetch & parse transcript ----
async function fetchTranscript() {
  if (!currentFile) return;

  try {
    const res = await fetch(`/api/transcript?path=${encodeURIComponent(currentFile)}&offset=0`);
    const data = await res.json();

    if (data.totalLines === lastLineCount) return;
    lastLineCount = data.totalLines;

    const toolCalls = data.toolCalls || [];

    // Update all components
    timeline.setData(toolCalls);
    eventStream.setData(toolCalls);
    stats.update(toolCalls);

    // Update agents
    updateAgents(toolCalls);

  } catch (err) {
    console.error('Fetch error:', err);
  }
}

// ---- Agents ----
function updateAgents(toolCalls) {
  const tree = document.getElementById('agent-tree');
  const agents = toolCalls.filter(tc => tc.name === 'Agent');

  if (!agents.length) {
    tree.innerHTML = '<div class="loading-text" style="animation:none;font-size:8px">NO AGENTS YET</div>';
    return;
  }

  tree.innerHTML = '';
  for (const a of agents) {
    const chip = document.createElement('div');
    chip.className = `agent-chip ${a.status === 'done' ? 'done' : ''}`;
    const desc = a.input?.description || a.input?.subagent_type || 'agent';
    chip.innerHTML = `
      <span class="agent-dot"></span>
      ${esc(desc)}
    `;
    tree.appendChild(chip);
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// ---- Refresh button ----
refreshBtn.addEventListener('click', () => {
  if (currentFile) {
    fetchTranscript();
  } else {
    loadSessions();
  }
});

// ---- Back to session picker on logo click ----
document.querySelector('.header-left').addEventListener('click', () => {
  if (watcher) watcher.stop();
  dashboard.classList.add('hidden');
  sessionPicker.style.display = '';
  statusBadge.className = 'pixel-badge offline';
  statusBadge.textContent = 'OFFLINE';
  currentFile = null;
  loadSessions();
});

// ---- Start ----
loadSessions();
