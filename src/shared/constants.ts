// ─── Shared constants for cc-visual ──────────────────────

// Server
export const DEFAULT_PORT = 3333;
export const DEFAULT_CLAUDE_DIR = '~/.claude';
export const DEFAULT_CODEX_DIR = '~/.codex';
export const DEFAULT_ACTIVE_THRESHOLD_MINUTES = 30;
export const JSONL_TAIL_LINES = 150;
export const SSE_FILE_POLL_MS = 3000;
export const SSE_ACTIVE_POLL_MS = 4000;
export const FOCUS_WINDOW_TIMEOUT_MS = 5000;

// World
export const TILE_SIZE = 32;
export const MAP_W = 50;
export const MAP_H = 36;

// Camera
export const CAMERA_LERP = 0.08;

// Character
export const CHARACTER_SPEED_MIN = 60;
export const CHARACTER_SPEED_RANGE = 30;

// Toast / Badge
export const TOAST_DURATION_MS = 3200;
export const BADGE_FLASH_MS = 1500;

// Panel history
export const HISTORY_ITEMS = 12;

// Legend entries [name, icon, color]
export const LEGEND_TOOLS: readonly [string, string, string][] = [
  ['Bash/Exec', '\u26A1', '#fa0'],
  ['Read',      '\uD83D\uDCD6', '#0ff'],
  ['Edit',      '\u270F\uFE0F', '#0f0'],
  ['Grep',      '\uD83D\uDD0D', '#bc8cff'],
  ['Agent',     '\uD83E\uDD16', '#f0f'],
  ['Web',       '\uD83C\uDF10', '#58a6ff'],
  ['CC',        '\uD83D\uDFE2', '#0f0'],
  ['GPT',       '\uD83D\uDD35', '#58a6ff'],
];
