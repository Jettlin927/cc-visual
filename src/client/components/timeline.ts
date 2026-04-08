import type { ToolCall } from '../../shared/types.js';
import { getToolColor, fmtDuration } from '../utils/formatters.js';

/**
 * Waterfall timeline — inspired by Chrome DevTools Network panel.
 * Each row = one tool call, ordered chronologically.
 * Bar x-position = actual start time, bar width = duration.
 * Scrollable when content exceeds viewport.
 */

const ROW_H = 18;
const ROW_GAP = 1;
const LABEL_W = 72;
const PAD = 10;
const HEADER_H = 24;
const MIN_BAR_W = 4;
const DURATION_MIN_W = 48;
const SCROLL_SPEED = 36;

export class Timeline {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private items: ToolCall[] = [];
  private t0: number | null = null;
  private W = 0;
  private H = 0;
  private scrollY = 0;
  private maxScrollY = 0;
  private hoverRow = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => { this.hoverRow = -1; });
    this._loop();
  }

  resize(): void {
    const p = this.canvas.parentElement!;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = p.clientWidth * dpr;
    this.canvas.height = p.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = p.clientWidth;
    this.H = p.clientHeight;
  }

  setData(toolCalls: ToolCall[]): void {
    if (!toolCalls.length) return;
    this.items = toolCalls;
    this.t0 = new Date(toolCalls[0].timestamp).getTime();
    this.scrollY = 0;
  }

  /* ── input handlers ─────────────────────────────────── */

  private _onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.scrollY = Math.max(0, Math.min(this.maxScrollY, this.scrollY + (e.deltaY > 0 ? SCROLL_SPEED : -SCROLL_SPEED)));
  }

  private _onMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const y = e.clientY - rect.top - HEADER_H + this.scrollY;
    this.hoverRow = Math.floor(y / (ROW_H + ROW_GAP));
    if (this.hoverRow < 0 || this.hoverRow >= this.items.length) this.hoverRow = -1;
  }

  /* ── render loop ────────────────────────────────────── */

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

    /* ── time range ─────────────────────────────────── */
    const lastEnd = items.reduce((m, i) => {
      const e = i.duration != null
        ? new Date(i.timestamp).getTime() + i.duration
        : now;
      return Math.max(m, e);
    }, t0);
    const totalMs = Math.max(lastEnd - t0, 1000);
    const barAreaX = LABEL_W + PAD;
    const barAreaW = W - barAreaX - PAD;

    /* ── scroll bounds ──────────────────────────────── */
    const contentH = items.length * (ROW_H + ROW_GAP);
    const viewH = H - HEADER_H;
    this.maxScrollY = Math.max(0, contentH - viewH);
    this.scrollY = Math.min(this.scrollY, this.maxScrollY);

    /* ── sticky header: time axis (top) ─────────────── */
    ctx.fillStyle = 'rgba(13,2,33,0.95)';
    ctx.fillRect(0, 0, W, HEADER_H);

    // Time grid lines (vertical, span full height)
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const x = barAreaX + (i / ticks) * barAreaW;
      // Grid line
      ctx.strokeStyle = i === 0 ? '#333' : '#1a1a2e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.floor(x) + 0.5, HEADER_H);
      ctx.lineTo(Math.floor(x) + 0.5, H);
      ctx.stroke();
      // Label
      ctx.fillStyle = '#556';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(fmtDuration(Math.round((i / ticks) * totalMs)), x, HEADER_H - 6);
    }

    // Header bottom border
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_H + 0.5);
    ctx.lineTo(W, HEADER_H + 0.5);
    ctx.stroke();

    /* ── clip to body area ──────────────────────────── */
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEADER_H, W, viewH);
    ctx.clip();

    /* ── rows ───────────────────────────────────────── */
    const firstVisible = Math.floor(this.scrollY / (ROW_H + ROW_GAP));
    const lastVisible = Math.min(items.length - 1, Math.ceil((this.scrollY + viewH) / (ROW_H + ROW_GAP)));

    for (let i = firstVisible; i <= lastVisible; i++) {
      const item = items[i];
      const rowY = HEADER_H + i * (ROW_H + ROW_GAP) - this.scrollY;

      const start = new Date(item.timestamp).getTime() - t0;
      const end = item.duration != null ? start + item.duration : now - t0;
      const dur = end - start;
      const x = barAreaX + (start / totalMs) * barAreaW;
      const w = Math.max(MIN_BAR_W, (dur / totalMs) * barAreaW);
      const color = getToolColor(item.name);
      const isRunning = item.status === 'running';
      const isHover = i === this.hoverRow;

      // Row background (alternating + hover)
      if (isHover) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(0, rowY, W, ROW_H);
      } else if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        ctx.fillRect(0, rowY, W, ROW_H);
      }

      // Row index (subtle)
      ctx.fillStyle = '#333';
      ctx.font = '7px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(String(i + 1), 16, rowY + ROW_H / 2 + 3);

      // Tool label
      ctx.fillStyle = color;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(item.name.slice(0, 7), LABEL_W - 4, rowY + ROW_H / 2 + 3);

      // Waterfall bar — solid fill (no full-width track)
      ctx.fillStyle = color + (isRunning ? '99' : 'bb');
      ctx.fillRect(Math.floor(x), rowY + 3, Math.ceil(w), ROW_H - 6);

      // Running flash animation
      if (isRunning) {
        const flash = Math.sin(now / 300) * 0.3 + 0.3;
        ctx.fillStyle = color + Math.round(flash * 255).toString(16).padStart(2, '0');
        ctx.fillRect(Math.floor(x), rowY + 3, Math.ceil(w), ROW_H - 6);
      }

      // Bar border
      ctx.strokeStyle = color + '88';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.floor(x) + 0.5, rowY + 3.5, Math.ceil(w) - 1, ROW_H - 7);

      // Duration text — pick side based on available space
      const durText = fmtDuration(dur);
      const barEnd = Math.floor(x) + Math.ceil(w);
      const spaceRight = W - PAD - barEnd;
      ctx.font = '8px monospace';
      const textW = ctx.measureText(durText).width + 6;

      if (w > DURATION_MIN_W) {
        // Fits inside bar
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.fillText(durText, Math.floor(x) + 4, rowY + ROW_H / 2 + 3);
      } else if (spaceRight >= textW) {
        // Show right of bar
        ctx.fillStyle = '#aaa';
        ctx.textAlign = 'left';
        ctx.fillText(durText, barEnd + 4, rowY + ROW_H / 2 + 3);
      } else {
        // No room on right — show left of bar
        ctx.fillStyle = '#aaa';
        ctx.textAlign = 'right';
        ctx.fillText(durText, Math.floor(x) - 4, rowY + ROW_H / 2 + 3);
      }

      // Error indicator
      if (item.status === 'error') {
        ctx.fillStyle = '#f44';
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.textAlign = 'left';
        ctx.fillText('!', Math.floor(x + w) + 3, rowY + ROW_H / 2 + 3);
      }
    }

    ctx.restore();

    /* ── scrollbar ──────────────────────────────────── */
    if (this.maxScrollY > 0) {
      const trackH = viewH;
      const thumbH = Math.max(20, (viewH / contentH) * trackH);
      const thumbY = HEADER_H + (this.scrollY / this.maxScrollY) * (trackH - thumbH);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(W - 5, HEADER_H, 4, trackH);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(W - 5, thumbY, 4, thumbH);
    }

    /* ── summary bar (bottom) ───────────────────────── */
    const sumY = H - 16;
    ctx.fillStyle = 'rgba(13,2,33,0.9)';
    ctx.fillRect(0, sumY - 2, W, 18);
    ctx.fillStyle = '#556';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(
      `${items.length} calls · ${fmtDuration(totalMs)} total`,
      PAD,
      sumY + 9,
    );
    // Scroll hint
    if (this.maxScrollY > 0) {
      ctx.textAlign = 'right';
      ctx.fillText(
        `${firstVisible + 1}–${lastVisible + 1} of ${items.length}`,
        W - PAD,
        sumY + 9,
      );
    }
  }
}
