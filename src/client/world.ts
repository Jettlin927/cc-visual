import { Tile } from '../shared/types.js';
import type { TileMap } from '../shared/types.js';
import { TILE_SIZE, MAP_W, MAP_H } from '../shared/constants.js';

export { TILE_SIZE, MAP_W, MAP_H };

function noise(x: number, y: number, cache: Map<number, number>): number {
  const k = x * 1000 + y;
  if (cache.has(k)) return cache.get(k)!;
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  const r = v - Math.floor(v);
  cache.set(k, r);
  return r;
}

export function generateMap(): TileMap {
  const map: TileMap = [];
  const noiseCache = new Map<number, number>();

  // Fill with grass variants
  for (let y = 0; y < MAP_H; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      const n = noise(x, y, noiseCache);
      if (n < 0.08) map[y][x] = Tile.GRASS2;
      else if (n < 0.14) map[y][x] = Tile.GRASS3;
      else map[y][x] = Tile.GRASS;
    }
  }

  // Horizontal path through middle
  for (let x = 0; x < MAP_W; x++) {
    const y = Math.floor(MAP_H / 2);
    map[y][x] = Tile.PATH_H;
    if (x === Math.floor(MAP_W / 2)) map[y][x] = Tile.PATH_X;
  }
  // Vertical path through middle
  for (let y = 0; y < MAP_H; y++) {
    const x = Math.floor(MAP_W / 2);
    if (map[y][x] === Tile.PATH_H) map[y][x] = Tile.PATH_X;
    else map[y][x] = Tile.PATH_V;
  }

  // Water pond top-right
  for (let y = 2; y < 8; y++) {
    for (let x = MAP_W - 10; x < MAP_W - 2; x++) {
      map[y][x] = (noise(x + 100, y, noiseCache) < 0.5) ? Tile.WATER : Tile.WATER2;
    }
  }

  // Campfire at center crossroads
  const cy = Math.floor(MAP_H / 2);
  const cx = Math.floor(MAP_W / 2);
  map[cy - 2][cx] = Tile.CAMPFIRE;

  // Trees around border and clusters
  const treeSpots: [number, number][] = [
    [1,1],[2,1],[1,2],[3,2],[MAP_W-2,1],[MAP_W-3,1],[MAP_W-2,2],
    [1,MAP_H-2],[2,MAP_H-2],[1,MAP_H-3],[MAP_W-2,MAP_H-2],[MAP_W-3,MAP_H-2],
    [5,5],[6,5],[5,6],[15,3],[16,3],[15,4],
    [MAP_W-8,MAP_H-5],[MAP_W-9,MAP_H-5],[MAP_W-8,MAP_H-6],
    [3,MAP_H-8],[4,MAP_H-8],[3,MAP_H-9],
  ];
  for (const [tx, ty] of treeSpots) {
    if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) {
      if (map[ty][tx] === Tile.GRASS || map[ty][tx] === Tile.GRASS2 || map[ty][tx] === Tile.GRASS3) {
        map[ty][tx] = Tile.TREE;
      }
    }
  }

  // Flowers scattered
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(noise(i * 7, i * 3, noiseCache) * MAP_W);
    const y = Math.floor(noise(i * 11, i * 5, noiseCache) * MAP_H);
    if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) {
      if (map[y][x] === Tile.GRASS || map[y][x] === Tile.GRASS2) {
        map[y][x] = noise(i, i * 2, noiseCache) < 0.5 ? Tile.FLOWER_R : Tile.FLOWER_Y;
      }
    }
  }

  // Rocks scattered
  const rockSpots: [number, number][] = [[8,12],[35,20],[12,28],[44,15],[20,5]];
  for (const [rx, ry] of rockSpots) {
    if (map[ry] && map[ry][rx] !== Tile.PATH_H && map[ry][rx] !== Tile.PATH_V && map[ry][rx] !== Tile.PATH_X) {
      map[ry][rx] = Tile.ROCK;
    }
  }

  // Fences around water pond
  for (let x = MAP_W - 11; x < MAP_W - 1; x++) {
    if (map[1]?.[x] !== undefined) map[1][x] = Tile.FENCE_H;
    if (map[9]?.[x] !== undefined) map[9][x] = Tile.FENCE_H;
  }

  return map;
}

