import type { Session, SessionSource, SessionStatus } from '../shared/types.js';
import { TOOL_META } from '../shared/tool-metadata.js';
import { prettyProject, focusWindow } from './utils/formatters.js';

export interface SidebarCallbacks {
  onSelect: (sessionId: string) => void;
}

// ─── Filter state ───────────────────────────────────────
type StatusFilter = SessionStatus | 'all';

let activeStatus: StatusFilter = 'all';
let activeSources: Set<SessionSource> = new Set(['claude', 'codex']);
let searchText = '';
let groupByProject = false;
const collapsedGroups: Set<string> = new Set();

/** Stash latest data so filter UI events can trigger re-render */
let lastList: Session[] = [];
let lastSelected: string | null = null;
let lastCallbacks: SidebarCallbacks | null = null;
let filtersInitialized = false;
let timerStarted = false;

// ─── Seen sessions (localStorage) ──────────────────────
const SEEN_KEY = 'cc-visual-seen-sessions';

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

function saveSeen(set: Set<string>): void {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...set]));
}

const seenSessions: Set<string> = loadSeen();
let seenDirty = false;

// ─── Pinned sessions (localStorage) ────────────────────
const PIN_KEY = 'cc-visual-pinned-sessions';

function loadPinned(): Set<string> {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

function savePinned(set: Set<string>): void {
  localStorage.setItem(PIN_KEY, JSON.stringify([...set]));
}

const pinnedSessions: Set<string> = loadPinned();

export function togglePin(sessionId: string): void {
  if (pinnedSessions.has(sessionId)) {
    pinnedSessions.delete(sessionId);
  } else {
    pinnedSessions.add(sessionId);
  }
  savePinned(pinnedSessions);
  reRender();
}

export function isPinned(sessionId: string): boolean {
  return pinnedSessions.has(sessionId);
}

// ─── Helpers ────────────────────────────────────────────
function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)   return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  return Math.floor(s / 3600) + 'h ago';
}

function waitedMinutes(ms: number): number {
  return Math.floor((Date.now() - ms) / 60000);
}

function waitedLabel(ms: number): string {
  const m = waitedMinutes(ms);
  if (m < 1) return 'just now';
  return `waited ${m}m`;
}

function filterSessions(list: Session[]): Session[] {
  return list.filter(s => {
    if (activeStatus !== 'all' && s.status !== activeStatus) return false;
    if (!activeSources.has(s.source)) return false;
    if (searchText) {
      const needle = searchText.toLowerCase();
      const haystack = [
        s.sessionId,
        s.project,
        s.lastTool?.name ?? '',
      ].join(' ').toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

function countByStatus(list: Session[]): Record<string, number> {
  const counts: Record<string, number> = { running: 0, waiting: 0, idle: 0 };
  for (const s of list) {
    counts[s.status] = (counts[s.status] ?? 0) + 1;
  }
  return counts;
}

// ─── Filter bar rendering ───────────────────────────────
let prevFilterFingerprint = '';

function renderFilters(list: Session[]): void {
  const statusRow = document.getElementById('status-filters');
  const sourceRow = document.getElementById('source-filters');
  if (!statusRow || !sourceRow) return;

  const counts = countByStatus(list);

  // Skip DOM rebuild if nothing changed
  const fingerprint = `${list.length}|${counts.running}|${counts.waiting}|${counts.idle}|${activeStatus}|${[...activeSources].join(',')}|${groupByProject}`;
  const needsRebuild = fingerprint !== prevFilterFingerprint;
  prevFilterFingerprint = fingerprint;

  if (needsRebuild) {
    const statuses: { key: StatusFilter; label: string }[] = [
      { key: 'all', label: 'ALL' },
      { key: 'running', label: 'RUN' },
      { key: 'waiting', label: 'WAIT' },
      { key: 'idle', label: 'IDLE' },
    ];

    statusRow.innerHTML = '';
    for (const { key, label } of statuses) {
      const btn = document.createElement('button');
      btn.className = 'filter-btn' + (activeStatus === key ? ' active' : '');
      const count = key === 'all' ? list.length : (counts[key] ?? 0);
      btn.innerHTML = `${label}<span class="filter-badge">${count}</span>`;
      btn.addEventListener('click', () => {
        activeStatus = key;
        reRender();
      });
      statusRow.appendChild(btn);
    }

    const sources: { key: SessionSource; label: string }[] = [
      { key: 'claude', label: 'CC' },
      { key: 'codex', label: 'GPT' },
    ];

    const existingGrp = document.getElementById('group-toggle');
    sourceRow.innerHTML = '';

    for (const { key, label } of sources) {
      const btn = document.createElement('button');
      btn.className = 'filter-btn' + (activeSources.has(key) ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        if (activeSources.has(key)) {
          if (activeSources.size > 1) activeSources.delete(key);
        } else {
          activeSources.add(key);
        }
        reRender();
      });
      sourceRow.appendChild(btn);
    }

    if (existingGrp) {
      existingGrp.className = 'filter-btn' + (groupByProject ? ' active' : '');
      sourceRow.appendChild(existingGrp);
    }
  }

  // Bind one-time event listeners
  if (!filtersInitialized) {
    const searchInput = document.getElementById('filter-search') as HTMLInputElement | null;
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchText = searchInput.value;
        reRender();
      });
    }

    const grpBtn = document.getElementById('group-toggle');
    if (grpBtn) {
      grpBtn.addEventListener('click', () => {
        groupByProject = !groupByProject;
        reRender();
      });
    }

    filtersInitialized = true;
  }

  // Start 30s timer for wait-time updates (once)
  if (!timerStarted) {
    timerStarted = true;
    setInterval(() => {
      reRender();
    }, 30000);
  }
}

