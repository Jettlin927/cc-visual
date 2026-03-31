import { fmtTime, fmtDuration, inputPreview, getToolClass, truncate } from '../utils/formatters.js';

export class EventStream {
  constructor(container, countEl) {
    this.container = container;
    this.countEl = countEl;
    this.count = 0;
  }

  setData(toolCalls) {
    this.container.innerHTML = '';
    this.count = 0;

    // Reverse so newest first
    const items = [...toolCalls].reverse();
    for (const tc of items) {
      this._addItem(tc);
    }
    this.count = toolCalls.length;
    this.countEl.textContent = this.count;
  }

  _addItem(tc) {
    const el = document.createElement('div');
    el.className = 'ev';
    el.dataset.tool = tc.name;

    const statusClass = tc.status;
    const statusText = tc.status === 'running' ? 'RUN' : tc.status === 'error' ? 'ERR' : 'OK';
    const nameClass = getToolClass(tc.name);
    const preview = inputPreview(tc.input);
    const dur = tc.duration != null ? fmtDuration(tc.duration) : '...';

    el.innerHTML = `
      <div class="ev-head">
        <span class="ev-badge ${statusClass}">${statusText}</span>
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

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
