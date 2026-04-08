import { Tile } from '../shared/types.js';
import type { TileMap, ZoneName, ZoneInfo } from '../shared/types.js';
import { TILE_SIZE, MAP_W, MAP_H, DEPTH } from '../shared/constants.js';
import { TOOL_ZONE, STATUS_ZONE } from '../shared/tool-metadata.js';

export { TILE_SIZE, MAP_W, MAP_H };

// ─── Map Generator (2.5D indoor room) ────────────────────
export function generateMap(): TileMap {
  const map: TileMap = [];
  const roomLeft = 3, roomRight = 20;
  const roomTop = 2, roomBottom = 12;

  // Fill with grass
  for (let y = 0; y < MAP_H; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      map[y][x] = (n - Math.floor(n)) < 0.3 ? Tile.GRASS2 : Tile.GRASS;
    }
  }

  // Walls
  for (let x = roomLeft; x <= roomRight; x++) map[roomTop][x] = Tile.WALL_TOP;
  for (let x = roomLeft; x <= roomRight; x++) map[roomBottom][x] = Tile.WALL_BOTTOM;
  for (let y = roomTop; y <= roomBottom; y++) map[y][roomLeft] = Tile.WALL_LEFT;
  for (let y = roomTop; y <= roomBottom; y++) map[y][roomRight] = Tile.WALL_RIGHT;
  map[roomTop][roomLeft] = Tile.WALL_CORNER_TL;
  map[roomTop][roomRight] = Tile.WALL_CORNER_TR;
  map[roomBottom][roomLeft] = Tile.WALL_CORNER_BL;
  map[roomBottom][roomRight] = Tile.WALL_CORNER_BR;

  // Windows
  map[roomTop][7] = Tile.WINDOW;
  map[roomTop][11] = Tile.WINDOW;
  map[roomTop][16] = Tile.WINDOW;

  // Door
  const doorX = 11;
  map[roomBottom][doorX] = Tile.DOOR;

  // Interior floor
  for (let y = roomTop + 1; y < roomBottom; y++) {
    for (let x = roomLeft + 1; x < roomRight; x++) {
      const n = Math.sin(x * 73.1 + y * 197.3) * 43758.5453;
      map[y][x] = (n - Math.floor(n)) < 0.2 ? Tile.FLOOR_WOOD2 : Tile.FLOOR_WOOD;
    }
  }

  // Carpet
  for (let y = 6; y <= 10; y++) {
    for (let x = 8; x <= 15; x++) map[y][x] = Tile.FLOOR_CARPET;
  }

  // Furniture
  map[3][5] = Tile.DESK_TERMINAL; map[3][6] = Tile.DESK_TERMINAL;
  map[3][9] = Tile.BOOKSHELF;     map[3][10] = Tile.BOOKSHELF;
  map[3][13] = Tile.WORKBENCH;    map[3][14] = Tile.WORKBENCH;
  map[3][17] = Tile.SEARCH_GLOBE; map[3][18] = Tile.SEARCH_GLOBE;
  map[8][19] = Tile.COMM_STATION; map[9][19] = Tile.COMM_STATION;
  map[8][4] = Tile.COUCH;         map[9][4] = Tile.COUCH;

  // Decor
  map[3][4] = Tile.PLANT;   map[3][19] = Tile.LAMP;
  map[11][4] = Tile.PLANT;  map[11][19] = Tile.PLANT;
  map[5][5] = Tile.CHAIR;   map[5][13] = Tile.CHAIR; map[5][17] = Tile.CHAIR;

  // Roof row (above top wall)
  for (let x = roomLeft; x <= roomRight; x++) map[1][x] = Tile.ROOF;
  map[0][roomLeft + 1] = Tile.ROOF; map[0][roomRight - 1] = Tile.ROOF;
  for (let x = roomLeft + 1; x <= roomRight - 1; x++) map[0][x] = Tile.ROOF;
  // Chimney
  map[0][roomRight - 3] = Tile.CHIMNEY;

  // Path from door to south
  for (let y = roomBottom + 1; y < MAP_H - 1; y++) map[y][doorX] = Tile.PATH;
  map[roomBottom + 1][doorX - 1] = Tile.PATH;
  map[roomBottom + 1][doorX + 1] = Tile.PATH;
  // Stepping stones
  map[15][10] = Tile.STEPPING_STONE;
  map[16][9] = Tile.STEPPING_STONE;
  map[14][12] = Tile.STEPPING_STONE;

  // Fence around property
  for (let x = 1; x < MAP_W - 1; x++) {
    if (map[MAP_H - 2][x] === Tile.GRASS || map[MAP_H - 2][x] === Tile.GRASS2) {
      map[MAP_H - 2][x] = Tile.FENCE_H;
    }
  }
  map[MAP_H - 2][0] = Tile.FENCE_POST;
  map[MAP_H - 2][MAP_W - 1] = Tile.FENCE_POST;
  map[MAP_H - 2][doorX] = Tile.PATH; // gap for door path

  // Trees
  const treeSpots: [number, number][] = [
    [0, 0], [1, 1], [22, 0], [23, 1],
    [0, 8], [1, 14], [22, 7], [23, 14],
    [0, 16], [23, 16],
  ];
  for (const [tx, ty] of treeSpots) {
    if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) map[ty][tx] = Tile.TREE;
  }

  // Bushes
  const bushSpots: [number, number][] = [
    [2, 3], [2, 10], [21, 3], [21, 10],
    [1, 6], [22, 6],
    [5, 14], [18, 14], [7, 16], [16, 16],
  ];
  for (const [bx, by] of bushSpots) {
    if (map[by][bx] === Tile.GRASS || map[by][bx] === Tile.GRASS2) map[by][bx] = Tile.BUSH;
  }

  // Flowers scattered
  const flowerTypes = [Tile.FLOWER_R, Tile.FLOWER_Y, Tile.FLOWER_B];
  const flowerSpots: [number, number][] = [
    [3, 14], [4, 15], [6, 13], [8, 15],
    [15, 14], [17, 15], [19, 13], [20, 15],
    [2, 17], [6, 17], [16, 17], [20, 17],
  ];
  for (let i = 0; i < flowerSpots.length; i++) {
    const [fx, fy] = flowerSpots[i];
    if (map[fy][fx] === Tile.GRASS || map[fy][fx] === Tile.GRASS2) {
      map[fy][fx] = flowerTypes[i % 3];
    }
  }

  // Pond (right side)
  map[14][20] = Tile.POND; map[14][21] = Tile.POND;
  map[15][20] = Tile.POND2; map[15][21] = Tile.POND;
  map[15][22] = Tile.POND2;

  // Lamp post (near path)
  map[15][13] = Tile.LAMP_POST;

  // Mailbox (near fence)
  map[17][10] = Tile.MAILBOX;

  return map;
}