// HUD waiting badge is now managed by game.ts reconcileSessions

function reRender(): void {
  if (!lastCallbacks) return;
  const container = document.getElementById('session-list');
  if (!container) return;
  renderSessionList(container, lastList, lastSelected, lastCallbacks);
}

// ─── Main render ────────────────────────────────────────
export function renderSessionList(
  container: HTMLElement,
  list: Session[],
  selected: string | null,
  callbacks: SidebarCallbacks,
): void {
  lastList = list;
  lastSelected = selected;
  lastCallbacks = callbacks;

  renderFilters(list);

  // Clean stale seen entries using a Set for O(1) lookup
  const waitingIds = new Set(list.filter(s => s.status === 'waiting').map(s => s.sessionId));
  for (const id of seenSessions) {
    if (!waitingIds.has(id)) {
      seenSessions.delete(id);
      seenDirty = true;
    }
  }
  if (seenDirty) {
    saveSeen(seenSessions);
    seenDirty = false;
  }

  const filtered = filterSessions(list);

  // Single-pass partition into waiting, pinned, and other
  const waitingSessions: Session[] = [];
  const pinned: Session[] = [];
  const otherSessions: Session[] = [];
  for (const s of filtered) {
    if (s.status === 'waiting') {
      waitingSessions.push(s);
    } else if (pinnedSessions.has(s.sessionId)) {
      pinned.push(s);
    } else {
      otherSessions.push(s);
    }
  }

  waitingSessions.sort((a, b) => a.modifiedAt - b.modifiedAt);
  const order: Record<string, number> = { running: 0, idle: 1 };
  otherSessions.sort((a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1));

  container.innerHTML = '';
  if (pinned.length > 0) {
    const pinSection = document.createElement('div');
    pinSection.className = 'pending-section';
    const pinHeader = document.createElement('div');
    pinHeader.className = 'pending-header';
    pinHeader.style.color = 'var(--cyan)';
    pinHeader.style.background = 'rgba(0,255,255,0.08)';
    pinHeader.style.borderColor = 'rgba(0,255,255,0.3)';
    pinHeader.innerHTML = `<span>📌 PINNED</span><span class="pending-header-count" style="background:var(--cyan);color:#000">${pinned.length}</span>`;
    pinSection.appendChild(pinHeader);
    for (const s of pinned) {
      pinSection.appendChild(buildSessionItem(s, selected, callbacks, false));
    }
    container.appendChild(pinSection);
  }

  // ── Pending section ──────────────────────────────────
  if (waitingSessions.length > 0) {
    const pendingSection = document.createElement('div');
    pendingSection.className = 'pending-section';

    const header = document.createElement('div');
    header.className = 'pending-header';
    header.innerHTML = `
      <span>&#9650; PENDING</span>
      <span class="pending-header-count">${waitingSessions.length}</span>
    `;
    pendingSection.appendChild(header);

    for (const s of waitingSessions) {
      pendingSection.appendChild(buildSessionItem(s, selected, callbacks, true));
    }

    container.appendChild(pendingSection);
  }

  // ── Non-waiting sessions ─────────────────────────────
  if (groupByProject) {
    // Group by project name
    const groups: Map<string, Session[]> = new Map();
    for (const s of otherSessions) {
      const key = prettyProject(s.project);
      const existing = groups.get(key);
      if (existing) {
        existing.push(s);
      } else {
        groups.set(key, [s]);
      }
    }

    for (const [projectName, sessions] of groups) {
      const isCollapsed = collapsedGroups.has(projectName);

      const groupHeader = document.createElement('div');
      groupHeader.className = 'group-header' + (isCollapsed ? ' collapsed' : '');
      groupHeader.innerHTML = `
        <span class="group-header-arrow">&#9660;</span>
        <span class="group-header-name">${projectName}</span>
        <span class="group-header-count">${sessions.length}</span>
      `;
      groupHeader.addEventListener('click', () => {
        if (collapsedGroups.has(projectName)) {
          collapsedGroups.delete(projectName);
        } else {
          collapsedGroups.add(projectName);
        }
        reRender();
      });
      container.appendChild(groupHeader);

      if (!isCollapsed) {
        for (const s of sessions) {
          container.appendChild(buildSessionItem(s, selected, callbacks, false));
        }
      }
    }
  } else {
    // Flat list
    for (const s of otherSessions) {
      container.appendChild(buildSessionItem(s, selected, callbacks, false));
    }
  }
}

