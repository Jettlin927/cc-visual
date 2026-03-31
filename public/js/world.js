// ─── Tile types ───────────────────────────────────────────
export const T = {
  GRASS: 0, GRASS2: 1, GRASS3: 2,
  PATH_H: 3, PATH_V: 4, PATH_X: 5,
  WATER: 6, WATER2: 7,
  TREE: 8,
  FLOWER_R: 9, FLOWER_Y: 10,
  ROCK: 11,
  CAMPFIRE: 12,
  HOUSE: 13,
  FENCE_H: 14, FENCE_V: 15,
};

export const TILE_SIZE = 32;

// ─── World Map (50×36) ─────────────────────────────────────
export const W = 50, H = 36;

function makeTile(t) { return t; }

export function generateMap() {
  const map = [];
  const noiseCache = new Map();

  function noise(x, y) {
    const k = x * 1000 + y;
    if (noiseCache.has(k)) return noiseCache.get(k);
    // Simple deterministic noise
    const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    const r = v - Math.floor(v);
    noiseCache.set(k, r);
    return r;
  }

  // Fill with grass variants
  for (let y = 0; y < H; y++) {
    map[y] = [];
    for (let x = 0; x < W; x++) {
      const n = noise(x, y);
      if (n < 0.08) map[y][x] = T.GRASS2;
      else if (n < 0.14) map[y][x] = T.GRASS3;
      else map[y][x] = T.GRASS;
    }
  }

  // Horizontal path through middle
  for (let x = 0; x < W; x++) {
    const y = Math.floor(H / 2);
    map[y][x] = T.PATH_H;
    if (x === Math.floor(W / 2)) map[y][x] = T.PATH_X;
  }
  // Vertical path through middle
  for (let y = 0; y < H; y++) {
    const x = Math.floor(W / 2);
    if (map[y][x] === T.PATH_H) map[y][x] = T.PATH_X;
    else map[y][x] = T.PATH_V;
  }

  // Water pond top-right
  for (let y = 2; y < 8; y++) {
    for (let x = W - 10; x < W - 2; x++) {
      map[y][x] = (noise(x + 100, y) < 0.5) ? T.WATER : T.WATER2;
    }
  }

  // Campfire at center crossroads
  const cy = Math.floor(H / 2);
  const cx = Math.floor(W / 2);
  map[cy - 2][cx] = T.CAMPFIRE;

  // Trees around border and clusters
  const treeSpots = [
    [1,1],[2,1],[1,2],[3,2],[W-2,1],[W-3,1],[W-2,2],
    [1,H-2],[2,H-2],[1,H-3],[W-2,H-2],[W-3,H-2],
    [5,5],[6,5],[5,6],[15,3],[16,3],[15,4],
    [W-8,H-5],[W-9,H-5],[W-8,H-6],
    [3,H-8],[4,H-8],[3,H-9],
  ];
  for (const [tx,ty] of treeSpots) {
    if (tx>=0 && ty>=0 && tx<W && ty<H) {
      if (map[ty][tx] === T.GRASS || map[ty][tx] === T.GRASS2 || map[ty][tx] === T.GRASS3) {
        map[ty][tx] = T.TREE;
      }
    }
  }

  // Flowers scattered
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(noise(i * 7, i * 3) * W);
    const y = Math.floor(noise(i * 11, i * 5) * H);
    if (x >= 0 && y >= 0 && x < W && y < H) {
      if (map[y][x] === T.GRASS || map[y][x] === T.GRASS2) {
        map[y][x] = noise(i, i * 2) < 0.5 ? T.FLOWER_R : T.FLOWER_Y;
      }
    }
  }

  // Rocks scattered
  const rockSpots = [[8,12],[35,20],[12,28],[44,15],[20,5]];
  for (const [rx,ry] of rockSpots) {
    if (map[ry] && map[ry][rx] !== T.PATH_H && map[ry][rx] !== T.PATH_V && map[ry][rx] !== T.PATH_X) {
      map[ry][rx] = T.ROCK;
    }
  }

  // Fences around water pond
  for (let x = W - 11; x < W - 1; x++) {
    if (map[1]?.[x] !== undefined) map[1][x] = T.FENCE_H;
    if (map[9]?.[x] !== undefined) map[9][x] = T.FENCE_H;
  }

  return map;
}

