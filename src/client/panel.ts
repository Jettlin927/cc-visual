import type { Session, ToolCall, ToolMeta } from '../shared/types.js';
import { TOOL_META, TOOL_DEFAULT } from '../shared/tool-metadata.js';
import { HISTORY_ITEMS } from '../shared/constants.js';
import { prettyProject, fmtDuration, fmtTime, esc } from './utils/formatters.js';
import type { Character } from './character.js';

// ─── Module-private DOM refs ─────────────────────────────

let panelAvatar: HTMLElement;
let panelSession: HTMLElement;
let panelProject: HTMLElement;
let panelTool: HTMLElement;
let panelReply: HTMLElement;
let panelErrorsTitle: HTMLElement;
let panelErrors: HTMLElement;
let panelSlowest: HTMLElement;
let panelHistory: HTMLElement;
let sidePanel: HTMLElement;

export function initPanel(): void {
  panelAvatar  = document.getElementById('panel-avatar')!;
  panelSession = document.getElementById('panel-session')!;
  panelProject = document.getElementById('panel-project')!;
  panelTool    = document.getElementById('panel-tool')!;
  panelReply   = document.getElementById('panel-reply')!;
  panelErrorsTitle = document.getElementById('panel-errors-title')!;
  panelErrors  = document.getElementById('panel-errors')!;
  panelSlowest = document.getElementById('panel-slowest')!;
  panelHistory = document.getElementById('panel-history')!;
  sidePanel    = document.getElementById('side-panel')!;
}

export function showPanel(): void {
  sidePanel.classList.remove('hidden');
}

export function hidePanel(): void {
  sidePanel.classList.add('hidden');
}

function getPreview(input: Record<string, unknown> | undefined): string {
  if (!input) return '';
  return (
    ((input.command || input.file_path || input.pattern || input.query ||
      input.description || (input.prompt || '')) as string)
  ).slice(0, 80);
}

function statusColor(s: string): string {
  return s === 'running' ? '#ff0' : s === 'error' ? '#f44' : '#0f0';
}

export function renderPanel(ch: Character, s: Session): void {
  panelAvatar.innerHTML = '';
  const ac = document.createElement('canvas') as HTMLCanvasElement;
  ch.drawPortrait(ac);
  ac.style.width = '64px';
  ac.style.height = '64px';
  panelAvatar.appendChild(ac);

  panelSession.textContent = ch.id.slice(0, 16) + '...';
  panelProject.textContent = prettyProject(ch.session.project)
    + (ch.session.source === 'codex' && ch.session.model ? ` \u00B7 ${ch.session.model}` : '');

  const tool: ToolCall | null = s?.lastTool || ch.currentTool;
  if (tool) {
    const meta: ToolMeta = TOOL_META[tool.name] || TOOL_DEFAULT;
    panelTool.innerHTML = `
      <div style="color:${meta.color};font-size:10px;margin-bottom:4px">${meta.icon} ${tool.name}</div>
      <div style="color:#888;font-size:7px;word-break:break-all;line-height:1.5">${esc(getPreview(tool.input as Record<string, unknown> | undefined))}</div>
      <div style="color:${statusColor(tool.status)};font-size:7px;margin-top:4px">${tool.status.toUpperCase()}</div>
    `;
  } else {
    panelTool.innerHTML = `<span style="color:#555">IDLE</span>`;
  }
}

export async function fetchHistory(ch: Character): Promise<void> {
  // Reset reply and errors
  panelReply.textContent = '';
  panelErrorsTitle.style.display = 'none';
  panelErrors.innerHTML = '';

  try {
    let allToolCalls: ToolCall[] = [];
    let toolCalls: ToolCall[];
    let lastAssistantText: string | null = null;
    let recentErrors: ToolCall[] = [];

    if (ch.session.source === 'codex') {
      const r = await fetch(`/api/codex-history?threadId=${encodeURIComponent(ch.session.sessionId)}`);
      const d = await r.json();
      allToolCalls = (d.toolCalls || []) as ToolCall[];
      toolCalls = allToolCalls.slice(-HISTORY_ITEMS).reverse();
      recentErrors = toolCalls.filter(tc => tc.status === 'error').slice(0, 3);
    } else {
      const r = await fetch(`/api/transcript?path=${encodeURIComponent(ch.session.filePath)}`);
      const d = await r.json();
      allToolCalls = (d.toolCalls || []) as ToolCall[];
      toolCalls = allToolCalls.slice(-HISTORY_ITEMS).reverse();
      lastAssistantText = (d.lastAssistantText as string | null) ?? null;
      recentErrors = ((d.recentErrors || []) as ToolCall[]);
    }

    // Render last reply
    if (lastAssistantText) {
      const truncated = lastAssistantText.length >= 200
        ? lastAssistantText + '...'
        : lastAssistantText;
      panelReply.textContent = truncated;
    } else {
      panelReply.textContent = 'No reply yet';
    }

    // Render errors
    if (recentErrors.length > 0) {
      panelErrorsTitle.style.display = '';
      panelErrors.innerHTML = recentErrors.map((tc: ToolCall) => {
        const meta: ToolMeta = TOOL_META[tc.name] || TOOL_DEFAULT;
        return `<div class="panel-error-item">${meta.icon} ${esc(tc.name)} — ERROR</div>`;
      }).join('');
    } else {
      panelErrorsTitle.style.display = 'none';
    }

    // Render top 3 slowest
    const slowest = [...allToolCalls]
      .filter(tc => tc.duration != null && tc.duration > 0)
      .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))
      .slice(0, 3);

    if (slowest.length > 0) {
      panelSlowest.innerHTML = slowest.map((tc: ToolCall) => {
        const meta: ToolMeta = TOOL_META[tc.name] || TOOL_DEFAULT;
        return `<div class="ph-item done" style="border-color:${meta.color}">
          <span class="ph-name" style="color:${meta.color}">${meta.icon} ${esc(tc.name)}</span>
          <span class="ph-dur">${fmtDuration(tc.duration)}</span>
          <span class="ph-dur">${fmtTime(tc.timestamp)}</span>
        </div>`;
      }).join('');
    } else {
      panelSlowest.innerHTML = '<div style="font-size:7px;color:#555">No data</div>';
    }

    // Render history
    panelHistory.innerHTML = toolCalls.map((tc: ToolCall) => {
      const meta: ToolMeta = TOOL_META[tc.name] || TOOL_DEFAULT;
      return `<div class="ph-item ${tc.status}" style="border-color:${meta.color}">
        <span class="ph-name" style="color:${meta.color}">${meta.icon} ${tc.name}</span>
        <span class="ph-dur">${fmtDuration(tc.duration)}</span>
      </div>`;
    }).join('');
  } catch { /* ignore fetch errors */ }
}
