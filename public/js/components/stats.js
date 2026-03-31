import { getToolColor } from '../utils/formatters.js';

export class Stats {
  constructor() {
    this.totalEl = document.getElementById('stat-total');
    this.runningEl = document.getElementById('stat-running');
    this.errorsEl = document.getElementById('stat-errors');
    this.barCanvas = document.getElementById('bar-chart');
    this.barCtx = this.barCanvas.getContext('2d');
    this.breakdownEl = document.getElementById('tool-breakdown');
  }

  update(toolCalls) {
    const total = toolCalls.length;
    const running = toolCalls.filter(t => t.status === 'running').length;
    const errors = toolCalls.filter(t => t.status === 'error').length;

    this.totalEl.textContent = total;
    this.runningEl.textContent = running;
    this.errorsEl.textContent = errors;

    // Count by tool
    const counts = {};
    for (const tc of toolCalls) {
      counts[tc.name] = (counts[tc.name] || 0) + 1;
    }

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const maxCount = sorted.length ? sorted[0][1] : 1;

    // Breakdown list
    this.breakdownEl.innerHTML = sorted.map(([name, count]) => {
      const color = getToolColor(name);
      const pct = (count / maxCount) * 100;
      return `
        <div class="tb-row">
          <div class="tb-color" style="background:${color}"></div>
          <span class="tb-name">${name}</span>
          <span class="tb-count">${count}</span>
          <div class="tb-bar-wrap"><div class="tb-bar" style="width:${pct}%;background:${color}"></div></div>
        </div>
      `;
    }).join('');

    // Bar chart on canvas
    this._drawBars(sorted);
  }

  _drawBars(sorted) {
    const canvas = this.barCanvas;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement?.clientWidth || 220;
    canvas.width = w * dpr;
    canvas.height = 120 * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = '120px';

    const ctx = this.barCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, 120);

    if (!sorted.length) return;

    const max = sorted[0][1];
    const barW = Math.max(8, Math.floor((w - 20) / sorted.length) - 4);
    const chartH = 90;

    sorted.forEach(([name, count], i) => {
      const x = 10 + i * (barW + 4);
      const h = (count / max) * chartH;
      const y = chartH - h + 10;
      const color = getToolColor(name);

      // Pixel-style bar
      ctx.fillStyle = color + '88';
      ctx.fillRect(x, y, barW, h);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, barW - 1, h - 1);

      // Label
      ctx.fillStyle = '#888';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(x + barW / 2, chartH + 18);
      ctx.rotate(-0.5);
      ctx.fillText(name.slice(0, 5), 0, 0);
      ctx.restore();

      // Count on top
      ctx.fillStyle = color;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(count), x + barW / 2, y - 4);
    });
  }
}
