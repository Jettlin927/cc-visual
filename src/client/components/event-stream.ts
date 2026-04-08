import type { ToolCall } from '../../shared/types.js';
import { fmtTime, fmtDuration, inputPreview, getToolClass, truncate } from '../utils/formatters.js';

function esc(s: string): string {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export class EventStream {
  private container: HTMLElement;
  private countEl: HTMLElement;
  private count: number = 0;

  constructor(container: HTMLElement, countEl: HTMLElement) {
    this.container = container;
    this.countEl = countEl;
  }

  setData(toolCalls: ToolCall[]): void {
    this.container.innerHTML = '';
    this.count = 0;

    const items = [...toolCalls].reverse();
    for (const tc of items) {
      this._addItem(tc);
    }
    this.count = toolCalls.length;
    this.countEl.textContent = String(this.count);
  }

  private _addItem(tc: ToolCall): void {
    const el = document.createElement('div');
    el.className = 'ev';
    el.dataset.tool = tc.name;

    const statusText = tc.status === 'running' ? 'RUN' : tc.status === 'error' ? 'ERR' : 'OK';
    const nameClass = getToolClass(tc.name);
    const preview = inputPreview(tc.input as Record<string, unknown> | undefined);
    const dur = tc.duration != null ? fmtDuration(tc.duration) : '...';

    el.innerHTML = `
      <div class="ev-head">
        <span class="ev-badge ${tc.status}">${statusText}</span>
        <span class="ev-name ${nameClass}">${esc(tc.name)}</span>
        <span class="ev-time">${fmtTime(tc.timestamp)} ${dur}</span>
      </div>
      ${preview ? `<div class="ev-preview">${esc(truncate(preview, 100))}</div>` : ''}
      <div class="ev-detail">${esc(JSON.stringify(tc.input, null, 2))}</div>
    `;

    el.addEventListener('click', () => el.classList.toggle('open'));
    this.container.appendChild(el);
  }
}
