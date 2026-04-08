import { Direction } from '../shared/types.js';
import type { Session, ToolCall, TileMap, ToolMeta } from '../shared/types.js';
import { TILE_SIZE } from '../shared/constants.js';
import { TOOL_META, TOOL_DEFAULT } from '../shared/tool-metadata.js';
import { isWalkable, ZONES, getZoneTarget } from './world.js';
import { inputPreview } from './utils/formatters.js';
import { prettyProject } from './utils/formatters.js';

export { TOOL_META };

// ─── Module-private helpers ──────────────────────────────

function mkRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

// ── Curated palette arrays ──
const SKIN_TONES = ['#fce4c0', '#f5d0a9', '#e8b88a', '#d4a373', '#c08a5c', '#a0704a', '#8b5e3c', '#6b4226'];
const HAIR_COLORS = ['#2c1810', '#4a2c17', '#8b4513', '#654321', '#d4a76a', '#c4944a', '#1a1a2e', '#3d1c02'];
const SHIRT_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c',
  '#e67e22', '#5dade2', '#48c9b0', '#f1948a', '#85c1e9', '#82e0aa',
];
const EYE_COLORS = ['#222', '#2c5aa0', '#2a7a3a', '#6b3a2a'];

// ─── Character class ─────────────────────────────────────

export class Character {
  session: Session;
  map: TileMap;
  id: string;

  // Appearance
  skinColor: string;
  shirtColor: string;
  hairColor: string;
  hairStyle: number;
  eyeColor: string;

  // Position
  x: number;
  y: number;
  tx: number;
  ty: number;
  targetX: number;
  targetY: number;
  path: null | unknown[];
  moving: boolean;
  speed: number;

  // Animation
  walkFrame: number;
  walkTime: number;
  dir: Direction;
  bobOffset: number;
  waveAngle: number;

  // Source
  isCodex: boolean;

  // Tool state
  currentTool: ToolCall | null;
  bubbleAlpha: number;
  bubbleScale: number;
  selected: boolean;

  // Tool action animation
  actionTime: number;

  displayLabel: string;

  private rng: () => number;

  constructor(session: Session, map: TileMap) {
    this.session = session;
    this.map = map;
    this.id = session.sessionId;

    const seed = hashStr(this.id);
    this.rng = mkRng(seed);

    // Deterministic appearance from palettes
    this.skinColor  = SKIN_TONES[Math.floor(this.rng() * SKIN_TONES.length)];
    this.shirtColor = SHIRT_COLORS[Math.floor(this.rng() * SHIRT_COLORS.length)];
    this.hairColor  = HAIR_COLORS[Math.floor(this.rng() * HAIR_COLORS.length)];
    this.hairStyle  = Math.floor(this.rng() * 4);
    this.eyeColor   = EYE_COLORS[Math.floor(this.rng() * 4)];

    // Position — spawn at rest zone
    const spawn = ZONES.rest;
    this.x  = spawn.tx * TILE_SIZE + TILE_SIZE / 2;
    this.y  = spawn.ty * TILE_SIZE + TILE_SIZE / 2;
    this.tx = spawn.tx;
    this.ty = spawn.ty;

    // Movement
    this.targetX = this.x;
    this.targetY = this.y;
    this.path = null;
    this.moving = false;
    this.speed = 70 + this.rng() * 20;

    // Animation
    this.walkFrame = 0;
    this.walkTime  = 0;
    this.dir = Direction.DOWN;
    this.bobOffset = 0;
    this.waveAngle = 0;

    // Source
    this.isCodex = session.source === 'codex';

    // Tool state
    this.currentTool = session.lastTool || null;
    this.bubbleAlpha = 0;
    this.bubbleScale = 0;
    this.selected = false;

    // Tool action animation
    this.actionTime = 0;

    this.displayLabel = this._computeLabel();
    this._navigateToZone();
  }

  private _navigateToZone(): void {
    const zone = getZoneTarget(this.currentTool?.name, this.session.status);
    this.targetX = zone.tx * TILE_SIZE + TILE_SIZE / 2;
    this.targetY = zone.ty * TILE_SIZE + TILE_SIZE / 2;
    this.moving = true;
  }

  pickNewTarget(): void {
    this._navigateToZone();
  }