// ─── Walkability ─────────────────────────────────────────
const NON_WALKABLE = new Set<Tile>([
  Tile.WALL_TOP, Tile.WALL_LEFT, Tile.WALL_RIGHT, Tile.WALL_BOTTOM,
  Tile.WALL_CORNER_TL, Tile.WALL_CORNER_TR, Tile.WALL_CORNER_BL, Tile.WALL_CORNER_BR,
  Tile.WINDOW, Tile.DESK_TERMINAL, Tile.BOOKSHELF, Tile.WORKBENCH, Tile.SEARCH_GLOBE,
  Tile.COMM_STATION, Tile.COUCH, Tile.PLANT, Tile.LAMP,
  Tile.TREE, Tile.FENCE_H, Tile.FENCE_POST, Tile.LAMP_POST, Tile.MAILBOX,
  Tile.POND, Tile.POND2, Tile.ROOF, Tile.CHIMNEY, Tile.BUSH,
]);

export function isWalkable(map: TileMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
  const t = map[ty]?.[tx];
  if (t === undefined) return false;
  return !NON_WALKABLE.has(t);
}

// ─── Floor helper ────────────────────────────────────────
function _drawFloor(ctx: CanvasRenderingContext2D, px: number, py: number, s: number): void {
  ctx.fillStyle = '#6a5438';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#5e4830';
  ctx.fillRect(px, py + 10, s, 1);
}