// ─── Tile Renderer ─────────────────────────────────────────
export function drawTile(ctx, tile, px, py, t) {
  const s = TILE_SIZE;
  const blink = Math.floor(t / 500) % 2 === 0;

  switch (tile) {
    case T.GRASS:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      break;
    case T.GRASS2:
      ctx.fillStyle = '#2a5218';
      ctx.fillRect(px, py, s, s);
      // small dot
      ctx.fillStyle = '#3a6b28';
      ctx.fillRect(px+8, py+8, 3, 3);
      break;
    case T.GRASS3:
      ctx.fillStyle = '#336620';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#264f16';
      ctx.fillRect(px+14, py+20, 4, 4);
      break;
    case T.PATH_H:
    case T.PATH_V:
    case T.PATH_X:
      ctx.fillStyle = '#8b6914';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#a07820';
      ctx.fillRect(px+2, py+2, s-4, s-4);
      // path grain
      ctx.fillStyle = '#8b6914';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(px + 4 + i*7, py + 6, 2, 2);
        ctx.fillRect(px + 8 + i*6, py + 20, 2, 2);
      }
      break;
    case T.WATER:
    case T.WATER2:
      ctx.fillStyle = '#1a6896';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#1e7aad';
      // animated ripple
      const rippleOff = (t / 800) % 1;
      ctx.fillRect(px, py + Math.floor(rippleOff * s), s, 3);
      ctx.fillStyle = '#2490c8';
      ctx.fillRect(px+4, py+12, 8, 2);
      ctx.fillRect(px+18, py+22, 10, 2);
      break;
    case T.TREE:
      // Ground
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      // Trunk
      ctx.fillStyle = '#6b3d1e';
      ctx.fillRect(px+12, py+20, 8, 12);
      // Canopy (layered)
      ctx.fillStyle = '#1e5c0f';
      ctx.fillRect(px+4, py+12, 24, 14);
      ctx.fillStyle = '#267316';
      ctx.fillRect(px+8, py+6, 16, 12);
      ctx.fillStyle = '#2d8a1c';
      ctx.fillRect(px+11, py+2, 10, 8);
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(px+8, py+20, 24, 6);
      break;
    case T.FLOWER_R:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      // stem
      ctx.fillStyle = '#3a7a20';
      ctx.fillRect(px+14, py+18, 3, 10);
      // petals
      ctx.fillStyle = '#e03040';
      ctx.fillRect(px+10, py+10, 4, 4);
      ctx.fillRect(px+18, py+10, 4, 4);
      ctx.fillRect(px+14, py+6, 4, 4);
      ctx.fillRect(px+14, py+14, 4, 4);
      // center
      ctx.fillStyle = '#ffe050';
      ctx.fillRect(px+13, py+11, 5, 5);
      break;
    case T.FLOWER_Y:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#3a7a20';
      ctx.fillRect(px+14, py+18, 3, 10);
      ctx.fillStyle = '#ffe050';
      ctx.fillRect(px+10, py+10, 4, 4);
      ctx.fillRect(px+18, py+10, 4, 4);
      ctx.fillRect(px+14, py+6, 4, 4);
      ctx.fillRect(px+14, py+14, 4, 4);
      ctx.fillStyle = '#ff8800';
      ctx.fillRect(px+13, py+11, 5, 5);
      break;
    case T.ROCK:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#777';
      ctx.fillRect(px+6, py+14, 20, 14);
      ctx.fillStyle = '#999';
      ctx.fillRect(px+8, py+10, 16, 10);
      ctx.fillStyle = '#666';
      ctx.fillRect(px+6, py+22, 20, 6);
      ctx.fillStyle = '#aaa';
      ctx.fillRect(px+10, py+12, 6, 4);
      break;
    case T.CAMPFIRE:
      ctx.fillStyle = '#8b6914';
      ctx.fillRect(px, py, s, s);
      // Logs
      ctx.fillStyle = '#5c3410';
      ctx.fillRect(px+6, py+18, 20, 6);
      ctx.fillRect(px+10, py+16, 12, 8);
      // Fire
      ctx.fillStyle = blink ? '#ff6600' : '#ff4400';
      ctx.fillRect(px+12, py+10, 8, 10);
      ctx.fillStyle = blink ? '#ffcc00' : '#ffaa00';
      ctx.fillRect(px+14, py+8, 4, 8);
      ctx.fillStyle = '#fff8';
      ctx.fillRect(px+15, py+6, 2, 4);
      // Glow
      ctx.fillStyle = 'rgba(255,100,0,0.08)';
      ctx.fillRect(px-4, py-4, s+8, s+8);
      break;
    case T.FENCE_H:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#c8a050';
      ctx.fillRect(px, py+10, s, 4);
      ctx.fillRect(px, py+18, s, 4);
      ctx.fillRect(px+4, py+6, 4, 20);
      ctx.fillRect(px+24, py+6, 4, 20);
      break;
    case T.FENCE_V:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#c8a050';
      ctx.fillRect(px+10, py, 4, s);
      ctx.fillRect(px+18, py, 4, s);
      ctx.fillRect(px+6, py+4, 20, 4);
      ctx.fillRect(px+6, py+24, 20, 4);
      break;
    default:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
  }
}

// Walkable tiles for pathfinding
export function isWalkable(map, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
  const t = map[ty]?.[tx];
  return t !== T.TREE && t !== T.WATER && t !== T.WATER2 && t !== T.ROCK && t !== T.FENCE_H && t !== T.FENCE_V && t !== T.HOUSE;
}

// Good spawn/wander points (avoid obstacles)
export function randomWalkableTile(map, rng) {
  let tx, ty, tries = 0;
  do {
    tx = Math.floor(rng() * W);
    ty = Math.floor(rng() * H);
    tries++;
  } while (!isWalkable(map, tx, ty) && tries < 100);
  return { tx, ty };
}
