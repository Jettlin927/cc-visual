import { TILE_SIZE, isWalkable, randomWalkableTile } from './world.js';

// Tool → emoji + color for speech bubbles
export const TOOL_META = {
  Bash:         { icon: '⚡', color: '#fa0', label: 'BASH' },
  Read:         { icon: '📖', color: '#0ff', label: 'READ' },
  Edit:         { icon: '✏️', color: '#0f0', label: 'EDIT' },
  Write:        { icon: '💾', color: '#0f0', label: 'WRITE' },
  Grep:         { icon: '🔍', color: '#bc8cff', label: 'GREP' },
  Glob:         { icon: '🔮', color: '#bc8cff', label: 'GLOB' },
  Agent:        { icon: '🤖', color: '#f0f', label: 'AGENT' },
  WebFetch:     { icon: '🌐', color: '#58a6ff', label: 'FETCH' },
  WebSearch:    { icon: '🔎', color: '#58a6ff', label: 'SEARCH' },
  Skill:        { icon: '⚙️', color: '#ff0', label: 'SKILL' },
  ToolSearch:   { icon: '🗂', color: '#aaa', label: 'SEARCH' },
  EnterPlanMode:{ icon: '📐', color: '#f0f', label: 'PLAN' },
  ExitPlanMode: { icon: '✅', color: '#0f0', label: 'PLAN✓' },
  TaskCreate:   { icon: '📝', color: '#888', label: 'TASK' },
  TaskUpdate:   { icon: '🔄', color: '#888', label: 'UPDATE' },
  NotebookEdit: { icon: '📓', color: '#ff0', label: 'NOTEBK' },
};

const TOOL_DEFAULT = { icon: '⚙️', color: '#888', label: '???' };

// Direction constants
const DIR = { DOWN: 0, LEFT: 1, RIGHT: 2, UP: 3 };

// Seeded RNG
function mkRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// Hash session ID → seed number
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

// Interpolate between two values
function lerp(a, b, t) { return a + (b - a) * t; }

export class Character {
  constructor(session, map) {
    this.session = session;
    this.map = map;
    this.id = session.sessionId;

    const seed = hashStr(this.id);
    this.rng = mkRng(seed);

    // Deterministic appearance from seed
    this.skinColor  = hsl(this.rng() * 360, 40 + this.rng() * 30, 55 + this.rng() * 20);
    this.shirtColor = hsl(this.rng() * 360, 60 + this.rng() * 30, 40 + this.rng() * 20);
    this.hairColor  = hsl(this.rng() * 60, 30 + this.rng() * 40, 20 + this.rng() * 30);
    this.hatType    = Math.floor(this.rng() * 4); // 0=none,1=cap,2=wizard,3=bucket

    // Position (tile coords × TILE_SIZE, pixel space)
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
    this.speed = 60 + this.rng() * 30; // px/sec

    // Animation
    this.walkFrame = 0;
    this.walkTime  = 0;
    this.dir = DIR.DOWN;
    this.bobOffset = 0;
    this.idleTime = 0;

    // Tool state
    this.currentTool = session.lastTool || null;
    this.bubbleAlpha = 0;
    this.bubbleScale = 0;
    this.selected = false;

    // Tool action animation
    this.actionTime = 0;

    this.pickNewTarget();
  }

  pickNewTarget() {
    const dest = randomWalkableTile(this.map, () => this.rng());
    this.targetX = dest.tx * TILE_SIZE + TILE_SIZE / 2;
    this.targetY = dest.ty * TILE_SIZE + TILE_SIZE / 2;
    this.path = null;
    this.moving = true;
    this.idleTime = 0;
  }