// ─── Tile Renderer (2.5D) ────────────────────────────────
export function drawTile(ctx: CanvasRenderingContext2D, tile: Tile, px: number, py: number, t: number): void {
  const s = TILE_SIZE;
  const D = DEPTH;

  switch (tile) {
    // ─── Outdoor ───
    case Tile.GRASS:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#3a6b28';
      ctx.fillRect(px + 6, py + 20, 2, 4);
      ctx.fillRect(px + 22, py + 10, 2, 3);
      break;
    case Tile.GRASS2:
      ctx.fillStyle = '#2a5218';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#3a6b28';
      ctx.fillRect(px + 10, py + 14, 3, 3);
      ctx.fillRect(px + 3, py + 6, 2, 5);
      ctx.fillRect(px + 20, py + 22, 2, 4);
      break;
    case Tile.PATH:
      ctx.fillStyle = '#a08050';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#b09060';
      ctx.fillRect(px + 2, py + 2, s - 4, s - 4);
      ctx.fillStyle = '#907040';
      ctx.fillRect(px + 6, py + 8, 3, 2);
      ctx.fillRect(px + 18, py + 20, 4, 2);
      break;

    // ─── Walls (2.5D) ───
    case Tile.WALL_TOP:
      ctx.fillStyle = '#5a4a78';
      ctx.fillRect(px, py, s, 6);
      ctx.fillStyle = '#4a3a68';
      ctx.fillRect(px, py + 6, s, s - 6);
      ctx.fillStyle = '#554478';
      for (let r = 0; r < 3; r++) {
        const oy = py + 8 + r * 8;
        ctx.fillRect(px + 2, oy, 12, 6);
        ctx.fillRect(px + 16, oy, 14, 6);
      }
      ctx.fillStyle = '#3a2a58';
      ctx.fillRect(px, py + s - 2, s, 2);
      break;

    case Tile.WALL_BOTTOM:
      ctx.fillStyle = '#5a4a78';
      ctx.fillRect(px, py, s, D);
      ctx.fillStyle = '#3a2a58';
      ctx.fillRect(px, py + D, s, s - D);
      ctx.fillStyle = '#6a5a88';
      ctx.fillRect(px, py, s, 3);
      break;

    case Tile.WALL_LEFT:
      ctx.fillStyle = '#4a3a68';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#3a2a58';
      ctx.fillRect(px + s - 6, py, 6, s);
      ctx.fillStyle = '#5a4a78';
      ctx.fillRect(px, py, s, 4);
      break;

    case Tile.WALL_RIGHT:
      ctx.fillStyle = '#4a3a68';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#3a2a58';
      ctx.fillRect(px, py, 6, s);
      ctx.fillStyle = '#5a4a78';
      ctx.fillRect(px, py, s, 4);
      break;

    case Tile.WALL_CORNER_TL:
    case Tile.WALL_CORNER_TR:
    case Tile.WALL_CORNER_BL:
    case Tile.WALL_CORNER_BR:
      ctx.fillStyle = '#4a3a68';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#5a4a78';
      ctx.fillRect(px, py, s, 4);
      ctx.fillStyle = '#3a2a58';
      ctx.fillRect(px + 4, py + 4, s - 8, s - 8);
      break;

    case Tile.WINDOW:
      ctx.fillStyle = '#4a3a68';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#3a2a50';
      ctx.fillRect(px + 3, py + 4, s - 6, s - 6);
      ctx.fillStyle = '#8a7040';
      ctx.fillRect(px + 4, py + 5, s - 8, s - 8);
      ctx.fillStyle = '#5599cc';
      ctx.fillRect(px + 6, py + 7, s - 12, s - 12);
      ctx.fillStyle = 'rgba(135,206,250,0.25)';
      ctx.fillRect(px + 6, py + 7, (s - 12) / 2, s - 12);
      ctx.fillStyle = '#8a7040';
      ctx.fillRect(px + s / 2 - 1, py + 5, 2, s - 8);
      ctx.fillRect(px + 4, py + s / 2 - 1, s - 8, 2);
      ctx.fillStyle = '#9a8050';
      ctx.fillRect(px + 3, py + s - 4, s - 6, 4);
      ctx.fillStyle = '#7a6040';
      ctx.fillRect(px + 3, py + s - 2, s - 6, 2);
      break;

    case Tile.DOOR:
      ctx.fillStyle = '#a08050';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#5a4230';
      ctx.fillRect(px + 2, py - 4, s - 4, s + 4);
      ctx.fillStyle = '#7a5a38';
      ctx.fillRect(px + 4, py - 2, s - 8, s);
      ctx.fillStyle = '#6a4a28';
      ctx.fillRect(px + 6, py + 2, s - 12, 10);
      ctx.fillRect(px + 6, py + 16, s - 12, 10);
      ctx.fillStyle = '#daa520';
      ctx.fillRect(px + s - 10, py + 14, 3, 4);
      ctx.fillStyle = '#c09018';
      ctx.fillRect(px + s - 10, py + 16, 3, 2);
      ctx.fillStyle = '#8a6030';
      ctx.fillRect(px + 2, py + s - 4, s - 4, 4);
      break;

    // ─── Indoor floors ───
    case Tile.FLOOR_WOOD:
      ctx.fillStyle = '#6a5438';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#5e4830';
      ctx.fillRect(px, py + 10, s, 1);
      ctx.fillRect(px, py + 22, s, 1);
      ctx.fillStyle = '#72583c';
      ctx.fillRect(px + 8, py, 8, 10);
      ctx.fillRect(px + 16, py + 11, 10, 11);
      break;
    case Tile.FLOOR_WOOD2:
      ctx.fillStyle = '#6e5840';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#604c34';
      ctx.fillRect(px, py + 15, s, 1);
      ctx.fillStyle = '#76603e';
      ctx.fillRect(px + 4, py, 12, 15);
      break;
    case Tile.FLOOR_CARPET:
      ctx.fillStyle = '#5a2848';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#6a3458';
      ctx.fillRect(px + 2, py + 2, s - 4, s - 4);
      ctx.fillStyle = '#7a4068';
      ctx.fillRect(px + 6, py + 6, s - 12, s - 12);
      ctx.fillStyle = '#8a5078';
      ctx.fillRect(px + 14, py + 10, 4, 4);
      ctx.fillRect(px + 12, py + 12, 4, 4);
      ctx.fillRect(px + 16, py + 12, 4, 4);
      ctx.fillRect(px + 14, py + 14, 4, 4);
      break;

    // ─── Furniture (2.5D) ───

    case Tile.DESK_TERMINAL: {
      _drawFloor(ctx, px, py, s);
      // Desk body
      ctx.fillStyle = '#4a3828';
      ctx.fillRect(px + 2, py + 16, s - 4, D + 4);
      ctx.fillStyle = '#6a5438';
      ctx.fillRect(px + 1, py + 10, s - 2, 8);
      ctx.fillStyle = '#7a6448';
      ctx.fillRect(px + 1, py + 10, s - 2, 2);
      // Monitor
      ctx.fillStyle = '#1a1a2a';
      ctx.fillRect(px + 6, py - 4, 20, 16);
      ctx.fillStyle = '#111';
      ctx.fillRect(px + 6, py + 12, 20, 3);
      // Screen (glowing)
      const glow = Math.sin(t / 400) * 0.15 + 0.85;
      ctx.fillStyle = `rgba(0, 255, 128, ${glow})`;
      ctx.fillRect(px + 8, py - 2, 16, 12);
      // Code lines
      ctx.fillStyle = `rgba(0, 180, 80, ${glow * 0.7})`;
      ctx.fillRect(px + 10, py + 0, 8, 1);
      ctx.fillRect(px + 10, py + 3, 12, 1);
      ctx.fillRect(px + 10, py + 6, 6, 1);
      ctx.fillStyle = `rgba(100, 200, 255, ${glow * 0.5})`;
      ctx.fillRect(px + 10, py + 8, 10, 1);
      // Monitor stand
      ctx.fillStyle = '#333';
      ctx.fillRect(px + 14, py + 12, 4, 2);
      // Keyboard
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(px + 6, py + 14, 16, 4);
      ctx.fillStyle = '#4a4a5a';
      ctx.fillRect(px + 7, py + 15, 14, 2);
      break;
    }

    case Tile.BOOKSHELF: {
      _drawFloor(ctx, px, py, s);
      // Shelf body
      ctx.fillStyle = '#4a2a18';
      ctx.fillRect(px + 2, py + s - D, s - 4, D);
      ctx.fillStyle = '#5a3420';
      ctx.fillRect(px + 2, py - 2, 3, s - D + 2);
      ctx.fillRect(px + s - 5, py - 2, 3, s - D + 2);
      ctx.fillStyle = '#3a2010';
      ctx.fillRect(px + 5, py - 2, s - 10, s - D + 2);
      // Shelf dividers
      ctx.fillStyle = '#5a3420';
      ctx.fillRect(px + 2, py + 8, s - 4, 2);
      ctx.fillRect(px + 2, py + 16, s - 4, 2);
      // Books (top shelf)
      {
        const colors1 = ['#e44', '#48f', '#4c4', '#fa0', '#c4f'];
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = colors1[i];
          ctx.fillRect(px + 6 + i * 4, py, 3, 8);
        }
      }
      // Books (bottom shelf)
      {
        const colors2 = ['#4cc', '#f84', '#84f', '#8c4', '#f48'];
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = colors2[i];
          ctx.fillRect(px + 6 + i * 4, py + 10, 3, 6);
        }
      }
      // Top surface
      ctx.fillStyle = '#6a4430';
      ctx.fillRect(px + 2, py - 4, s - 4, 3);
      break;
    }

    case Tile.WORKBENCH: {
      _drawFloor(ctx, px, py, s);
      // Table legs
      ctx.fillStyle = '#4a3828';
      ctx.fillRect(px + 3, py + 18, 4, D + 4);
      ctx.fillRect(px + s - 7, py + 18, 4, D + 4);
      // Table top
      ctx.fillStyle = '#7a6448';
      ctx.fillRect(px, py + 10, s, 4);
      ctx.fillStyle = '#6a5438';
      ctx.fillRect(px, py + 14, s, 4);
      // Papers
      ctx.fillStyle = '#e8e0d0';
      ctx.fillRect(px + 3, py + 6, 10, 7);
      ctx.fillStyle = '#ddd8c8';
      ctx.fillRect(px + 6, py + 4, 10, 7);
      ctx.fillStyle = '#888';
      ctx.fillRect(px + 7, py + 6, 7, 1);
      ctx.fillRect(px + 7, py + 8, 5, 1);
      // Pen
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(px + 20, py + 6, 2, 8);
      ctx.fillStyle = '#ff8800';
      ctx.fillRect(px + 20, py + 4, 2, 3);
      ctx.fillStyle = '#333';
      ctx.fillRect(px + 20, py + 14, 2, 2);
      break;
    }

    case Tile.SEARCH_GLOBE: {
      _drawFloor(ctx, px, py, s);
      // Pedestal
      ctx.fillStyle = '#555';
      ctx.fillRect(px + 8, py + 18, 16, D + 2);
      ctx.fillStyle = '#666';
      ctx.fillRect(px + 8, py + 14, 16, 6);
      ctx.fillStyle = '#777';
      ctx.fillRect(px + 8, py + 14, 16, 2);
      // Globe stand
      ctx.fillStyle = '#888';
      ctx.fillRect(px + 14, py + 10, 4, 6);
      // Globe
      ctx.fillStyle = '#2860a8';
      ctx.beginPath();
      ctx.arc(px + 16, py + 4, 9, 0, Math.PI * 2);
      ctx.fill();
      // Continents
      ctx.fillStyle = '#3a8840';
      ctx.fillRect(px + 10, py, 5, 4);
      ctx.fillRect(px + 17, py + 2, 4, 5);
      ctx.fillRect(px + 12, py + 5, 3, 3);
      // Globe highlight
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(px + 10, py - 2, 4, 4);
      // Magnifying glass (animated)
      {
        const bob = Math.sin(t / 600) * 2;
        ctx.fillStyle = '#bc8cff';
        ctx.beginPath();
        ctx.arc(px + 24, py + 2 + bob, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(220,200,255,0.4)';
        ctx.beginPath();
        ctx.arc(px + 24, py + 2 + bob, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8a6ab0';
        ctx.fillRect(px + 26, py + 5 + bob, 2, 6);
      }
      break;
    }

    case Tile.COMM_STATION: {
      _drawFloor(ctx, px, py, s);
      // Desk body
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(px + 2, py + 18, s - 4, D + 2);
      ctx.fillStyle = '#4a4a5a';
      ctx.fillRect(px + 2, py + 12, s - 4, 8);
      ctx.fillStyle = '#555568';
      ctx.fillRect(px + 2, py + 12, s - 4, 2);
      // Antenna
      ctx.fillStyle = '#888';
      ctx.fillRect(px + 14, py - 8, 3, 22);
      ctx.fillStyle = '#999';
      ctx.fillRect(px + 10, py - 10, 12, 4);
      ctx.fillStyle = '#aaa';
      ctx.fillRect(px + 10, py - 10, 12, 2);
      // Blinking light
      {
        const blink = Math.floor(t / 500) % 2;
        ctx.fillStyle = blink ? '#ff00ff' : '#880088';
        ctx.fillRect(px + 15, py - 12, 2, 3);
        ctx.fillStyle = blink ? '#00ff00' : '#008800';
        ctx.fillRect(px + 11, py - 8, 2, 2);
      }
      // Screen on desk
      ctx.fillStyle = '#1a1a2a';
      ctx.fillRect(px + 4, py + 4, 14, 10);
      ctx.fillStyle = '#58a6ff';
      ctx.fillRect(px + 5, py + 5, 12, 8);
      // Waveform
      ctx.fillStyle = '#88ccff';
      for (let i = 0; i < 6; i++) {
        const h = 2 + Math.sin(t / 200 + i) * 2;
        ctx.fillRect(px + 6 + i * 2, py + 9 - h, 1, h);
      }
      break;
    }

    case Tile.COUCH: {
      _drawFloor(ctx, px, py, s);
      // Front cushion face
      ctx.fillStyle = '#5a3060';
      ctx.fillRect(px, py + s - D - 2, s, D + 2);
      // Seat surface
      ctx.fillStyle = '#7a4880';
      ctx.fillRect(px + 2, py + 10, s - 4, s - D - 12);
      ctx.fillStyle = '#8a5890';
      ctx.fillRect(px + 2, py + 10, s - 4, 3);
      // Back rest
      ctx.fillStyle = '#6a3870';
      ctx.fillRect(px + 2, py + 2, s - 4, 10);
      ctx.fillStyle = '#7a4880';
      ctx.fillRect(px + 2, py, s - 4, 4);
      // Armrests
      ctx.fillStyle = '#5a3060';
      ctx.fillRect(px - 1, py + 4, 5, s - 8);
      ctx.fillRect(px + s - 4, py + 4, 5, s - 8);
      ctx.fillStyle = '#6a3870';
      ctx.fillRect(px - 1, py + 4, 5, 3);
      ctx.fillRect(px + s - 4, py + 4, 5, 3);
      // Cushion line
      ctx.fillStyle = '#6a3870';
      ctx.fillRect(px + s / 2 - 1, py + 10, 2, s - D - 12);
      break;
    }

    // ─── Decor ───
    case Tile.PLANT: {
      _drawFloor(ctx, px, py, s);
      // Pot
      ctx.fillStyle = '#8a4820';
      ctx.fillRect(px + 8, py + s - D - 2, 16, D + 2);
      ctx.fillStyle = '#a05828';
      ctx.fillRect(px + 8, py + 16, 16, s - D - 18);
      ctx.fillStyle = '#b06830';
      ctx.fillRect(px + 6, py + 14, 20, 4);
      ctx.fillStyle = '#c07838';
      ctx.fillRect(px + 6, py + 14, 20, 2);
      // Soil
      ctx.fillStyle = '#4a3018';
      ctx.fillRect(px + 9, py + 13, 14, 3);
      // Leaves
      ctx.fillStyle = '#1e7a14';
      ctx.fillRect(px + 6, py + 2, 20, 14);
      ctx.fillStyle = '#2a9a20';
      ctx.fillRect(px + 4, py + 4, 12, 10);
      ctx.fillRect(px + 14, py, 10, 10);
      ctx.fillStyle = '#36b82c';
      ctx.fillRect(px + 8, py + 2, 6, 6);
      ctx.fillRect(px + 16, py + 2, 6, 6);
      break;
    }

    case Tile.LAMP: {
      _drawFloor(ctx, px, py, s);
      // Base
      ctx.fillStyle = '#666';
      ctx.fillRect(px + 10, py + s - 6, 12, 6);
      ctx.fillStyle = '#777';
      ctx.fillRect(px + 10, py + s - 6, 12, 2);
      // Stand
      ctx.fillStyle = '#888';
      ctx.fillRect(px + 14, py + 8, 4, s - 14);
      // Shade
      ctx.fillStyle = '#ddb040';
      ctx.fillRect(px + 6, py, 20, 10);
      ctx.fillStyle = '#cc9e30';
      ctx.fillRect(px + 6, py + 8, 20, 4);
      ctx.fillStyle = '#eec050';
      ctx.fillRect(px + 8, py, 16, 2);
      // Glow
      ctx.fillStyle = 'rgba(255,220,100,0.1)';
      ctx.fillRect(px - 8, py - 8, s + 16, s + 16);
      ctx.fillStyle = 'rgba(255,220,100,0.06)';
      ctx.fillRect(px - 16, py - 16, s + 32, s + 32);
      break;
    }

    case Tile.CHAIR: {
      _drawFloor(ctx, px, py, s);
      // Legs
      ctx.fillStyle = '#4a3a28';
      ctx.fillRect(px + 6, py + 20, 3, D);
      ctx.fillRect(px + s - 9, py + 20, 3, D);
      // Seat
      ctx.fillStyle = '#5a4a70';
      ctx.fillRect(px + 4, py + 14, s - 8, 8);
      ctx.fillStyle = '#6a5a80';
      ctx.fillRect(px + 4, py + 14, s - 8, 2);
      ctx.fillStyle = '#4a3a60';
      ctx.fillRect(px + 4, py + 20, s - 8, 3);
      // Back rest
      ctx.fillStyle = '#5a4a70';
      ctx.fillRect(px + 6, py + 6, s - 12, 10);
      ctx.fillStyle = '#6a5a80';
      ctx.fillRect(px + 6, py + 6, s - 12, 2);
      break;
    }

    // ─── Outdoor scenery (2.5D) ───

    case Tile.TREE: {
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(px + 2, py + 22, 28, 8);
      // Trunk
      ctx.fillStyle = '#5a3818';
      ctx.fillRect(px + 12, py + 14, 8, 16);
      ctx.fillStyle = '#4a2810';
      ctx.fillRect(px + 12, py + 14, 3, 16);
      // Canopy layers
      ctx.fillStyle = '#1a5a0e';
      ctx.fillRect(px + 2, py + 8, 28, 14);
      ctx.fillStyle = '#228a14';
      ctx.fillRect(px + 4, py + 2, 24, 12);
      ctx.fillStyle = '#2aaa1c';
      ctx.fillRect(px + 8, py - 2, 16, 10);
      // Canopy front face
      ctx.fillStyle = '#187a0c';
      ctx.fillRect(px + 2, py + 18, 28, 4);
      // Highlights
      ctx.fillStyle = '#3ac02a';
      ctx.fillRect(px + 10, py, 4, 4);
      ctx.fillRect(px + 20, py + 4, 4, 3);
      break;
    }

    case Tile.FLOWER_R: {
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#3a8a20';
      ctx.fillRect(px + 15, py + 16, 2, 10);
      ctx.fillStyle = '#e03040';
      ctx.fillRect(px + 11, py + 10, 4, 4);
      ctx.fillRect(px + 17, py + 10, 4, 4);
      ctx.fillRect(px + 14, py + 7, 4, 4);
      ctx.fillRect(px + 14, py + 13, 4, 4);
      ctx.fillStyle = '#ffe050';
      ctx.fillRect(px + 14, py + 10, 4, 4);
      break;
    }
    case Tile.FLOWER_Y: {
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#3a8a20';
      ctx.fillRect(px + 15, py + 18, 2, 8);
      ctx.fillStyle = '#ffe050';
      ctx.fillRect(px + 11, py + 12, 4, 4);
      ctx.fillRect(px + 17, py + 12, 4, 4);
      ctx.fillRect(px + 14, py + 9, 4, 4);
      ctx.fillRect(px + 14, py + 15, 4, 4);
      ctx.fillStyle = '#ff8800';
      ctx.fillRect(px + 14, py + 12, 4, 4);
      break;
    }
    case Tile.FLOWER_B: {
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#3a8a20';
      ctx.fillRect(px + 15, py + 18, 2, 8);
      ctx.fillStyle = '#6688ee';
      ctx.fillRect(px + 11, py + 12, 4, 4);
      ctx.fillRect(px + 17, py + 12, 4, 4);
      ctx.fillRect(px + 14, py + 9, 4, 4);
      ctx.fillRect(px + 14, py + 15, 4, 4);
      ctx.fillStyle = '#aaccff';
      ctx.fillRect(px + 14, py + 12, 4, 4);
      break;
    }

    case Tile.BUSH: {
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(px + 2, py + 24, 28, 6);
      ctx.fillStyle = '#1e6a10';
      ctx.fillRect(px + 4, py + 10, 24, 18);
      ctx.fillStyle = '#268a18';
      ctx.fillRect(px + 6, py + 6, 20, 14);
      ctx.fillStyle = '#2ea820';
      ctx.fillRect(px + 8, py + 4, 16, 10);
      ctx.fillStyle = '#1a5a0c';
      ctx.fillRect(px + 4, py + 24, 24, 4);
      ctx.fillStyle = '#3aba2c';
      ctx.fillRect(px + 10, py + 6, 3, 3);
      ctx.fillRect(px + 18, py + 8, 3, 3);
      break;
    }

    case Tile.FENCE_H: {
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#8a7040';
      ctx.fillRect(px + 2, py + 8, 4, 20);
      ctx.fillRect(px + s - 6, py + 8, 4, 20);
      ctx.fillStyle = '#a08850';
      ctx.fillRect(px, py + 12, s, 3);
      ctx.fillRect(px, py + 20, s, 3);
      ctx.fillStyle = '#b09860';
      ctx.fillRect(px + 1, py + 6, 6, 4);
      ctx.fillRect(px + s - 7, py + 6, 6, 4);
      break;
    }
    case Tile.FENCE_POST: {
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#8a7040';
      ctx.fillRect(px + 12, py + 4, 8, 24);
      ctx.fillStyle = '#b09860';
      ctx.fillRect(px + 10, py + 2, 12, 5);
      ctx.fillStyle = '#6a5030';
      ctx.fillRect(px + 12, py + 24, 8, 4);
      break;
    }

    case Tile.LAMP_POST: {
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#555';
      ctx.fillRect(px + 10, py + 24, 12, 6);
      ctx.fillStyle = '#666';
      ctx.fillRect(px + 10, py + 24, 12, 2);
      ctx.fillRect(px + 14, py + 4, 4, 22);
      ctx.fillStyle = '#888';
      ctx.fillRect(px + 8, py, 16, 6);
      ctx.fillStyle = '#777';
      ctx.fillRect(px + 8, py + 4, 16, 3);
      ctx.fillStyle = '#ffdd88';
      ctx.fillRect(px + 10, py + 2, 12, 3);
      ctx.fillStyle = 'rgba(255,220,100,0.08)';
      ctx.fillRect(px - 8, py - 8, s + 16, s + 16);
      break;
    }

    case Tile.MAILBOX: {
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#6a5030';
      ctx.fillRect(px + 14, py + 14, 4, 16);
      ctx.fillStyle = '#3366aa';
      ctx.fillRect(px + 6, py + 6, 20, 12);
      ctx.fillStyle = '#2a5590';
      ctx.fillRect(px + 6, py + 14, 20, 4);
      ctx.fillStyle = '#4477bb';
      ctx.fillRect(px + 6, py + 4, 20, 4);
      ctx.fillStyle = '#e44';
      ctx.fillRect(px + 24, py + 6, 3, 8);
      ctx.fillRect(px + 24, py + 6, 6, 3);
      break;
    }

    case Tile.POND:
    case Tile.POND2: {
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#1a6090';
      ctx.fillRect(px + 2, py + 2, s - 4, s - 4);
      ctx.fillStyle = '#1e70a8';
      ctx.fillRect(px + 4, py + 4, s - 8, s - 8);
      // Animated ripples
      const ripple = Math.sin(t / 600 + px * 0.1) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(100,200,255,${ripple * 0.3})`;
      ctx.fillRect(px + 6, py + 8, 10, 2);
      ctx.fillRect(px + 14, py + 18, 8, 2);
      // Lily pad (only on POND)
      if (tile === Tile.POND) {
        ctx.fillStyle = '#2a8a20';
        ctx.beginPath();
        ctx.arc(px + 20, py + 14, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f8a';
        ctx.fillRect(px + 19, py + 12, 3, 3);
      }
      // Shore edge
      ctx.fillStyle = '#3a6828';
      ctx.fillRect(px, py, s, 2);
      ctx.fillRect(px, py, 2, s);
      break;
    }

    case Tile.ROOF: {
      ctx.fillStyle = '#8a4030';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#9a5040';
      for (let r = 0; r < 4; r++) {
        ctx.fillRect(px + (r % 2) * 8, py + r * 8, 12, 6);
        ctx.fillRect(px + (r % 2) * 8 + 16, py + r * 8, 12, 6);
      }
      ctx.fillStyle = '#7a3020';
      ctx.fillRect(px, py + s - 4, s, 4);
      ctx.fillStyle = '#aa5848';
      ctx.fillRect(px, py, s, 2);
      break;
    }

    case Tile.CHIMNEY: {
      ctx.fillStyle = '#8a4030';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#9a5040';
      ctx.fillRect(px, py, 12, 6);
      ctx.fillRect(px + 16, py + 8, 12, 6);
      ctx.fillStyle = '#6a4a3a';
      ctx.fillRect(px + 8, py - 4, 14, s + 4);
      ctx.fillStyle = '#5a3a2a';
      ctx.fillRect(px + 8, py + s - 6, 14, 6);
      ctx.fillStyle = '#7a5a4a';
      ctx.fillRect(px + 6, py - 6, 18, 4);
      ctx.fillRect(px + 9, py, 5, 4);
      ctx.fillRect(px + 16, py + 4, 5, 4);
      ctx.fillRect(px + 9, py + 8, 5, 4);
      break;
    }

    case Tile.STEPPING_STONE: {
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#8a8078';
      ctx.fillRect(px + 8, py + 10, 16, 12);
      ctx.fillStyle = '#9a9088';
      ctx.fillRect(px + 10, py + 10, 12, 4);
      break;
    }

    default:
      ctx.fillStyle = '#6a5438';
      ctx.fillRect(px, py, s, s);
  }
}

// ─── Zone System ──────────────────────────────────────────
export const ZONES: Record<ZoneName, ZoneInfo> = {
  terminal:  { tx: 5,  ty: 5,  label: 'Terminal' },
  bookshelf: { tx: 9,  ty: 5,  label: 'Library' },
  workbench: { tx: 13, ty: 5,  label: 'Workbench' },
  search:    { tx: 17, ty: 5,  label: 'Search' },
  comm:      { tx: 17, ty: 9,  label: 'Comms' },
  rest:      { tx: 5,  ty: 9,  label: 'Lounge' },
  outside:   { tx: 11, ty: 17, label: 'Outside' },
};

export function getZoneTarget(toolName: string | undefined, status: string): ZoneInfo {
  if (status === 'waiting') return ZONES.outside;
  if (status === 'idle') return ZONES.rest;
  if (toolName && TOOL_ZONE[toolName]) return ZONES[TOOL_ZONE[toolName]];
  if (STATUS_ZONE[status]) return ZONES[STATUS_ZONE[status]];
  return ZONES.rest;
}