  update(dt: number, t: number): void {
    this.walkTime += dt;
    this.actionTime += dt;

    if (this.moving) {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 3) {
        this.x = this.targetX;
        this.y = this.targetY;
        this.moving = false;
      } else {
        const step = Math.min(this.speed * dt, dist);
        const nx = this.x + (dx / dist) * step;
        const ny = this.y + (dy / dist) * step;

        if (Math.abs(dx) > Math.abs(dy)) {
          this.dir = dx > 0 ? Direction.RIGHT : Direction.LEFT;
        } else {
          this.dir = dy > 0 ? Direction.DOWN : Direction.UP;
        }

        const ntx = Math.floor(nx / TILE_SIZE);
        const nty = Math.floor(ny / TILE_SIZE);
        if (isWalkable(this.map, ntx, nty)) {
          this.x = nx;
          this.y = ny;
          this.tx = ntx;
          this.ty = nty;
        } else {
          // Teleport to target on collision (room is small)
          this.x = this.targetX;
          this.y = this.targetY;
          this.moving = false;
        }

        if (this.walkTime > 0.125) {
          this.walkFrame = (this.walkFrame + 1) % 4;
          this.walkTime = 0;
        }
      }
    } else {
      this.walkFrame = 0;
      const status = this.session.status;

      if (status === 'waiting') {
        this.waveAngle = Math.sin(t / 400) * 0.5;
        this.bobOffset = 0;
        this.dir = Direction.DOWN;
      } else if (status === 'idle') {
        this.bobOffset = Math.sin(t / 1400) * 1.5;
      } else {
        // Working — face furniture (UP)
        this.dir = Direction.UP;
        this.bobOffset = Math.sin(t / 600) * 0.5;
      }
    }

