import type { Session } from '../shared/types.js';
import { TOOL_META } from '../shared/tool-metadata.js';
import { prettyProject } from './utils/formatters.js';

export interface SidebarCallbacks {
  onSelect: (sessionId: string) => void;
}

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)   return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  return Math.floor(s / 3600) + 'h ago';
}

export function renderSessionList(
  container: HTMLElement,
  list: Session[],
  selected: string | null,
  callbacks: SidebarCallbacks,
): void {
  const order: Record<string, number> = { waiting: 0, running: 1, idle: 2 };
  const sorted = [...list].sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2));

  container.innerHTML = '';
  for (const s of sorted) {
    container.appendChild(buildSessionItem(s, selected, callbacks));
  }
}

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
