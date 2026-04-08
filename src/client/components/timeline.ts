import type { ToolCall } from '../../shared/types.js';
import { getToolColor, fmtDuration } from '../utils/formatters.js';

const ROW_H = 24;
const GAP = 3;
const LABEL_W = 70;
const PAD = 12;

export class Timeline {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private items: ToolCall[] = [];
  private t0: number | null = null;
  private W: number = 0;
  private H: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this._loop();
  }

  resize(): void {
    const w = this.canvas.parentElement!;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w.clientWidth * dpr;
    this.canvas.height = w.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w.clientWidth;
    this.H = w.clientHeight;
  }

  setData(toolCalls: ToolCall[]): void {
    if (!toolCalls.length) return;
    this.items = toolCalls;
    this.t0 = new Date(toolCalls[0].timestamp).getTime();
  }

  private _loop(): void {
    requestAnimationFrame(() => this._loop());
    const { ctx, W, H, items, t0 } = this;
    ctx.clearRect(0, 0, W, H);

    if (!items.length || !t0) {
      ctx.fillStyle = '#666';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('WAITING FOR DATA...', W / 2, H / 2);
      return;
    }

    const now = Date.now();
    const lastEnd = items.reduce((m, i) => {
      const e = i.duration != null
        ? new Date(i.timestamp).getTime() + i.duration
        : now;
      return Math.max(m, e);
    }, t0);
    const totalMs = Math.max(lastEnd - t0, 1000);
    const barW = W - LABEL_W - PAD * 2;

    const maxRows = Math.floor((H - PAD * 2 - 20) / (ROW_H + GAP));
    const visible = items.slice(-maxRows);

    visible.forEach((item, i) => {
      const y = PAD + i * (ROW_H + GAP);
      const start = new Date(item.timestamp).getTime() - t0;
      const end = item.duration != null
        ? start + item.duration
        : now - t0;
      const x = LABEL_W + PAD + (start / totalMs) * barW;
      const w = Math.max(3, ((end - start) / totalMs) * barW);
      const color = getToolColor(item.name);
      const isRunning = item.status === 'running';

      // Label
      ctx.fillStyle = color;
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(item.name.slice(0, 7), LABEL_W, y + ROW_H / 2 + 3);

      // Bar
      ctx.fillStyle = color + '44';
      ctx.fillRect(Math.floor(x), y, Math.ceil(w), ROW_H);
      ctx.fillStyle = color + (isRunning ? 'aa' : 'cc');
      ctx.fillRect(Math.floor(x), y, Math.ceil(w), ROW_H);

      // Border
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.floor(x) + 0.5, y + 0.5, Math.ceil(w) - 1, ROW_H - 1);

      // Running flash
      if (isRunning) {
        const flash = Math.sin(now / 300) * 0.3 + 0.3;
        ctx.fillStyle = color + Math.round(flash * 255).toString(16).padStart(2, '0');
        ctx.fillRect(Math.floor(x), y, Math.ceil(w), ROW_H);
      }

      // Duration text
      const dur = end - start;
      if (w > 50) {
        ctx.fillStyle = '#fff';
        ctx.font = '8px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(fmtDuration(dur), Math.floor(x) + 4, y + ROW_H / 2 + 3);
      }

      // Error indicator
      if (item.status === 'error') {
        ctx.fillStyle = '#f44';
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.textAlign = 'left';
        ctx.fillText('!', Math.floor(x + w) + 4, y + ROW_H / 2 + 3);
      }
    });

    // Time axis
    const axY = H - 12;
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(LABEL_W + PAD, axY);
    ctx.lineTo(W - PAD, axY);
    ctx.stroke();

    ctx.fillStyle = '#555';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const x = LABEL_W + PAD + (i / 4) * barW;
      ctx.fillText(fmtDuration(Math.round((i / 4) * totalMs)), x, axY - 2);
    }
  }
}