    // Bubble animation
    if (this.currentTool && this.currentTool.status === 'running') {
      this.bubbleAlpha = Math.min(1, this.bubbleAlpha + dt * 4);
      this.bubbleScale = Math.min(1, this.bubbleScale + dt * 5);
    } else {
      this.bubbleAlpha = Math.max(0, this.bubbleAlpha - dt * 2);
      this.bubbleScale = Math.max(0, this.bubbleScale - dt * 3);
    }
  }

  private _computeLabel(): string {
    const proj = this.session.project || '';
    const parts = prettyProject(proj).split('/').filter(Boolean);
    return parts[parts.length - 1] || this.id.slice(0, 8);
  }

  updateSession(session: Session): void {
    const oldTool = this.currentTool?.name;
    const oldStatus = this.session.status;
    const projectChanged = session.project !== this.session.project;
    this.session = session;
    this.currentTool = session.lastTool || null;
    if (projectChanged) this.displayLabel = this._computeLabel();

    // Re-navigate when tool or status changes
    if (this.currentTool?.name !== oldTool || session.status !== oldStatus) {
      this.actionTime = 0;
      this._navigateToZone();
    }
  }

  private static readonly SPRITE_SCALE = 1.5;

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, t: number): void {
    const sx = Math.floor(this.x - camX);
    const sy = Math.floor(this.y - camY) + Math.floor(this.bobOffset);
    const dpr = window.devicePixelRatio || 1;
    if (sx < -60 || sx > ctx.canvas.width / dpr + 60) return;
    if (sy < -80 || sy > ctx.canvas.height / dpr + 80) return;

    const sc = Character.SPRITE_SCALE;
    ctx.save();

    if (this.session.status === 'idle') {
      ctx.globalAlpha = 0.4;
    }

    if (this.selected) {
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#0ff';
    }

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(sc, sc);
    ctx.translate(-sx, -sy);
    this._drawCharacter(ctx, sx, sy, t);
    ctx.restore();

    ctx.restore();

    this._drawNameTag(ctx, sx, sy);

    if (this.session.status === 'waiting') {
      this._drawExclamationBubble(ctx, sx, sy, t);
    }

    if (this.bubbleAlpha > 0.01) {
      this._drawBubble(ctx, sx, sy, t);
    }
  }

  private _drawCharacter(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number): void {
    const walk = this.moving;
    const frame = this.walkFrame;
    const flip = this.dir === Direction.LEFT;
    const isWaiting = this.session.status === 'waiting';
    const isIdle = this.session.status === 'idle';

    ctx.save();
    ctx.translate(sx, sy);
    if (flip) ctx.scale(-1, 1);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.fillStyle = '#4a4a5a';
    ctx.fillRect(-4, 4, 3, 8 + (walk && frame % 2 === 0 ? -2 : 0));
    ctx.fillRect(1, 4, 3, 8 + (walk && frame % 2 === 1 ? -2 : 0));
    // Shoes
    ctx.fillStyle = '#333';
    ctx.fillRect(-5, 10, 4, 3);
    ctx.fillRect(1, 10, 4, 3);

    // Body
    ctx.fillStyle = this.shirtColor;
    ctx.fillRect(-6, -4, 12, 10);
    // Shirt highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-5, -3, 4, 6);

    // Arms
    const legSwing = walk ? Math.sin(this.walkTime * Math.PI * 8) * 3 : 0;
    const armSwing = walk ? legSwing * -0.5 : 0;
    let leftArmEnd = 5 + armSwing;
    let rightArmEnd = 5 - armSwing;

    if (isWaiting && !walk) {
      rightArmEnd = -8 + Math.sin(t / 400) * 4;
    }

    // Left arm
    ctx.fillStyle = this.shirtColor;
    ctx.fillRect(-9, -3, 3, 6);
    ctx.fillStyle = this.skinColor;
    ctx.fillRect(-9, Math.min(leftArmEnd, 4), 3, 3);

    // Right arm
    ctx.fillStyle = this.shirtColor;
    if (isWaiting && !walk) {
      ctx.fillRect(6, rightArmEnd, 3, Math.abs(rightArmEnd) + 4);
    } else {
      ctx.fillRect(6, -3, 3, 6);
    }
    ctx.fillStyle = this.skinColor;
    ctx.fillRect(6, Math.min(rightArmEnd, 4), 3, 3);

    // Head (chibi: big & round)
    ctx.fillStyle = this.skinColor;
    ctx.fillRect(-7, -18, 14, 14);
    ctx.fillRect(-8, -16, 16, 10);

    // Eyes (large, expressive)
    if (this.dir !== Direction.UP) {
      // Eye whites
      ctx.fillStyle = '#fff';
      ctx.fillRect(-5, -14, 5, 5);
      ctx.fillRect(1, -14, 5, 5);
      // Pupils
      ctx.fillStyle = this.eyeColor;
      ctx.fillRect(-4, -13, 3, 3);
      ctx.fillRect(2, -13, 3, 3);
      // Eye highlight
      ctx.fillStyle = '#fff';
      ctx.fillRect(-4, -14, 1, 1);
      ctx.fillRect(2, -14, 1, 1);

      // Mouth / Expression
      if (isWaiting) {
        ctx.fillStyle = '#c44';
        ctx.fillRect(-2, -8, 4, 2);
      } else if (isIdle) {
        // Sleepy closed eyes (override whites)
        ctx.fillStyle = this.skinColor;
        ctx.fillRect(-5, -14, 5, 5);
        ctx.fillRect(1, -14, 5, 5);
        ctx.fillStyle = this.eyeColor;
        ctx.fillRect(-5, -12, 4, 1);
        ctx.fillRect(1, -12, 4, 1);
        // Floating "z"
        ctx.fillStyle = '#aaf';
        ctx.font = '6px "Press Start 2P", monospace';
        const zzOff = Math.sin(t / 800) * 2;
        ctx.fillText('z', 8, -16 + zzOff);
      } else {
        // Small smile
        ctx.fillStyle = '#a55';
        ctx.fillRect(-2, -8, 4, 1);
      }
    }

    // Hair
    this._drawHair(ctx);

    // Tool action sparkles (only when not walking)
    if (this.currentTool?.status === 'running' && !walk) {
      this._drawToolAction(ctx, t);
    }

    ctx.restore();
  }

  private _drawHair(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.hairColor;
    switch (this.hairStyle) {
      case 0: // Short messy
        ctx.fillRect(-8, -20, 16, 6);
        ctx.fillRect(-7, -18, 3, 4);
        ctx.fillRect(5, -18, 3, 4);
        // Spiky top
        ctx.fillRect(-5, -22, 3, 3);
        ctx.fillRect(0, -23, 3, 4);
        ctx.fillRect(4, -21, 3, 2);
        break;
      case 1: // Longer / side swept
        ctx.fillRect(-8, -20, 16, 6);
        ctx.fillRect(-9, -18, 4, 8);
        ctx.fillRect(6, -18, 4, 6);
        ctx.fillRect(-6, -22, 12, 3);
        break;
      case 2: // Beanie
        ctx.fillStyle = this.shirtColor;
        ctx.fillRect(-8, -22, 16, 8);
        ctx.fillRect(-9, -16, 18, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(-9, -16, 18, 2);
        ctx.fillStyle = '#fff';
        ctx.fillRect(-1, -24, 3, 3);
        break;
      case 3: // Headband + hair
        ctx.fillRect(-8, -20, 16, 6);
        ctx.fillRect(-7, -18, 3, 3);
        ctx.fillRect(5, -18, 3, 3);
        ctx.fillRect(-4, -22, 8, 3);
        ctx.fillStyle = '#e44';
        ctx.fillRect(-8, -17, 16, 2);
        break;
    }
  }

  private _drawToolAction(ctx: CanvasRenderingContext2D, t: number): void {
    const meta: ToolMeta = TOOL_META[this.currentTool?.name ?? ''] || TOOL_DEFAULT;
    const pulse = Math.sin(t / 200) * 0.4 + 0.6;

    ctx.globalAlpha = pulse * 0.6;
    ctx.fillStyle = meta.color;

    const sparkPos: [number, number][] = [[-10, -22], [10, -22], [-12, -4], [12, -4]];
    sparkPos.forEach(([spx, spy], i) => {
      const offset = Math.sin(t / 300 + i) * 2;
      const size = 1.5 + Math.sin(t / 200 + i * 1.5) * 1;
      ctx.fillRect(spx + offset, spy + offset * 0.5, size, size);
    });
    ctx.globalAlpha = 1;
  }

  private static readonly SEARCH_TOOLS = new Set(['Grep', 'Glob', 'Read']);
  private static readonly EDIT_TOOLS = new Set(['Edit', 'Write']);

  private _getPhaseTag(): { text: string; color: string } {
    if (this.session.status === 'waiting') return { text: 'Needs you', color: '#fa0' };
    const name = this.currentTool?.name ?? '';
    if (Character.SEARCH_TOOLS.has(name)) return { text: 'Searching', color: '#0ff' };
    if (Character.EDIT_TOOLS.has(name)) return { text: 'Editing', color: '#0f0' };
    if (name === 'Bash') return { text: 'Running cmd', color: '#f0f' };
    return { text: 'Working', color: '#888' };
  }

  private _drawNameTag(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
    const label = this.displayLabel;
    ctx.font = '7px "Press Start 2P", monospace';
    const tw = ctx.measureText(label).width;
    const tx2 = sx - tw / 2;
    const ty2 = sy - 32;

    ctx.fillStyle = this.isCodex ? 'rgba(0,40,100,0.85)' : 'rgba(0,0,0,0.7)';
    ctx.fillRect(tx2 - 3, ty2 - 9, tw + 6, 12);
    ctx.fillStyle = this.selected ? '#0ff' : this.isCodex ? '#58a6ff' : '#ccc';
    ctx.fillText(label, tx2, ty2);

    if (this.session.status !== 'idle') {
      const phase = this._getPhaseTag();
      ctx.font = '5px "Press Start 2P", monospace';
      const ptw = ctx.measureText(phase.text).width;
      const ptx = sx - ptw / 2;
      const pty = ty2 + 5;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(ptx - 2, pty - 6, ptw + 4, 9);
      ctx.fillStyle = phase.color;
      ctx.fillText(phase.text, ptx, pty);
    }
  }

  private _getToolPreview(): string {
    const input = this.currentTool?.input as Record<string, unknown> | undefined;
    if (!input) return '';
    return inputPreview(input).slice(0, 40);
  }

  private static readonly BUBBLE_MAX_W = 160;
  private static readonly BUBBLE_LINE_H = 10;
  private static readonly BUBBLE_PAD = 6;

  private _wrapText(text: string, maxW: number): string[] {
    if (!text) return [];
    const charW = 4.2;
    const maxChars = Math.floor(maxW / charW);
    const lines: string[] = [];
    for (let i = 0; i < text.length; i += maxChars) {
      lines.push(text.slice(i, i + maxChars));
    }
    return lines;
  }

  private _drawBubble(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number): void {
    const meta: ToolMeta = TOOL_META[this.currentTool?.name ?? ''] || TOOL_DEFAULT;
    const preview = this._getToolPreview();
    const alpha = this.bubbleAlpha;
    const scale = this.bubbleScale;

    const pad = Character.BUBBLE_PAD;
    const lineH = Character.BUBBLE_LINE_H;
    const maxContentW = Character.BUBBLE_MAX_W - pad * 2;

    const previewLines = this._wrapText(preview, maxContentW);

    const labelW = meta.label.length * 8 + 20;
    const previewW = previewLines.length > 0
      ? Math.max(...previewLines.map(l => l.length * 4.2))
      : 0;
    const bw = Math.max(60, Math.min(Character.BUBBLE_MAX_W, Math.max(labelW, previewW) + pad * 2));
    const contentLines = 1 + previewLines.length;
    const bh = contentLines * lineH + pad * 2;

    const bx = sx - bw / 2;
    const by = sy - 26;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(bx, by);
    ctx.scale(scale, scale);

    ctx.fillStyle = 'rgba(15,20,40,0.92)';
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = 2;
    ctx.fillRect(0, -bh, bw, bh);
    ctx.strokeRect(0, -bh, bw, bh);

    // Tail (points downward)
    ctx.fillStyle = 'rgba(15,20,40,0.92)';
    ctx.beginPath();
    ctx.moveTo(bw / 2 - 5, 0);
    ctx.lineTo(-12, 6);
    ctx.lineTo(bw / 2 + 5, 0);
    ctx.fill();
    ctx.strokeStyle = meta.color;
    ctx.beginPath();
    ctx.moveTo(bw / 2 - 5, 0);
    ctx.lineTo(-12, 6);
    ctx.lineTo(bw / 2 + 5, 0);
    ctx.stroke();

    // Tool label
    let textY = -bh + pad + lineH - 2;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillStyle = meta.color;
    ctx.fillText(meta.label, pad, textY);

    // Running dots
    const dots = Math.floor(t / 400) % 4;
    ctx.fillStyle = '#fff8';
    ctx.font = '10px monospace';
    ctx.fillText('.'.repeat(dots), pad + meta.label.length * 8 + 4, textY);

    // Preview lines
    ctx.font = '7px monospace';
    ctx.fillStyle = '#bbb';
    for (const line of previewLines) {
      textY += lineH;
      ctx.fillText(line, pad, textY);
    }

    ctx.restore();
  }

  private _drawExclamationBubble(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number): void {
    const pulse = 0.7 + Math.sin(t / 300) * 0.3;
    ctx.save();
    ctx.globalAlpha = pulse;
    // Larger two-tone yellow bubble
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(sx - 7, sy - 46, 14, 16);
    ctx.fillStyle = '#ffd633';
    ctx.fillRect(sx - 6, sy - 47, 12, 16);
    // Exclamation mark
    ctx.font = 'bold 10px "Press Start 2P", monospace';
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.fillText('!', sx, sy - 34);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  drawPortrait(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d')!;
    canvas.width = 32;
    canvas.height = 32;
    ctx.clearRect(0, 0, 32, 32);
    ctx.save();
    ctx.translate(16, 22);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 10, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.fillStyle = '#4a4a5a';
    ctx.fillRect(-4, 4, 3, 8);
    ctx.fillRect(1, 4, 3, 8);

    // Body
    ctx.fillStyle = this.shirtColor;
    ctx.fillRect(-6, -4, 12, 10);

    // Arms
    ctx.fillRect(-9, -3, 3, 8);
    ctx.fillRect(6, -3, 3, 8);
    ctx.fillStyle = this.skinColor;
    ctx.fillRect(-9, 4, 3, 3);
    ctx.fillRect(6, 4, 3, 3);

    // Head (chibi proportions)
    ctx.fillStyle = this.skinColor;
    ctx.fillRect(-7, -18, 14, 14);
    ctx.fillRect(-8, -16, 16, 10);

    // Eyes with whites + colored pupils
    ctx.fillStyle = '#fff';
    ctx.fillRect(-5, -14, 5, 5);
    ctx.fillRect(1, -14, 5, 5);
    ctx.fillStyle = this.eyeColor;
    ctx.fillRect(-4, -13, 3, 3);
    ctx.fillRect(2, -13, 3, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-4, -14, 1, 1);
    ctx.fillRect(2, -14, 1, 1);

    // Hair
    this._drawHair(ctx);
    ctx.restore();
  }
}
