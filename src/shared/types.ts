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
  GRASS    = 0,
  GRASS2   = 1,
  GRASS3   = 2,
  PATH_H   = 3,
  PATH_V   = 4,
  PATH_X   = 5,
  WATER    = 6,
  WATER2   = 7,
  TREE     = 8,
  FLOWER_R = 9,
  FLOWER_Y = 10,
  ROCK     = 11,
  CAMPFIRE = 12,
  HOUSE    = 13,
  FENCE_H  = 14,
  FENCE_V  = 15,
}

/** 2D tile map: map[y][x] = Tile */
export type TileMap = Tile[][];

/** Tool metadata entry */
export interface ToolMeta {
  icon: string;
  color: string;
  label: string;
}

/** Tool arm/hand pose for character animation */
export interface ToolPose {
  leftArmY: number;
  leftHandY: number;
  rightArmY: number;
  rightHandY: number;
  propColor: string | null;
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

/** API Response: Transcript */
export interface TranscriptResponse {
  totalLines: number;
  toolCalls: ToolCall[];
  lastAssistantText: string | null;
  recentErrors: ToolCall[];
}