// ─── Session item builder ───────────────────────────────
function buildSessionItem(
  s: Session,
  selected: string | null,
  callbacks: SidebarCallbacks,
  isPending: boolean,
): HTMLElement {
  const el = document.createElement('div');
  const isWarn = isPending && waitedMinutes(s.modifiedAt) >= 5;
  el.className = `sess-item ${s.status}` + (isWarn ? ' pending-warn' : '') + (isPending ? ' waiting-pulse' : '');
  el.dataset.id = s.sessionId;
  if (s.sessionId === selected) el.classList.add('selected');

  const tool = s.lastTool;
  const toolName = tool ? tool.name : '\u2014';
  const toolMeta = TOOL_META[toolName] || {};
  const toolIcon = (toolMeta as { icon?: string }).icon || '';
  const ago = timeAgo(s.modifiedAt);

  // Two-line layout:
  // Line 1: ● project-name    STATUS  [▶]
  // Line 2: waited 5 min  OR  Edit · 42 calls · 3m ago
  const line2 = isPending
    ? `<span class="sess-waited">${waitedLabel(s.modifiedAt)}</span>`
    : `<span class="sess-tool">${toolIcon} ${toolName}</span> · <span class="sess-count">${s.toolCount ?? 0} calls</span> · <span class="sess-ago">${ago}</span>`;

  el.innerHTML = `
    <div class="sess-top">
      <span class="sess-status-dot"></span>
      <span class="sess-project">${prettyProject(s.project)}</span>
      <span class="sess-badge ${s.status}">${s.status.toUpperCase()}</span>
    </div>
    <div class="sess-meta">${line2}</div>
  `;

  // Add jump button for waiting sessions
  if (isPending) {
    const jumpBtn = document.createElement('button');
    jumpBtn.className = 'sess-jump-btn';
    jumpBtn.textContent = '\u25B6';
    jumpBtn.title = 'Focus window';
    jumpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void focusSessionWindow(s);
    });
    const topRow = el.querySelector('.sess-top');
    if (topRow) topRow.appendChild(jumpBtn);
  }

  el.addEventListener('click', () => callbacks.onSelect(s.sessionId));
  return el;
}

async function focusSessionWindow(s: Session): Promise<void> {
  const { showToast } = await import('./notifications.js');
  try {
    const pid = 'pid' in s && typeof s.pid === 'number' ? s.pid : undefined;
    const msg = await focusWindow({ pid, project: s.project });
    showToast(msg);
  } catch (err) {
    showToast(`\u2717 Focus failed: ${err instanceof Error ? err.message : 'network error'}`);
  }
}
