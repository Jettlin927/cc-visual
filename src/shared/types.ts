// ─── Shared types for cc-visual ───────────────────────────

// ── Basic enums ──
export type SessionSource = 'claude' | 'codex';
export type SessionStatus = 'running' | 'waiting' | 'idle';
export type ToolCallStatus = 'running' | 'done' | 'error';

/** Tool call input — arbitrary key-value pairs */
export interface ToolInput {
  command?: string;
  file_path?: string;
  pattern?: string;
  query?: string;
  description?: string;
  prompt?: string;
  subagent_type?: string;
  [key: string]: unknown;
}

/** Tool result tracking during parse */
export interface ToolResultInfo {
  isError: boolean;
  timestamp: string;
}

/** A single tool call from a transcript */
export interface ToolCall {
  id: string;
  name: string;
  status: ToolCallStatus;
  input: ToolInput | null;
  timestamp: string;
  duration: number | null;
}

/** Base session (shared between Claude and Codex) */
export interface BaseSession {
  source: SessionSource;
  project: string;
  sessionId: string;
  filePath: string | null;
  modifiedAt: number;
  size: number;
  status: SessionStatus;
  lastTool: ToolCall | null;
  toolCount: number;
  pid: number | null;
}

export interface ClaudeSession extends BaseSession {
  source: 'claude';
  filePath: string;
}

export interface CodexSession extends BaseSession {
  source: 'codex';
  filePath: null;
  title: string;
  model: string;
}

export type Session = ClaudeSession | CodexSession;

/** Raw scanned project (before enrichment) */
export interface ScannedProject {
  source: 'claude';
  project: string;
  sessionId: string;
  filePath: string;
  modifiedAt: number;
  size: number;
}

/** JSONL entry (Claude Code transcript line) */
export interface JournalEntry {
  type: 'assistant' | 'user' | 'system';
  timestamp?: string;
  message?: {
    content?: ContentBlock[];
  };
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  id?: string;
  name?: string;
  input?: ToolInput;
  tool_use_id?: string;
  is_error?: boolean;
  text?: string;
}

/** Application config */
export interface AppConfig {
  port: number;
  claudeDir: string;
  codexDir: string;
  activeThresholdMs: number;
}

/** Direction const enum — values inlined by TS */
export const enum Direction {
  DOWN  = 0,
  LEFT  = 1,
  RIGHT = 2,
  UP    = 3,
}

/** Tile type const enum */
export const enum Tile {
  // Outdoor
  GRASS = 0, GRASS2 = 1, PATH = 2,
  // Walls
  WALL_TOP = 10, WALL_LEFT = 11, WALL_RIGHT = 12, WALL_BOTTOM = 13,
  WALL_CORNER_TL = 14, WALL_CORNER_TR = 15,
  WALL_CORNER_BL = 16, WALL_CORNER_BR = 17,
  DOOR = 18, WINDOW = 19,
  // Floors
  FLOOR_WOOD = 20, FLOOR_WOOD2 = 21, FLOOR_CARPET = 22,
  // Furniture
  DESK_TERMINAL = 30, BOOKSHELF = 31, WORKBENCH = 32,
  SEARCH_GLOBE = 33, COMM_STATION = 34, COUCH = 35,
  // Indoor decor
  PLANT = 40, LAMP = 41, CHAIR = 43,
  // Outdoor scenery
  TREE = 50, FLOWER_R = 51, FLOWER_Y = 52, FLOWER_B = 53,
  FENCE_H = 54, FENCE_POST = 55,
  LAMP_POST = 56, MAILBOX = 57,
  POND = 58, POND2 = 59,
  ROOF = 60, CHIMNEY = 61,
  BUSH = 62, STEPPING_STONE = 63,
}

export type ZoneName = 'terminal' | 'bookshelf' | 'workbench' | 'search' | 'comm' | 'rest' | 'outside';

export interface ZoneInfo {
  tx: number;
  ty: number;
  label: string;
}

/** 2D tile map: map[y][x] = Tile */
export type TileMap = Tile[][];

/** Tool metadata entry */
export interface ToolMeta {
  icon: string;
  color: string;
  label: string;
}

/** SSE message from server */
export interface SSEMessage {
  type: string;
  sessions?: Session[];
  [key: string]: unknown;
}

/** API Response: Focus Window */
export interface FocusWindowResponse {
  ok: boolean;
  reason?: string;
  process?: string;
}

/** API Response: Health check */
export interface HealthResponse {
  claudeDir: { path: string; exists: boolean };
  codexDir: { path: string; exists: boolean };
  codexSqlite: { readable: boolean };
  lastScanAt: string | null;
  scannedFiles: number;
  filteredSessions: number;
  sseClients: number;
}

/** API Response: Stats */
export interface StatsResponse {
  totalSessions: number;
  activeSessions: number;
  totalToolCalls: number;
  claudeCount: number;
  codexCount: number;
  byProject: Record<string, { sessions: number; tools: number }>;
  byTool: Record<string, number>;
}

/** API Response: Transcript */
export interface TranscriptResponse {
  totalLines: number;
  toolCalls: ToolCall[];
  lastAssistantText: string | null;
  recentErrors: ToolCall[];
}