  update(dt, t) {
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
        this.idleTime = 0;
        // Pause at destination (1-3 sec), then pick new
        setTimeout(() => this.pickNewTarget(), 1000 + this.rng() * 2000);
      } else {
        const step = Math.min(this.speed * dt, dist);
        const nx = this.x + (dx / dist) * step;
        const ny = this.y + (dy / dist) * step;

        // Direction
        if (Math.abs(dx) > Math.abs(dy)) {
          this.dir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
        } else {
          this.dir = dy > 0 ? DIR.DOWN : DIR.UP;
        }

        // Collision check (tile level)
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

        // Walk frame (8 fps)
        if (this.walkTime > 0.125) {
          this.walkFrame = (this.walkFrame + 1) % 4;
          this.walkTime = 0;
        }
      }
    } else {
      this.idleTime += dt;
      this.walkFrame = 0;
      // Idle bob
      this.bobOffset = Math.sin(t / 800) * 1;
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

  updateSession(session) {
    const oldTool = this.currentTool?.name;
    this.session = session;
    this.currentTool = session.lastTool || null;
    // New tool → excite character (pick new destination quickly)
    if (this.currentTool?.name !== oldTool && this.currentTool?.status === 'running') {
      this.actionTime = 0;
      if (!this.moving) this.pickNewTarget();
    }
  }

  draw(ctx, camX, camY, t) {
    const sx = Math.floor(this.x - camX);
    const sy = Math.floor(this.y - camY) + Math.floor(this.bobOffset);
    if (sx < -40 || sx > ctx.canvas.width / (window.devicePixelRatio || 1) + 40) return;
    if (sy < -60 || sy > ctx.canvas.height / (window.devicePixelRatio || 1) + 60) return;

    ctx.save();

    // Selected glow
    if (this.selected) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#0ff';
    }

    this._drawCharacter(ctx, sx, sy, t);

    ctx.restore();

    // Name tag
    this._drawNameTag(ctx, sx, sy);

    // Speech bubble
    if (this.bubbleAlpha > 0.01) {
      this._drawBubble(ctx, sx, sy, t);
    }
  }

  _drawCharacter(ctx, sx, sy, t) {
    const walk = this.moving;
    const frame = this.walkFrame;
    const flip = this.dir === DIR.LEFT;

    ctx.save();
    ctx.translate(sx, sy);
    if (flip) { ctx.scale(-1, 1); }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 10, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── LEGS ──
    const legY = 4;
    const legSwing = walk ? Math.sin(this.walkTime * Math.PI * 8) * 3 : 0;

    ctx.fillStyle = '#555';
    // Left leg
    ctx.fillRect(-5, legY, 4, 6 + (walk && frame % 2 === 0 ? -2 : 0));
    // Right leg
    ctx.fillRect(1, legY, 4, 6 + (walk && frame % 2 === 1 ? -2 : 0));

    // ── BODY ──
    ctx.fillStyle = this.shirtColor;
    ctx.fillRect(-7, -4, 14, 10);

    // ── ARMS ──
    const armSwing = walk ? legSwing * -0.7 : 0;
    ctx.fillStyle = this.shirtColor;
    // Left arm
    ctx.fillRect(-10, -3 + armSwing, 4, 8);
    // Right arm
    ctx.fillRect(6, -3 - armSwing, 4, 8);

    // Hands
    ctx.fillStyle = this.skinColor;
    ctx.fillRect(-10, 4 + armSwing, 4, 3);
    ctx.fillRect(6, 4 - armSwing, 4, 3);

    // ── HEAD ──
    ctx.fillStyle = this.skinColor;
    ctx.fillRect(-6, -14, 12, 11);

    // Eyes
    ctx.fillStyle = '#222';
    if (this.dir !== DIR.UP) {
      ctx.fillRect(-3, -11, 2, 2);
      ctx.fillRect(1, -11, 2, 2);
      // Pupils
      ctx.fillStyle = '#fff';
      ctx.fillRect(-3, -12, 1, 1);
      ctx.fillRect(1, -12, 1, 1);
    }

    // Mouth (when idle, small smile)
    if (!walk && this.dir === DIR.DOWN) {
      ctx.fillStyle = '#944';
      ctx.fillRect(-2, -7, 4, 1);
    }

    // ── HAIR / HAT ──
    this._drawHat(ctx, t);

    // ── TOOL ACTION EFFECT ──
    if (this.currentTool?.status === 'running') {
      this._drawToolAction(ctx, t);
    }

    ctx.restore();
  }

  _drawHat(ctx, t) {
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
        ctx.fillRect(-8, -14, 4, 3); // brim
        break;
      case 2: // wizard
        ctx.fillStyle = '#7c00c8';
        ctx.fillRect(-5, -22, 10, 10);
        ctx.fillRect(-4, -26, 8, 6);
        ctx.fillRect(-3, -30, 6, 6);
        ctx.fillRect(-2, -33, 4, 5);
        // Star
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

  _drawToolAction(ctx, t) {
    const meta = TOOL_META[this.currentTool?.name] || TOOL_DEFAULT;
    const pulse = Math.sin(t / 200) * 0.4 + 0.6;

    // Sparkle effect based on tool
    ctx.globalAlpha = pulse * 0.7;
    ctx.fillStyle = meta.color;

    const sparkPos = [
      [-12, -20], [12, -20], [-14, -5], [14, -5]
    ];

    sparkPos.forEach(([sx, sy], i) => {
      const offset = Math.sin(t / 300 + i) * 3;
      const size = 2 + Math.sin(t / 200 + i * 1.5) * 1;
      ctx.fillRect(sx + offset, sy + offset * 0.5, size, size);
    });

    ctx.globalAlpha = 1;
  }

  _drawNameTag(ctx, sx, sy) {
    const label = this.session.sessionId.slice(0, 8);
    ctx.font = '7px "Press Start 2P", monospace';
    const tw = ctx.measureText(label).width;
    const tx2 = sx - tw / 2;
    const ty2 = sy - 44;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(tx2 - 3, ty2 - 9, tw + 6, 12);
    ctx.fillStyle = this.selected ? '#0ff' : '#ccc';
    ctx.fillText(label, tx2, ty2);
  }

  _drawBubble(ctx, sx, sy, t) {
    const meta = TOOL_META[this.currentTool?.name] || TOOL_DEFAULT;
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

  // For side panel: draw a large avatar
  drawPortrait(canvas) {
    const ctx = canvas.getContext('2d');
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

function hsl(h, s, l) {
  return `hsl(${Math.floor(h)},${Math.floor(s)}%,${Math.floor(l)}%)`;
}
