import type { Session, SessionSource } from '../shared/types.js';
import { TOOL_META } from '../shared/tool-metadata.js';
import { prettyProject } from './utils/formatters.js';

export interface SidebarCallbacks {
  onSelect: (sessionId: string) => void;
}

// ─── Filter state ───────────────────────────────────────
type StatusFilter = 'all' | 'running' | 'waiting' | 'idle';

let activeStatus: StatusFilter = 'all';
let activeSources: Set<SessionSource> = new Set(['claude', 'codex']);
let searchText = '';

/** Stash latest data so filter UI events can trigger re-render */
let lastList: Session[] = [];
let lastSelected: string | null = null;
let lastCallbacks: SidebarCallbacks | null = null;
let filtersInitialized = false;

// ─── Helpers ────────────────────────────────────────────
function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)   return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  return Math.floor(s / 3600) + 'h ago';
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
function renderFilters(list: Session[]): void {
  const statusRow = document.getElementById('status-filters');
  const sourceRow = document.getElementById('source-filters');
  if (!statusRow || !sourceRow) return;

  const counts = countByStatus(list);

  // Status buttons
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

  // Source buttons
  const sources: { key: SessionSource; label: string }[] = [
    { key: 'claude', label: 'CC' },
    { key: 'codex', label: 'GPT' },
  ];

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

  // Search box — bind once
  if (!filtersInitialized) {
    const searchInput = document.getElementById('filter-search') as HTMLInputElement | null;
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchText = searchInput.value;
        reRender();
      });
    }
    filtersInitialized = true;
  }
}

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

  const filtered = filterSessions(list);
  const order: Record<string, number> = { waiting: 0, running: 1, idle: 2 };
  const sorted = [...filtered].sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2));

  container.innerHTML = '';
  for (const s of sorted) {
    container.appendChild(buildSessionItem(s, selected, callbacks));
  }
}

// ─── Session item builder ───────────────────────────────
function buildSessionItem(s: Session, selected: string | null, callbacks: SidebarCallbacks): HTMLElement {
  const el = document.createElement('div');
  el.className = `sess-item ${s.status}`;
  el.dataset.id = s.sessionId;
  if (s.sessionId === selected) el.classList.add('selected');

  const tool = s.lastTool;
  const toolName = tool ? tool.name : '\u2014';
  const toolMeta = TOOL_META[toolName] || {};
  const toolIcon = (toolMeta as { icon?: string }).icon || '';
  const ago = timeAgo(s.modifiedAt);
  const needsReview = s.status === 'waiting';

  const sourceBadge = s.source === 'codex'
    ? `<span class="source-badge codex" title="${s.model || 'Codex'}">GPT</span>`
    : `<span class="source-badge claude" title="Claude Code">CC</span>`;

  el.innerHTML = `
    <div class="sess-top">
      <span class="sess-status-dot"></span>
      <span class="sess-id">${s.sessionId.slice(0,8)}</span>
      ${sourceBadge}
      ${needsReview ? `<span class="sess-alert" title="Needs your review">\uD83D\uDD14</span>` : ''}
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

  el.addEventListener('click', () => callbacks.onSelect(s.sessionId));
  return el;
}
