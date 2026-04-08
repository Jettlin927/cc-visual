import { Direction } from '../shared/types.js';
import type { Session, ToolCall, TileMap, ToolMeta } from '../shared/types.js';
import { TILE_SIZE } from '../shared/constants.js';
import { TOOL_META, TOOL_DEFAULT, getToolPose } from '../shared/tool-metadata.js';
import { isWalkable, randomWalkableTile } from './world.js';
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

function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.floor(h)},${Math.floor(s)}%,${Math.floor(l)}%)`;
}

// ─── Character class ─────────────────────────────────────

export class Character {
  session: Session;
  map: TileMap;
  id: string;

  // Appearance
  skinColor: string;
  shirtColor: string;
  hairColor: string;
  hatType: number;

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
  idleTime: number;

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

    // Deterministic appearance from seed
    this.skinColor  = hsl(this.rng() * 360, 40 + this.rng() * 30, 55 + this.rng() * 20);
    this.shirtColor = hsl(this.rng() * 360, 60 + this.rng() * 30, 40 + this.rng() * 20);
    this.hairColor  = hsl(this.rng() * 60, 30 + this.rng() * 40, 20 + this.rng() * 30);
    this.hatType    = Math.floor(this.rng() * 4);

    // Position
    const spawn = randomWalkableTile(map, () => this.rng());
    this.x  = spawn.tx * TILE_SIZE + TILE_SIZE / 2;
    this.y  = spawn.ty * TILE_SIZE + TILE_SIZE / 2;
    this.tx = spawn.tx;
    this.ty = spawn.ty;

    // Pathfinding
    this.targetX = this.x;
    this.targetY = this.y;
    this.path = [];
    this.moving = false;
    this.speed = 60 + this.rng() * 30;

    // Animation
    this.walkFrame = 0;
    this.walkTime  = 0;
    this.dir = Direction.DOWN;
    this.bobOffset = 0;
    this.idleTime = 0;

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
    this.pickNewTarget();
  }

  pickNewTarget(): void {
    const status = this.session.status;
    if (status === 'waiting' || status === 'idle') return;
    const dest = randomWalkableTile(this.map, () => this.rng());
    this.targetX = dest.tx * TILE_SIZE + TILE_SIZE / 2;
    this.targetY = dest.ty * TILE_SIZE + TILE_SIZE / 2;
    this.path = null;
    this.moving = true;
    this.idleTime = 0;
  }

  update(dt: number, t: number): void {
    this.walkTime += dt;
    this.actionTime += dt;

    const status = this.session.status;
    if (status === 'waiting' || status === 'idle') {
      this.moving = false;
    }

    if (this.moving) {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 3) {
        this.x = this.targetX;
        this.y = this.targetY;
        this.moving = false;
        this.idleTime = 0;
        setTimeout(() => this.pickNewTarget(), 1000 + this.rng() * 2000);
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
          this.moving = false;
          setTimeout(() => this.pickNewTarget(), 200);
        }

        if (this.walkTime > 0.125) {
          this.walkFrame = (this.walkFrame + 1) % 4;
          this.walkTime = 0;
        }
      }
    } else {
      this.idleTime += dt;
      this.walkFrame = 0;
      if (status === 'idle') {
        this.bobOffset = Math.sin(t / 1400) * 0.7;
      } else {
        this.bobOffset = Math.sin(t / 800) * 1;
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
    const projectChanged = session.project !== this.session.project;
    this.session = session;
    this.currentTool = session.lastTool || null;
    if (projectChanged) this.displayLabel = this._computeLabel();
    if (this.currentTool?.name !== oldTool && this.currentTool?.status === 'running') {
      this.actionTime = 0;
      if (!this.moving) this.pickNewTarget();
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, t: number): void {
    const sx = Math.floor(this.x - camX);
    const sy = Math.floor(this.y - camY) + Math.floor(this.bobOffset);
    const dpr = window.devicePixelRatio || 1;
    if (sx < -40 || sx > ctx.canvas.width / dpr + 40) return;
    if (sy < -60 || sy > ctx.canvas.height / dpr + 60) return;

    ctx.save();

    if (this.selected) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#0ff';
    }

    this._drawCharacter(ctx, sx, sy, t);

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
    const sessionStatus = this.session.status;
    const isIdle    = sessionStatus === 'idle';
    const isWaiting = sessionStatus === 'waiting';
    const isRunning = sessionStatus === 'running';

    const crouchY = isIdle ? 3 : 0;

    ctx.save();
    ctx.translate(sx, sy);
    if (flip) { ctx.scale(-1, 1); }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 10 + crouchY, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    const legY = 4 + crouchY;
    const legH = isIdle ? 3 : 6;

    ctx.fillStyle = '#555';
    ctx.fillRect(-5, legY, 4, legH + (walk && frame % 2 === 0 ? -2 : 0));
    ctx.fillRect(1, legY, 4, legH + (walk && frame % 2 === 1 ? -2 : 0));

    // Body
    ctx.fillStyle = this.shirtColor;
    ctx.fillRect(-7, -4 + crouchY, 14, 10);

    // Arms
    const armSwing = walk ? Math.sin(this.walkTime * Math.PI * 8) * 3 * -0.7 : 0;

    let leftArmY = -3 + crouchY + (walk ? -armSwing / -0.7 * -0.7 : 0);
    let rightArmY = -3 + crouchY - (walk ? -armSwing / -0.7 * -0.7 : 0);
    let leftArmH = 8, rightArmH = 8;
    let leftHandY = 4 + crouchY + (walk ? -armSwing / -0.7 * -0.7 : 0);
    let rightHandY = 4 + crouchY - (walk ? -armSwing / -0.7 * -0.7 : 0);
    let toolPropColor: string | null = null;

    // Recalculate arm swing properly matching the original
    const legSwing = walk ? Math.sin(this.walkTime * Math.PI * 8) * 3 : 0;
    const origArmSwing = walk ? legSwing * -0.7 : 0;
    leftArmY = -3 + crouchY + origArmSwing;
    rightArmY = -3 + crouchY - origArmSwing;
    leftHandY = 4 + crouchY + origArmSwing;
    rightHandY = 4 + crouchY - origArmSwing;

    if (isWaiting) {
      rightArmY  = -14;
      rightArmH  = 12;
      rightHandY = -15;
    } else if (isRunning && this.currentTool) {
      const pose = getToolPose(this.currentTool.name);
      leftArmY   = pose.leftArmY  + crouchY;
      rightArmY  = pose.rightArmY + crouchY;
      leftHandY  = pose.leftHandY + crouchY;
      rightHandY = pose.rightHandY + crouchY;
      toolPropColor = pose.propColor || null;
    }

    ctx.fillStyle = this.shirtColor;
    ctx.fillRect(-10, leftArmY,  4, leftArmH);
    ctx.fillRect( 6,  rightArmY, 4, rightArmH);

    // Hands
    ctx.fillStyle = this.skinColor;
    ctx.fillRect(-10, leftHandY,  4, 3);
    ctx.fillRect( 6,  rightHandY, 4, 3);

    if (toolPropColor) {
      ctx.fillStyle = toolPropColor;
      ctx.fillRect(9, rightHandY - 3, 2, 5);
    }

    // Head
    ctx.fillStyle = this.skinColor;
    ctx.fillRect(-6, -14, 12, 11);

    // Eyes
    ctx.fillStyle = '#222';
    if (this.dir !== Direction.UP) {
      ctx.fillRect(-3, -11, 2, 2);
      ctx.fillRect(1, -11, 2, 2);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-3, -12, 1, 1);
      ctx.fillRect(1, -12, 1, 1);
    }

    // Mouth
    if (!walk && this.dir === Direction.DOWN) {
      ctx.fillStyle = '#944';
      ctx.fillRect(-2, -7, 4, 1);
    }

    // Hair / Hat
    this._drawHat(ctx, t);

    // Tool action effect
    if (this.currentTool?.status === 'running') {
      this._drawToolAction(ctx, t);
    }

    ctx.restore();
  }

  private _drawHat(ctx: CanvasRenderingContext2D, _t: number): void {
    switch (this.hatType) {
      case 0: // hair
        ctx.fillStyle = this.hairColor;
        ctx.fillRect(-6, -18, 12, 6);
        ctx.fillRect(-7, -14, 3, 3);
        ctx.fillRect(4, -14, 3, 3);
        break;
      case 1: // cap
        ctx.fillStyle = this.shirtColor;
        ctx.fillRect(-7, -17, 14, 5);
        ctx.fillRect(-8, -14, 4, 3);
        break;
      case 2: // wizard
        ctx.fillStyle = '#7c00c8';
        ctx.fillRect(-5, -22, 10, 10);
        ctx.fillRect(-4, -26, 8, 6);
        ctx.fillRect(-3, -30, 6, 6);
        ctx.fillRect(-2, -33, 4, 5);
        ctx.fillStyle = '#ff0';
        ctx.fillRect(-1, -34, 2, 2);
        break;
      case 3: // bucket
        ctx.fillStyle = '#8b5c2a';
        ctx.fillRect(-7, -18, 14, 6);
        ctx.fillRect(-8, -15, 16, 3);
        break;
    }
  }

  private _drawToolAction(ctx: CanvasRenderingContext2D, t: number): void {
    const meta: ToolMeta = TOOL_META[this.currentTool?.name ?? ''] || TOOL_DEFAULT;
    const pulse = Math.sin(t / 200) * 0.4 + 0.6;

    ctx.globalAlpha = pulse * 0.7;
    ctx.fillStyle = meta.color;

    const sparkPos: [number, number][] = [
      [-12, -20], [12, -20], [-14, -5], [14, -5]
    ];

    sparkPos.forEach(([spx, spy], i) => {
      const offset = Math.sin(t / 300 + i) * 3;
      const size = 2 + Math.sin(t / 200 + i * 1.5) * 1;
      ctx.fillRect(spx + offset, spy + offset * 0.5, size, size);
    });

    ctx.globalAlpha = 1;
  }

  private _drawNameTag(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
    const label = this.displayLabel;
    ctx.font = '7px "Press Start 2P", monospace';
    const tw = ctx.measureText(label).width;
    const tx2 = sx - tw / 2;
    const ty2 = sy - 44;

    ctx.fillStyle = this.isCodex ? 'rgba(0,40,100,0.85)' : 'rgba(0,0,0,0.7)';
    ctx.fillRect(tx2 - 3, ty2 - 9, tw + 6, 12);
    ctx.fillStyle = this.selected ? '#0ff' : this.isCodex ? '#58a6ff' : '#ccc';
    ctx.fillText(label, tx2, ty2);
  }

  private _drawBubble(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number): void {
    const meta: ToolMeta = TOOL_META[this.currentTool?.name ?? ''] || TOOL_DEFAULT;
    const bx = sx + 14;
    const by = sy - 30;
    const alpha = this.bubbleAlpha;
    const scale = this.bubbleScale;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(bx, by);
    ctx.scale(scale, scale);

    // Bubble background
    ctx.fillStyle = 'rgba(15,20,40,0.92)';
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = 2;

    const bw = 54, bh = 28;
    ctx.fillRect(-4, -bh + 2, bw, bh);
    ctx.strokeRect(-4, -bh + 2, bw, bh);

    // Bubble tail
    ctx.fillStyle = 'rgba(15,20,40,0.92)';
    ctx.beginPath();
    ctx.moveTo(-4, -bh + bh - 2);
    ctx.lineTo(-12, 0);
    ctx.lineTo(4, -bh + bh - 2);
    ctx.fill();
    ctx.strokeStyle = meta.color;
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(-12, 6);
    ctx.lineTo(2, 0);
    ctx.stroke();

    // Tool label
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillStyle = meta.color;
    ctx.fillText(meta.label, -2, -bh + 12);

    // Running dots animation
    const dots = Math.floor(t / 400) % 4;
    ctx.fillStyle = '#fff8';
    ctx.font = '10px monospace';
    ctx.fillText('.'.repeat(dots), -2, -bh + 24);

    ctx.restore();
  }

  private _drawExclamationBubble(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number): void {
    const pulse = 0.7 + Math.sin(t / 300) * 0.3;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(sx - 6, sy - 57, 12, 13);
    ctx.font = 'bold 9px "Press Start 2P", monospace';
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.fillText('!', sx, sy - 47);
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
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.fillStyle = '#555';
    ctx.fillRect(-5, 4, 4, 6);
    ctx.fillRect(1, 4, 4, 6);

    // Body
    ctx.fillStyle = this.shirtColor;
    ctx.fillRect(-7, -4, 14, 10);
    ctx.fillRect(-10, -3, 4, 8);
    ctx.fillRect(6, -3, 4, 8);
    ctx.fillStyle = this.skinColor;
    ctx.fillRect(-10, 4, 4, 3);
    ctx.fillRect(6, 4, 4, 3);

    // Head
    ctx.fillStyle = this.skinColor;
    ctx.fillRect(-6, -14, 12, 11);
    ctx.fillStyle = '#222';
    ctx.fillRect(-3, -11, 2, 2);
    ctx.fillRect(1, -11, 2, 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-3, -12, 1, 1);
    ctx.fillRect(1, -12, 1, 1);

    this._drawHat(ctx, 0);
    ctx.restore();
  }
}