// ─── Tile Renderer ─────────────────────────────────────────
export function drawTile(ctx: CanvasRenderingContext2D, tile: Tile, px: number, py: number, t: number): void {
  const s = TILE_SIZE;
  const blink = Math.floor(t / 500) % 2 === 0;

  switch (tile) {
    case Tile.GRASS:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      break;
    case Tile.GRASS2:
      ctx.fillStyle = '#2a5218';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#3a6b28';
      ctx.fillRect(px+8, py+8, 3, 3);
      break;
    case Tile.GRASS3:
      ctx.fillStyle = '#336620';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#264f16';
      ctx.fillRect(px+14, py+20, 4, 4);
      break;
    case Tile.PATH_H:
    case Tile.PATH_V:
    case Tile.PATH_X:
      ctx.fillStyle = '#8b6914';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#a07820';
      ctx.fillRect(px+2, py+2, s-4, s-4);
      ctx.fillStyle = '#8b6914';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(px + 4 + i*7, py + 6, 2, 2);
        ctx.fillRect(px + 8 + i*6, py + 20, 2, 2);
      }
      break;
    case Tile.WATER:
    case Tile.WATER2: {
      ctx.fillStyle = '#1a6896';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#1e7aad';
      const rippleOff = (t / 800) % 1;
      ctx.fillRect(px, py + Math.floor(rippleOff * s), s, 3);
      ctx.fillStyle = '#2490c8';
      ctx.fillRect(px+4, py+12, 8, 2);
      ctx.fillRect(px+18, py+22, 10, 2);
      break;
    }
    case Tile.TREE:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#6b3d1e';
      ctx.fillRect(px+12, py+20, 8, 12);
      ctx.fillStyle = '#1e5c0f';
      ctx.fillRect(px+4, py+12, 24, 14);
      ctx.fillStyle = '#267316';
      ctx.fillRect(px+8, py+6, 16, 12);
      ctx.fillStyle = '#2d8a1c';
      ctx.fillRect(px+11, py+2, 10, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(px+8, py+20, 24, 6);
      break;
    case Tile.FLOWER_R:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#3a7a20';
      ctx.fillRect(px+14, py+18, 3, 10);
      ctx.fillStyle = '#e03040';
      ctx.fillRect(px+10, py+10, 4, 4);
      ctx.fillRect(px+18, py+10, 4, 4);
      ctx.fillRect(px+14, py+6, 4, 4);
      ctx.fillRect(px+14, py+14, 4, 4);
      ctx.fillStyle = '#ffe050';
      ctx.fillRect(px+13, py+11, 5, 5);
      break;
    case Tile.FLOWER_Y:
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
    case Tile.ROCK:
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
    case Tile.CAMPFIRE:
      ctx.fillStyle = '#8b6914';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#5c3410';
      ctx.fillRect(px+6, py+18, 20, 6);
      ctx.fillRect(px+10, py+16, 12, 8);
      ctx.fillStyle = blink ? '#ff6600' : '#ff4400';
      ctx.fillRect(px+12, py+10, 8, 10);
      ctx.fillStyle = blink ? '#ffcc00' : '#ffaa00';
      ctx.fillRect(px+14, py+8, 4, 8);
      ctx.fillStyle = '#fff8';
      ctx.fillRect(px+15, py+6, 2, 4);
      ctx.fillStyle = 'rgba(255,100,0,0.08)';
      ctx.fillRect(px-4, py-4, s+8, s+8);
      break;
    case Tile.FENCE_H:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#c8a050';
      ctx.fillRect(px, py+10, s, 4);
      ctx.fillRect(px, py+18, s, 4);
      ctx.fillRect(px+4, py+6, 4, 20);
      ctx.fillRect(px+24, py+6, 4, 20);
      break;
    case Tile.FENCE_V:
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
export function isWalkable(map: TileMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
  const t = map[ty]?.[tx];
  return t !== Tile.TREE && t !== Tile.WATER && t !== Tile.WATER2 &&
         t !== Tile.ROCK && t !== Tile.FENCE_H && t !== Tile.FENCE_V && t !== Tile.HOUSE;
}

// Center-biased random: average of two uniform samples → bell-curve around center
function centerBiased(rng: () => number, size: number): number {
  const margin = Math.floor(size * 0.1);
  const inner = size - margin * 2;
  return margin + Math.floor(((rng() + rng()) / 2) * inner);
}

// Good spawn/wander points (avoid obstacles, prefer center)
export function randomWalkableTile(map: TileMap, rng: () => number): { tx: number; ty: number } {
  let tx: number, ty: number, tries = 0;
  do {
    tx = centerBiased(rng, MAP_W);
    ty = centerBiased(rng, MAP_H);
    tries++;
  } while (!isWalkable(map, tx, ty) && tries < 100);
  return { tx, ty };
}
