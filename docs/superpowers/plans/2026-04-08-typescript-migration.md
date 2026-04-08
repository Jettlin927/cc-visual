# [COMPLETED] TypeScript Migration + Refactoring Implementation Plan

> **Status:** Completed on 2026-04-08. This is a historical record. New development should follow CLAUDE.md guidelines.

> ~~**For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.~~

**Goal:** Refactor cc-visual from monolithic vanilla JS into modular TypeScript with ESLint, preserving all existing behavior.

**Architecture:** Backend split from 1 file (server.js, 455 lines) into 8 focused modules under `src/server/`. Frontend split from 4 main files (~1460 lines) into 12+ modules under `src/client/`. Shared types and constants extracted to `src/shared/`. Backend runs via `tsx`, frontend bundles via `esbuild` to `public/dist/game.js`.

**Tech Stack:** TypeScript 5.x, ESLint + @typescript-eslint (flat config), tsx (backend runner), esbuild (frontend bundler), Node.js >= 18.

---

## File Structure

```
src/
  shared/
    types.ts              - Session, ToolCall, ToolResult, Config interfaces
    tool-metadata.ts      - TOOL_META map + lookup helper (from character.js lines 5-36)
    constants.ts          - Named constants replacing magic numbers
  server/
    index.ts              - Express app entry, static serving, listen
    config.ts             - Config loading from config.json + env
    scanner.ts            - scanProjects(), readTail(), loadAliveSessions()
    enrichment.ts         - enrichSession(), detectStatus(), countTools()
    tool-parser.ts        - parseToolCalls(), extractLatestToolCall()
    codex.ts              - scanAndEnrichCodexSessions(), codex history
    focus-window.ts       - focusWindow() PowerShell integration
    routes.ts             - All Express route handlers
  client/
    game.ts               - Main entry: canvas setup, game loop, SSE, resize
    character.ts          - Character class (animation, drawing, poses)
    world.ts              - Map generation, tile rendering, walkability
    sidebar.ts            - renderSessionList(), buildSessionItem()
    panel.ts              - renderPanel(), fetchHistory(), selectSession()
    interaction.ts        - Canvas drag/click, keyboard controls
    notifications.ts      - showToast(), showBadge()
    app.ts                - Legacy dashboard (particles, logo, transcript view)
    components/
      event-stream.ts     - EventStream class
      particles.ts        - initParticles()
      pixel-logo.ts       - drawLogo()
      stats.ts            - Stats class
      timeline.ts         - Timeline class
    utils/
      formatters.ts       - Format helpers (time, duration, project name, etc.)
      sse-client.ts       - FileWatcher class
tsconfig.json             - Base config (strict, ESNext)
tsconfig.server.json      - Server: extends base, Node target
tsconfig.client.json      - Client: extends base, DOM target
eslint.config.js          - Flat ESLint config with @typescript-eslint
public/
  dist/                   - esbuild output (.gitignored)
    game.js               - Bundled frontend
    app.js                - Bundled legacy dashboard
```

**What stays unchanged:** `public/index.html` (script src updated), `public/css/style.css`, `config.json`, `docs/`.

---

## Phase 1: Tooling Setup

### Task 1: Install dependencies and create config files

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.server.json`
- Create: `tsconfig.client.json`
- Create: `eslint.config.js`
- Modify: `.gitignore`

- [ ] **Step 1: Install dev dependencies**

```bash
npm install -D typescript @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint tsx esbuild @types/express @types/node
```

- [ ] **Step 2: Create tsconfig.json (base)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "exclude": ["node_modules", "public/dist"]
}
```

- [ ] **Step 3: Create tsconfig.server.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist/server",
    "rootDir": "./src",
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/server/**/*.ts", "src/shared/**/*.ts"]
}
```

- [ ] **Step 4: Create tsconfig.client.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist/client",
    "rootDir": "./src",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": []
  },
  "include": ["src/client/**/*.ts", "src/shared/**/*.ts"]
}
```

- [ ] **Step 5: Create eslint.config.js**

```js
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
    },
  },
  {
    ignores: ['node_modules/', 'public/dist/', 'dist/'],
  },
];
```

- [ ] **Step 6: Update package.json scripts**

```json
{
  "scripts": {
    "dev": "tsx watch --clear-screen=false src/server/index.ts",
    "start": "tsx src/server/index.ts",
    "build:client": "node build.mjs",
    "build": "npm run build:client",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit -p tsconfig.server.json && tsc --noEmit -p tsconfig.client.json",
    "prestart": "npm run build:client"
  }
}
```

- [ ] **Step 7: Create build.mjs (esbuild script for frontend)**

```js
import { build } from 'esbuild';

const shared = {
  bundle: true,
  format: 'esm',
  sourcemap: true,
  target: 'es2022',
  outdir: 'public/dist',
};

await build({
  ...shared,
  entryPoints: ['src/client/game.ts'],
  outfile: 'public/dist/game.js',
});

await build({
  ...shared,
  entryPoints: ['src/client/app.ts'],
  outfile: 'public/dist/app.js',
});

console.log('  Build complete: public/dist/');
```

- [ ] **Step 8: Add public/dist/ to .gitignore**

Append to `.gitignore`:
```
public/dist/
dist/
```

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json tsconfig.server.json tsconfig.client.json eslint.config.js build.mjs .gitignore
git commit -m "chore: add TypeScript, ESLint, esbuild tooling"
```

---

## Phase 2: Shared Types & Constants

### Task 2: Create shared type definitions

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Create src/shared/types.ts**

All types derived from actual runtime shapes in server.js and game.js:

```typescript
// ── Session Source ──
export type SessionSource = 'claude' | 'codex';

// ── Session Status ──
export type SessionStatus = 'running' | 'waiting' | 'idle';

// ── Tool Call Status ──
export type ToolCallStatus = 'running' | 'done' | 'error';

// ── Tool Call ──
export interface ToolCall {
  id: string;
  name: string;
  input: ToolInput | null;
  timestamp: string;
  status: ToolCallStatus;
  duration: number | null;
}

// ── Tool Input (partial, varies by tool) ──
export interface ToolInput {
  command?: string;
  file_path?: string;
  pattern?: string;
  query?: string;
  prompt?: string;
  description?: string;
  subagent_type?: string;
  [key: string]: unknown;
}

// ── Base Session (shared between Claude and Codex) ──
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

// ── Claude Session ──
export interface ClaudeSession extends BaseSession {
  source: 'claude';
  filePath: string;
}

// ── Codex Session ──
export interface CodexSession extends BaseSession {
  source: 'codex';
  filePath: null;
  title: string;
  model: string;
}

// ── Union type for any session ──
export type Session = ClaudeSession | CodexSession;

// ── Raw scanned project (before enrichment) ──
export interface ScannedProject {
  source: 'claude';
  project: string;
  sessionId: string;
  filePath: string;
  modifiedAt: number;
  size: number;
}

// ── JSONL Entry (Claude Code transcript line) ──
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

// ── Tool Result (internal tracking during parse) ──
export interface ToolResultInfo {
  isError: boolean;
  timestamp: string;
}

// ── Config ──
export interface AppConfig {
  port: number;
  claudeDir: string;
  codexDir: string;
  activeThresholdMs: number;
}

// ── Tool Metadata (for UI display) ──
export interface ToolMeta {
  icon: string;
  color: string;
  label: string;
}

// ── Character Tool Pose ──
export interface ToolPose {
  leftArmY: number;
  leftHandY: number;
  rightArmY: number;
  rightHandY: number;
  propColor: string | null;
}

// ── Direction Enum ──
export const enum Direction {
  DOWN = 0,
  LEFT = 1,
  RIGHT = 2,
  UP = 3,
}

// ── Tile Type Enum ──
export const enum Tile {
  GRASS = 0,
  GRASS2 = 1,
  GRASS3 = 2,
  PATH_H = 3,
  PATH_V = 4,
  PATH_X = 5,
  WATER = 6,
  WATER2 = 7,
  TREE = 8,
  FLOWER_R = 9,
  FLOWER_Y = 10,
  ROCK = 11,
  CAMPFIRE = 12,
  HOUSE = 13,
  FENCE_H = 14,
  FENCE_V = 15,
}

// ── Tile Map ──
export type TileMap = Tile[][];

// ── SSE Message ──
export interface SSEMessage {
  type: 'connected' | 'changed' | 'update';
  sessions?: Session[];
}

// ── API Response: Focus Window ──
export interface FocusWindowResponse {
  ok: boolean;
  reason?: string;
  process?: string;
}

// ── API Response: Transcript ──
export interface TranscriptResponse {
  totalLines: number;
  toolCalls: ToolCall[];
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit src/shared/types.ts --target ES2022 --module ESNext --moduleResolution bundler --strict
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add shared TypeScript type definitions"
```

### Task 3: Create shared tool metadata and constants

**Files:**
- Create: `src/shared/tool-metadata.ts`
- Create: `src/shared/constants.ts`

- [ ] **Step 1: Create src/shared/tool-metadata.ts**

Extracted from `character.js` lines 5-36 and `formatters.js` lines 1-7:

```typescript
import type { ToolMeta, ToolPose } from './types.js';

export const TOOL_META: Record<string, ToolMeta> = {
  // Claude Code tools
  Bash:          { icon: '\u26A1', color: '#fa0', label: 'BASH' },
  Read:          { icon: '\uD83D\uDCD6', color: '#0ff', label: 'READ' },
  Edit:          { icon: '\u270F\uFE0F', color: '#0f0', label: 'EDIT' },
  Write:         { icon: '\uD83D\uDCBE', color: '#0f0', label: 'WRITE' },
  Grep:          { icon: '\uD83D\uDD0D', color: '#bc8cff', label: 'GREP' },
  Glob:          { icon: '\uD83D\uDD2E', color: '#bc8cff', label: 'GLOB' },
  Agent:         { icon: '\uD83E\uDD16', color: '#f0f', label: 'AGENT' },
  WebFetch:      { icon: '\uD83C\uDF10', color: '#58a6ff', label: 'FETCH' },
  WebSearch:     { icon: '\uD83D\uDD0E', color: '#58a6ff', label: 'SEARCH' },
  Skill:         { icon: '\u2699\uFE0F', color: '#ff0', label: 'SKILL' },
  ToolSearch:    { icon: '\uD83D\uDDC2', color: '#aaa', label: 'SEARCH' },
  EnterPlanMode: { icon: '\uD83D\uDCD0', color: '#f0f', label: 'PLAN' },
  ExitPlanMode:  { icon: '\u2705', color: '#0f0', label: 'PLAN\u2713' },
  TaskCreate:    { icon: '\uD83D\uDCDD', color: '#888', label: 'TASK' },
  TaskUpdate:    { icon: '\uD83D\uDD04', color: '#888', label: 'UPDATE' },
  NotebookEdit:  { icon: '\uD83D\uDCD3', color: '#ff0', label: 'NOTEBK' },
  // Codex tools
  exec_command:  { icon: '\u26A1', color: '#fa0', label: 'EXEC' },
  write_stdin:   { icon: '\u2328\uFE0F', color: '#fa0', label: 'STDIN' },
  read_file:     { icon: '\uD83D\uDCD6', color: '#0ff', label: 'READ' },
  write_file:    { icon: '\uD83D\uDCBE', color: '#0f0', label: 'WRITE' },
  str_replace_based_edit_tool: { icon: '\u270F\uFE0F', color: '#0f0', label: 'EDIT' },
  glob_search:   { icon: '\uD83D\uDD2E', color: '#bc8cff', label: 'GLOB' },
  grep_search:   { icon: '\uD83D\uDD0D', color: '#bc8cff', label: 'GREP' },
  web_search:    { icon: '\uD83D\uDD0E', color: '#58a6ff', label: 'SEARCH' },
  web_fetch:     { icon: '\uD83C\uDF10', color: '#58a6ff', label: 'FETCH' },
  shell_tool:    { icon: '\uD83D\uDC1A', color: '#fa0', label: 'SHELL' },
};

export const TOOL_DEFAULT: ToolMeta = { icon: '\u2699\uFE0F', color: '#888', label: '???' };

export function getToolMeta(name: string): ToolMeta {
  return TOOL_META[name] ?? TOOL_DEFAULT;
}

export function getToolColor(name: string): string {
  return TOOL_META[name]?.color ?? '#888';
}

export function getToolClass(name: string): string {
  if (!name) return 'c-other';
  const n = name.toLowerCase();
  if (n === 'bash') return 'c-bash';
  if (n === 'read') return 'c-read';
  if (n === 'edit' || n === 'write') return 'c-edit';
  if (n === 'grep' || n === 'glob') return 'c-grep';
  if (n === 'agent') return 'c-agent';
  if (n.includes('web') || n.includes('fetch')) return 'c-web';
  return 'c-other';
}

/** Tool-specific character arm poses for running state */
export const TOOL_POSES: Record<string, ToolPose> = {
  Bash:      { leftArmY: -3, leftHandY: 3, rightArmY: -3, rightHandY: 4, propColor: null },
  Read:      { leftArmY: -6, leftHandY: 1, rightArmY: -6, rightHandY: 1, propColor: null },
  Edit:      { leftArmY: -3, leftHandY: 4, rightArmY: -10, rightHandY: -7, propColor: '#ff0' },
  Write:     { leftArmY: -3, leftHandY: 4, rightArmY: -10, rightHandY: -7, propColor: '#ff0' },
  Grep:      { leftArmY: -3, leftHandY: 4, rightArmY: -12, rightHandY: -10, propColor: null },
  Glob:      { leftArmY: -3, leftHandY: 4, rightArmY: -12, rightHandY: -10, propColor: null },
  Agent:     { leftArmY: -10, leftHandY: -7, rightArmY: -10, rightHandY: -7, propColor: null },
  WebFetch:  { leftArmY: -3, leftHandY: 4, rightArmY: -10, rightHandY: -8, propColor: null },
  WebSearch: { leftArmY: -3, leftHandY: 4, rightArmY: -10, rightHandY: -8, propColor: null },
};

export const DEFAULT_POSE: ToolPose = {
  leftArmY: -3, leftHandY: 4, rightArmY: -3, rightHandY: 4, propColor: null,
};

export function getToolPose(name: string): ToolPose {
  return TOOL_POSES[name] ?? DEFAULT_POSE;
}
```

- [ ] **Step 2: Create src/shared/constants.ts**

```typescript
// ── Server ──
export const DEFAULT_PORT = 3333;
export const DEFAULT_CLAUDE_DIR = '~/.claude';
export const DEFAULT_CODEX_DIR = '~/.codex';
export const DEFAULT_ACTIVE_THRESHOLD_MINUTES = 30;
export const JSONL_TAIL_LINES = 150;
export const SSE_FILE_POLL_MS = 3000;
export const SSE_ACTIVE_POLL_MS = 4000;
export const FOCUS_WINDOW_TIMEOUT_MS = 5000;

// ── Client: Map ──
export const TILE_SIZE = 32;
export const MAP_W = 50;
export const MAP_H = 36;

// ── Client: Camera ──
export const CAMERA_LERP = 0.08;

// ── Client: Character ──
export const WALK_FRAME_INTERVAL = 0.125; // seconds
export const CHARACTER_SPEED_MIN = 60;    // px/sec
export const CHARACTER_SPEED_RANGE = 30;  // added to min
export const IDLE_BOB_PERIOD = 1400;      // ms (idle)
export const WAITING_BOB_PERIOD = 800;    // ms (waiting/running stopped)
export const IDLE_BOB_AMPLITUDE = 0.7;
export const WAITING_BOB_AMPLITUDE = 1;
export const CHARACTER_CLICK_RADIUS = 28; // px

// ── Client: UI ──
export const TOAST_DURATION_MS = 3200;
export const BADGE_FLASH_MS = 1500;
export const HISTORY_ITEMS = 12;

// ── Client: Legend ──
export const LEGEND_TOOLS: [string, string, string][] = [
  ['Bash/Exec', '\u26A1', '#fa0'],
  ['Read', '\uD83D\uDCD6', '#0ff'],
  ['Edit', '\u270F\uFE0F', '#0f0'],
  ['Grep', '\uD83D\uDD0D', '#bc8cff'],
  ['Agent', '\uD83E\uDD16', '#f0f'],
  ['Web', '\uD83C\uDF10', '#58a6ff'],
  ['CC', '\uD83D\uDFE2', '#0f0'],
  ['GPT', '\uD83D\uDD35', '#58a6ff'],
];
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit -p tsconfig.server.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/shared/
git commit -m "feat: add shared tool metadata and constants"
```

---

## Phase 3: Backend Migration

### Task 4: Create server config module

**Files:**
- Create: `src/server/config.ts`

- [ ] **Step 1: Create src/server/config.ts**

Extracted from `server.js` lines 1-24:

```typescript
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import type { AppConfig } from '../shared/types.js';
import {
  DEFAULT_PORT,
  DEFAULT_CLAUDE_DIR,
  DEFAULT_CODEX_DIR,
  DEFAULT_ACTIVE_THRESHOLD_MINUTES,
} from '../shared/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(__dirname, '..', '..');

interface RawConfig {
  port?: number;
  claudeDir?: string;
  codexDir?: string;
  activeThresholdMinutes?: number;
}

export async function loadConfig(): Promise<AppConfig> {
  let raw: RawConfig = {};
  try {
    const content = await readFile(join(PROJECT_ROOT, 'config.json'), 'utf-8');
    raw = JSON.parse(content) as RawConfig;
  } catch {
    // config.json missing or invalid — use defaults
  }

  const expandHome = (p: string) => p.replace(/^~/, homedir());
  const port = Number(process.env.PORT) || raw.port || DEFAULT_PORT;
  const claudeDir = expandHome(raw.claudeDir || DEFAULT_CLAUDE_DIR);
  const codexDir = expandHome(raw.codexDir || DEFAULT_CODEX_DIR);
  const minutes = raw.activeThresholdMinutes || DEFAULT_ACTIVE_THRESHOLD_MINUTES;

  return {
    port,
    claudeDir,
    codexDir,
    activeThresholdMs: minutes * 60 * 1000,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/config.ts
git commit -m "feat(server): extract config module"
```

### Task 5: Create server scanner module

**Files:**
- Create: `src/server/scanner.ts`

- [ ] **Step 1: Create src/server/scanner.ts**

Extracted from `server.js` lines 117-131 (loadAliveSessions) and 189-217 (scanProjects, readTail):

```typescript
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import type { ScannedProject, JournalEntry, AppConfig } from '../shared/types.js';
import { JSONL_TAIL_LINES } from '../shared/constants.js';

export async function scanProjects(config: AppConfig): Promise<ScannedProject[]> {
  const projectsDir = join(config.claudeDir, 'projects');
  const entries = await readdir(projectsDir, { withFileTypes: true });
  const items: ScannedProject[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectPath = join(projectsDir, entry.name);
    const files = await readdir(projectPath);

    for (const f of files.filter(f => f.endsWith('.jsonl'))) {
      const fp = join(projectPath, f);
      const s = await stat(fp);
      items.push({
        source: 'claude',
        project: entry.name,
        sessionId: f.replace('.jsonl', ''),
        filePath: fp,
        modifiedAt: s.mtimeMs,
        size: s.size,
      });
    }
  }

  return items;
}

export async function readTail(filePath: string, nLines = JSONL_TAIL_LINES): Promise<JournalEntry[]> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.trim().split('\n').slice(-nLines);
  return lines
    .map(l => { try { return JSON.parse(l) as JournalEntry; } catch { return null; } })
    .filter((e): e is JournalEntry => e !== null);
}

/** Returns Map<sessionId, pid> for all Claude processes currently alive */
export async function loadAliveSessions(config: AppConfig): Promise<Map<string, number>> {
  const alive = new Map<string, number>();
  const sessionsDir = join(config.claudeDir, 'sessions');

  try {
    const files = await readdir(sessionsDir);
    for (const f of files.filter(f => f.endsWith('.json'))) {
      try {
        const raw = await readFile(join(sessionsDir, f), 'utf-8');
        const { pid, sessionId } = JSON.parse(raw) as { pid?: number; sessionId?: string };
        if (!sessionId || !pid) continue;
        try {
          process.kill(pid, 0);
          alive.set(sessionId, pid);
        } catch {
          // Process not running
        }
      } catch {
        // Invalid session file
      }
    }
  } catch {
    // Sessions dir doesn't exist
  }

  return alive;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/scanner.ts
git commit -m "feat(server): extract scanner module"
```

### Task 6: Create server tool-parser module

**Files:**
- Create: `src/server/tool-parser.ts`

- [ ] **Step 1: Create src/server/tool-parser.ts**

Extracted from `server.js` lines 219-281. Deduplicates the shared result-map logic between `extractLatestToolCall` and `parseToolCalls`:

```typescript
import type { JournalEntry, ToolCall, ToolResultInfo, ContentBlock } from '../shared/types.js';

/** Build a map from tool_use_id to its result info */
function buildResultMap(entries: JournalEntry[]): Map<string, ToolResultInfo> {
  const results = new Map<string, ToolResultInfo>();
  for (const e of entries) {
    if (e.type !== 'user') continue;
    const blocks = e.message?.content ?? [];
    for (const b of blocks) {
      if (b?.type === 'tool_result' && b.tool_use_id) {
        results.set(b.tool_use_id, {
          isError: b.is_error ?? false,
          timestamp: e.timestamp ?? '',
        });
      }
    }
  }
  return results;
}

function blockToToolCall(b: ContentBlock, timestamp: string, result: ToolResultInfo | undefined): ToolCall {
  return {
    id: b.id ?? '',
    name: b.name ?? '',
    input: b.input ?? null,
    timestamp,
    status: result ? (result.isError ? 'error' : 'done') : 'running',
    duration: result ? new Date(result.timestamp).getTime() - new Date(timestamp).getTime() : null,
  };
}

/** Extract the most recent tool call from JSONL entries */
export function extractLatestToolCall(entries: JournalEntry[]): ToolCall | null {
  const results = buildResultMap(entries);
  let lastTool: ToolCall | null = null;

  for (const e of entries) {
    if (e.type !== 'assistant') continue;
    const blocks = e.message?.content ?? [];
    for (const b of blocks) {
      if (b?.type === 'tool_use') {
        lastTool = blockToToolCall(b, e.timestamp ?? '', results.get(b.id ?? ''));
      }
    }
  }

  return lastTool;
}

/** Parse all tool calls from JSONL entries */
export function parseToolCalls(entries: JournalEntry[]): ToolCall[] {
  const results = buildResultMap(entries);
  const toolCalls: ToolCall[] = [];

  for (const e of entries) {
    if (e.type !== 'assistant') continue;
    const blocks = e.message?.content ?? [];
    for (const b of blocks) {
      if (b?.type === 'tool_use') {
        toolCalls.push(blockToToolCall(b, e.timestamp ?? '', results.get(b.id ?? '')));
      }
    }
  }

  return toolCalls;
}

/** Get a human-readable preview from tool input */
export function getInputPreview(input: Record<string, unknown> | null): string {
  if (!input) return '';
  return String(
    input.command || input.file_path || input.pattern ||
    input.query || (input.prompt as string || '').slice(0, 60) ||
    input.description || ''
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/tool-parser.ts
git commit -m "feat(server): extract tool-parser module with deduped result mapping"
```

### Task 7: Create server enrichment module

**Files:**
- Create: `src/server/enrichment.ts`

- [ ] **Step 1: Create src/server/enrichment.ts**

Extracted from `server.js` lines 133-187:

```typescript
import type {
  ScannedProject, ClaudeSession, JournalEntry, ToolCall, SessionStatus,
} from '../shared/types.js';
import { readTail } from './scanner.js';
import { extractLatestToolCall } from './tool-parser.js';
import { JSONL_TAIL_LINES } from '../shared/constants.js';

export async function enrichSession(
  project: ScannedProject,
  alive: Map<string, number>,
): Promise<ClaudeSession> {
  const tail = await readTail(project.filePath, JSONL_TAIL_LINES);
  const lastTool = extractLatestToolCall(tail);
  const isAlive = alive.has(project.sessionId);
  const status = detectStatus(tail, lastTool, isAlive);
  const toolCount = countTools(tail);
  const pid = alive.get(project.sessionId) ?? null;

  return { ...project, lastTool, status, toolCount, pid };
}

export function detectStatus(
  entries: JournalEntry[],
  lastTool: ToolCall | null,
  isAlive: boolean,
): SessionStatus {
  if (!isAlive) return 'idle';
  if (lastTool?.status === 'running') return 'running';

  const sig = entries.filter(e => e.type === 'assistant' || e.type === 'user');
  if (!sig.length) return 'running';

  const last = sig[sig.length - 1];

  if (last.type === 'assistant') {
    const content = Array.isArray(last.message?.content) ? last.message.content : [];
    if (content.some(b => b?.type === 'tool_use')) return 'running';
    return 'waiting';
  }

  if (last.type === 'user') return 'running';

  return 'running';
}

export function countTools(entries: JournalEntry[]): number {
  let n = 0;
  for (const e of entries) {
    if (e.type !== 'assistant') continue;
    const content = Array.isArray(e.message?.content) ? e.message.content : [];
    for (const b of content) {
      if (b?.type === 'tool_use') n++;
    }
  }
  return n;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/enrichment.ts
git commit -m "feat(server): extract enrichment module"
```

### Task 8: Create server codex module

**Files:**
- Create: `src/server/codex.ts`

- [ ] **Step 1: Create src/server/codex.ts**

Extracted from `server.js` lines 283-398:

```typescript
import { join, basename } from 'path';
import { DatabaseSync } from 'node:sqlite';
import type { CodexSession, ToolCall, AppConfig } from '../shared/types.js';

export function scanAndEnrichCodexSessions(config: AppConfig): CodexSession[] {
  const stateDbPath = join(config.codexDir, 'state_5.sqlite');
  const logsDbPath = join(config.codexDir, 'logs_1.sqlite');
  let stateDb: DatabaseSync | undefined;
  let logsDb: DatabaseSync | undefined;

  try {
    stateDb = new DatabaseSync(stateDbPath, { readOnly: true });
    logsDb = new DatabaseSync(logsDbPath, { readOnly: true });

    const cutoff = Math.floor((Date.now() - config.activeThresholdMs) / 1000);
    const threads = stateDb.prepare(
      'SELECT id, title, cwd, updated_at, model FROM threads WHERE archived = 0 AND updated_at > ? ORDER BY updated_at DESC'
    ).all(cutoff) as Array<{ id: string; title: string; cwd: string; updated_at: number; model: string }>;

    return threads.map(t => enrichCodexThread(t, logsDb!, config));
  } catch {
    return [];
  } finally {
    try { stateDb?.close(); } catch { /* ignore */ }
    try { logsDb?.close(); } catch { /* ignore */ }
  }
}

function enrichCodexThread(
  t: { id: string; title: string; cwd: string; updated_at: number; model: string },
  logsDb: DatabaseSync,
  _config: AppConfig,
): CodexSession {
  // Liveness
  let isAlive = false;
  let codexPid: number | null = null;

  const pidRow = logsDb.prepare(
    'SELECT process_uuid FROM logs WHERE thread_id = ? AND process_uuid IS NOT NULL ORDER BY ts DESC, id DESC LIMIT 1'
  ).get(t.id) as { process_uuid: string } | undefined;

  if (pidRow?.process_uuid) {
    const m = pidRow.process_uuid.match(/^pid:(\d+):/);
    if (m) {
      codexPid = parseInt(m[1], 10);
      try { process.kill(codexPid, 0); isAlive = true; } catch { codexPid = null; }
    }
  }

  // Last tool call
  const toolRows = logsDb.prepare(
    "SELECT ts, feedback_log_body FROM logs WHERE thread_id = ? AND feedback_log_body LIKE '%codex.tool_result%' AND target IN ('codex_otel.trace_safe','codex_otel.log_only') ORDER BY ts DESC, id DESC LIMIT 10"
  ).all(t.id) as Array<{ ts: number; feedback_log_body: string }>;

  let lastTool: ToolCall | null = null;
  for (const row of toolRows) {
    const m = row.feedback_log_body?.match(
      /event\.name="codex\.tool_result" tool_name=(\S+) call_id=(\S+) duration_ms=(\d+) success=(\S+)/
    );
    if (m) {
      lastTool = {
        name: m[1], id: m[2], input: null,
        timestamp: new Date(Number(row.ts) * 1000).toISOString(),
        status: m[4] === 'true' ? 'done' : 'error',
        duration: parseInt(m[3], 10),
      };
      break;
    }
  }

  // Tool count
  const countRow = logsDb.prepare(
    "SELECT COUNT(*) as n FROM logs WHERE thread_id = ? AND target = 'codex_otel.trace_safe' AND feedback_log_body LIKE '%codex.tool_result%'"
  ).get(t.id) as { n: number } | undefined;

  // Status
  let status: CodexSession['status'] = 'idle';
  if (isAlive) {
    const latestRow = logsDb.prepare(
      "SELECT feedback_log_body FROM logs WHERE thread_id = ? AND target = 'codex_otel.trace_safe' ORDER BY ts DESC, id DESC LIMIT 1"
    ).get(t.id) as { feedback_log_body: string } | undefined;
    const body = latestRow?.feedback_log_body ?? '';
    status = body.includes('response.completed') ? 'waiting' : 'running';
  }

  return {
    source: 'codex',
    project: basename(t.cwd) || t.cwd,
    sessionId: t.id,
    title: (t.title || '').slice(0, 80),
    filePath: null,
    modifiedAt: Number(t.updated_at) * 1000,
    size: 0,
    model: t.model || 'gpt-4',
    lastTool,
    status,
    toolCount: Number(countRow?.n) || 0,
    pid: codexPid,
  };
}

export function getCodexHistory(config: AppConfig, threadId: string): ToolCall[] {
  let logsDb: DatabaseSync | undefined;
  try {
    logsDb = new DatabaseSync(join(config.codexDir, 'logs_1.sqlite'), { readOnly: true });
    const rows = logsDb.prepare(
      "SELECT ts, feedback_log_body FROM logs WHERE thread_id = ? AND target = 'codex_otel.trace_safe' AND feedback_log_body LIKE '%codex.tool_result%' ORDER BY ts ASC, id ASC LIMIT 50"
    ).all(threadId) as Array<{ ts: number; feedback_log_body: string }>;

    const toolCalls: ToolCall[] = [];
    for (const row of rows) {
      const m = row.feedback_log_body?.match(
        /event\.name="codex\.tool_result" tool_name=(\S+) call_id=(\S+) duration_ms=(\d+) success=(\S+)/
      );
      if (m) {
        toolCalls.push({
          name: m[1], id: m[2], input: null,
          timestamp: new Date(Number(row.ts) * 1000).toISOString(),
          status: m[4] === 'true' ? 'done' : 'error',
          duration: parseInt(m[3], 10),
        });
      }
    }
    return toolCalls;
  } finally {
    try { logsDb?.close(); } catch { /* ignore */ }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/codex.ts
git commit -m "feat(server): extract codex SQLite integration module"
```

### Task 9: Create server focus-window module

**Files:**
- Create: `src/server/focus-window.ts`

- [ ] **Step 1: Create src/server/focus-window.ts**

Extracted from `server.js` lines 400-447:

```typescript
import { execFile } from 'child_process';
import { platform } from 'os';
import type { FocusWindowResponse } from '../shared/types.js';
import { FOCUS_WINDOW_TIMEOUT_MS } from '../shared/constants.js';

export function focusWindow(pid: number): Promise<FocusWindowResponse> {
  // Verify process alive
  try { process.kill(pid, 0); } catch {
    return Promise.resolve({ ok: false, reason: 'Process not running' });
  }

  if (platform() !== 'win32') {
    return Promise.resolve({ ok: false, reason: 'Window focus not yet supported on ' + platform() });
  }

  const ps = `
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
"@
    $p = Get-Process -Id ${pid} -EA SilentlyContinue
    while ($p -and !$p.MainWindowHandle) {
      $par = (Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)" -EA SilentlyContinue).ParentProcessId
      if (!$par) { break }
      $p = Get-Process -Id $par -EA SilentlyContinue
    }
    if ($p -and $p.MainWindowHandle) {
      $h = $p.MainWindowHandle
      if ([WinFocus]::IsIconic($h)) { [WinFocus]::ShowWindow($h, 9) | Out-Null }
      [WinFocus]::SetForegroundWindow($h) | Out-Null
      Write-Output "OK:$($p.ProcessName)"
    } else { Write-Output "NO_WINDOW" }
  `;

  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-Command', ps], { timeout: FOCUS_WINDOW_TIMEOUT_MS }, (err, stdout) => {
      if (err) {
        resolve({ ok: false, reason: err.message });
        return;
      }
      const out = (stdout || '').trim();
      if (out.startsWith('OK:')) {
        resolve({ ok: true, process: out.slice(3) });
      } else {
        resolve({ ok: false, reason: 'No terminal window found for this process' });
      }
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/focus-window.ts
git commit -m "feat(server): extract focus-window module"
```

### Task 10: Create server routes module

**Files:**
- Create: `src/server/routes.ts`

- [ ] **Step 1: Create src/server/routes.ts**

All Express route handlers, composed from the extracted modules:

```typescript
import { Router, json as jsonMiddleware } from 'express';
import { watch } from 'fs';
import { readFile, stat } from 'fs/promises';
import type { AppConfig, Session } from '../shared/types.js';
import { SSE_FILE_POLL_MS, SSE_ACTIVE_POLL_MS } from '../shared/constants.js';
import { scanProjects, loadAliveSessions } from './scanner.js';
import { enrichSession } from './enrichment.js';
import { parseToolCalls } from './tool-parser.js';
import { scanAndEnrichCodexSessions, getCodexHistory } from './codex.js';
import { focusWindow } from './focus-window.js';

export function createRouter(config: AppConfig): Router {
  const router = Router();

  // All projects/sessions
  router.get('/api/projects', async (_req, res) => {
    try {
      const items = await scanProjects(config);
      items.sort((a, b) => b.modifiedAt - a.modifiedAt);
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Active sessions (Claude + Codex)
  router.get('/api/active', async (_req, res) => {
    try {
      const sessions = await getActiveSessions(config);
      res.json(sessions);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Full transcript parse
  router.get('/api/transcript', async (req, res) => {
    const filePath = req.query.path as string | undefined;
    if (!filePath || !filePath.startsWith(config.claudeDir)) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      const entries = lines
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
      const toolCalls = parseToolCalls(entries);
      res.json({ totalLines: lines.length, toolCalls });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // SSE: watch a single file
  router.get('/api/watch', (req, res) => {
    const filePath = req.query.path as string | undefined;
    if (!filePath || !filePath.startsWith(config.claudeDir)) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write('data: {"type":"connected"}\n\n');

    let lastSize = 0;
    const send = async () => {
      try {
        const s = await stat(filePath);
        if (s.size !== lastSize) {
          lastSize = s.size;
          res.write('data: {"type":"changed"}\n\n');
        }
      } catch { /* file may be gone */ }
    };
    const watcher = watch(filePath, send);
    const iv = setInterval(send, SSE_FILE_POLL_MS);
    req.on('close', () => { watcher.close(); clearInterval(iv); });
  });

  // SSE: watch ALL active sessions
  router.get('/api/watch-active', (_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write('data: {"type":"connected"}\n\n');

    const send = async () => {
      try {
        const sessions = await getActiveSessions(config);
        res.write(`data: ${JSON.stringify({ type: 'update', sessions })}\n\n`);
      } catch { /* swallow to keep SSE alive */ }
    };

    send();
    const iv = setInterval(send, SSE_ACTIVE_POLL_MS);
    _req.on('close', () => clearInterval(iv));
  });

  // Codex tool history
  router.get('/api/codex-history', (req, res) => {
    const threadId = req.query.threadId as string | undefined;
    if (!threadId) {
      res.status(400).json({ error: 'Missing threadId' });
      return;
    }
    try {
      const toolCalls = getCodexHistory(config, threadId);
      res.json({ toolCalls });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Focus terminal window by PID
  router.post('/api/focus-window', jsonMiddleware(), async (req, res) => {
    const { pid } = req.body as { pid?: number };
    if (!pid) {
      res.status(400).json({ error: 'Missing pid' });
      return;
    }
    const result = await focusWindow(pid);
    res.json(result);
  });

  return router;
}

async function getActiveSessions(config: AppConfig): Promise<Session[]> {
  const all = await scanProjects(config);
  const now = Date.now();
  const active = all.filter(p => now - p.modifiedAt < config.activeThresholdMs);
  const alive = await loadAliveSessions(config);
  const claudeSessions = await Promise.all(active.map(p => enrichSession(p, alive)));
  const codexSessions = scanAndEnrichCodexSessions(config);
  return [...claudeSessions, ...codexSessions];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/routes.ts
git commit -m "feat(server): extract routes module"
```

### Task 11: Create server entry point

**Files:**
- Create: `src/server/index.ts`

- [ ] **Step 1: Create src/server/index.ts**

```typescript
import express from 'express';
import { join } from 'path';
import { loadConfig, PROJECT_ROOT } from './config.js';
import { createRouter } from './routes.js';

const config = await loadConfig();
const app = express();

app.use(express.static(join(PROJECT_ROOT, 'public')));
app.use(createRouter(config));

app.listen(config.port, () => {
  console.log(`\n  \uD83D\uDC7E Claude Visual running at http://localhost:${config.port}\n`);
  console.log(`  Claude Code: ${config.claudeDir}/projects/`);
  console.log(`  Codex:       ${join(config.codexDir, 'state_5.sqlite')}`);
  console.log(`\n  Active sessions = last modified within ${config.activeThresholdMs / 60000} minutes\n`);
});
```

- [ ] **Step 2: Run typecheck on entire server**

```bash
npx tsc --noEmit -p tsconfig.server.json
```

Expected: no errors.

- [ ] **Step 3: Test server starts**

```bash
npx tsx src/server/index.ts
```

Expected: prints startup banner. Ctrl+C to stop.

- [ ] **Step 4: Commit**

```bash
git add src/server/index.ts
git commit -m "feat(server): add entry point, server migration complete"
```

---

## Phase 4: Frontend Migration

### Task 12: Migrate frontend utilities

**Files:**
- Create: `src/client/utils/formatters.ts`
- Create: `src/client/utils/sse-client.ts`

- [ ] **Step 1: Create src/client/utils/formatters.ts**

From `public/js/utils/formatters.js` — add types, remove `getToolColor`/`getToolClass` (moved to shared):

```typescript
export { getToolColor, getToolClass } from '../../shared/tool-metadata.js';

export function fmtTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

export function fmtDuration(ms: number | null): string {
  if (ms == null) return '...';
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return Math.floor(ms / 60000) + 'm' + Math.floor((ms % 60000) / 1000) + 's';
}

export function fmtElapsed(startMs: number): string {
  const s = Math.floor((Date.now() - startMs) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

export function truncate(s: unknown, n = 80): string {
  if (!s) return '';
  const str = typeof s === 'string' ? s : JSON.stringify(s);
  return str.length > n ? str.slice(0, n) + '...' : str;
}

export function inputPreview(input: Record<string, unknown> | null): string {
  if (!input) return '';
  return String(
    input.command || input.file_path || input.pattern ||
    input.query || input.description ||
    truncate(input.prompt as string, 60) || ''
  );
}

export function prettyProject(name: string): string {
  return name.replace(/^-Users-[^-]+-/, '~/').replace(/-/g, '/');
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1048576).toFixed(1) + 'MB';
}
```

- [ ] **Step 2: Create src/client/utils/sse-client.ts**

```typescript
import type { SSEMessage } from '../../shared/types.js';

export class FileWatcher {
  private source: EventSource | null = null;
  onChange: ((data: SSEMessage) => void) | null = null;

  constructor(private filePath: string) {}

  start(): void {
    this.source = new EventSource(`/api/watch?path=${encodeURIComponent(this.filePath)}`);
    this.source.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SSEMessage;
        if (data.type === 'changed' && this.onChange) {
          this.onChange(data);
        }
      } catch { /* ignore parse errors */ }
    };
  }

  stop(): void {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/client/utils/
git commit -m "feat(client): migrate utility modules to TypeScript"
```

### Task 13: Migrate world module

**Files:**
- Create: `src/client/world.ts`

- [ ] **Step 1: Create src/client/world.ts**

From `public/js/world.js` — use Tile enum from shared types, add parameter types:

```typescript
import { Tile, type TileMap } from '../shared/types.js';
import { TILE_SIZE, MAP_W, MAP_H } from '../shared/constants.js';

export { TILE_SIZE, MAP_W, MAP_H };

export function generateMap(): TileMap {
  const map: TileMap = [];
  const noiseCache = new Map<number, number>();

  function noise(x: number, y: number): number {
    const k = x * 1000 + y;
    if (noiseCache.has(k)) return noiseCache.get(k)!;
    const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    const r = v - Math.floor(v);
    noiseCache.set(k, r);
    return r;
  }

  for (let y = 0; y < MAP_H; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      const n = noise(x, y);
      if (n < 0.08) map[y][x] = Tile.GRASS2;
      else if (n < 0.14) map[y][x] = Tile.GRASS3;
      else map[y][x] = Tile.GRASS;
    }
  }

  // Horizontal path
  for (let x = 0; x < MAP_W; x++) {
    const y = Math.floor(MAP_H / 2);
    map[y][x] = Tile.PATH_H;
    if (x === Math.floor(MAP_W / 2)) map[y][x] = Tile.PATH_X;
  }

  // Vertical path
  for (let y = 0; y < MAP_H; y++) {
    const x = Math.floor(MAP_W / 2);
    if (map[y][x] === Tile.PATH_H) map[y][x] = Tile.PATH_X;
    else map[y][x] = Tile.PATH_V;
  }

  // Water pond top-right
  for (let y = 2; y < 8; y++) {
    for (let x = MAP_W - 10; x < MAP_W - 2; x++) {
      map[y][x] = noise(x + 100, y) < 0.5 ? Tile.WATER : Tile.WATER2;
    }
  }

  // Campfire
  const cy = Math.floor(MAP_H / 2);
  const cx = Math.floor(MAP_W / 2);
  map[cy - 2][cx] = Tile.CAMPFIRE;

  // Trees
  const treeSpots: [number, number][] = [
    [1,1],[2,1],[1,2],[3,2],[MAP_W-2,1],[MAP_W-3,1],[MAP_W-2,2],
    [1,MAP_H-2],[2,MAP_H-2],[1,MAP_H-3],[MAP_W-2,MAP_H-2],[MAP_W-3,MAP_H-2],
    [5,5],[6,5],[5,6],[15,3],[16,3],[15,4],
    [MAP_W-8,MAP_H-5],[MAP_W-9,MAP_H-5],[MAP_W-8,MAP_H-6],
    [3,MAP_H-8],[4,MAP_H-8],[3,MAP_H-9],
  ];
  const isGrass = (t: Tile) => t === Tile.GRASS || t === Tile.GRASS2 || t === Tile.GRASS3;
  for (const [tx, ty] of treeSpots) {
    if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && isGrass(map[ty][tx])) {
      map[ty][tx] = Tile.TREE;
    }
  }

  // Flowers
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(noise(i * 7, i * 3) * MAP_W);
    const y = Math.floor(noise(i * 11, i * 5) * MAP_H);
    if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) {
      if (map[y][x] === Tile.GRASS || map[y][x] === Tile.GRASS2) {
        map[y][x] = noise(i, i * 2) < 0.5 ? Tile.FLOWER_R : Tile.FLOWER_Y;
      }
    }
  }

  // Rocks
  const rockSpots: [number, number][] = [[8,12],[35,20],[12,28],[44,15],[20,5]];
  for (const [rx, ry] of rockSpots) {
    if (map[ry] && map[ry][rx] !== Tile.PATH_H && map[ry][rx] !== Tile.PATH_V && map[ry][rx] !== Tile.PATH_X) {
      map[ry][rx] = Tile.ROCK;
    }
  }

  // Fences
  for (let x = MAP_W - 11; x < MAP_W - 1; x++) {
    if (map[1]?.[x] !== undefined) map[1][x] = Tile.FENCE_H;
    if (map[9]?.[x] !== undefined) map[9][x] = Tile.FENCE_H;
  }

  return map;
}

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
      ctx.fillRect(px + 8, py + 8, 3, 3);
      break;
    case Tile.GRASS3:
      ctx.fillStyle = '#336620';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#264f16';
      ctx.fillRect(px + 14, py + 20, 4, 4);
      break;
    case Tile.PATH_H:
    case Tile.PATH_V:
    case Tile.PATH_X:
      ctx.fillStyle = '#8b6914';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#a07820';
      ctx.fillRect(px + 2, py + 2, s - 4, s - 4);
      ctx.fillStyle = '#8b6914';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(px + 4 + i * 7, py + 6, 2, 2);
        ctx.fillRect(px + 8 + i * 6, py + 20, 2, 2);
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
      ctx.fillRect(px + 4, py + 12, 8, 2);
      ctx.fillRect(px + 18, py + 22, 10, 2);
      break;
    }
    case Tile.TREE:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#6b3d1e';
      ctx.fillRect(px + 12, py + 20, 8, 12);
      ctx.fillStyle = '#1e5c0f';
      ctx.fillRect(px + 4, py + 12, 24, 14);
      ctx.fillStyle = '#267316';
      ctx.fillRect(px + 8, py + 6, 16, 12);
      ctx.fillStyle = '#2d8a1c';
      ctx.fillRect(px + 11, py + 2, 10, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(px + 8, py + 20, 24, 6);
      break;
    case Tile.FLOWER_R:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#3a7a20';
      ctx.fillRect(px + 14, py + 18, 3, 10);
      ctx.fillStyle = '#e03040';
      ctx.fillRect(px + 10, py + 10, 4, 4);
      ctx.fillRect(px + 18, py + 10, 4, 4);
      ctx.fillRect(px + 14, py + 6, 4, 4);
      ctx.fillRect(px + 14, py + 14, 4, 4);
      ctx.fillStyle = '#ffe050';
      ctx.fillRect(px + 13, py + 11, 5, 5);
      break;
    case Tile.FLOWER_Y:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#3a7a20';
      ctx.fillRect(px + 14, py + 18, 3, 10);
      ctx.fillStyle = '#ffe050';
      ctx.fillRect(px + 10, py + 10, 4, 4);
      ctx.fillRect(px + 18, py + 10, 4, 4);
      ctx.fillRect(px + 14, py + 6, 4, 4);
      ctx.fillRect(px + 14, py + 14, 4, 4);
      ctx.fillStyle = '#ff8800';
      ctx.fillRect(px + 13, py + 11, 5, 5);
      break;
    case Tile.ROCK:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#777';
      ctx.fillRect(px + 6, py + 14, 20, 14);
      ctx.fillStyle = '#999';
      ctx.fillRect(px + 8, py + 10, 16, 10);
      ctx.fillStyle = '#666';
      ctx.fillRect(px + 6, py + 22, 20, 6);
      ctx.fillStyle = '#aaa';
      ctx.fillRect(px + 10, py + 12, 6, 4);
      break;
    case Tile.CAMPFIRE:
      ctx.fillStyle = '#8b6914';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#5c3410';
      ctx.fillRect(px + 6, py + 18, 20, 6);
      ctx.fillRect(px + 10, py + 16, 12, 8);
      ctx.fillStyle = blink ? '#ff6600' : '#ff4400';
      ctx.fillRect(px + 12, py + 10, 8, 10);
      ctx.fillStyle = blink ? '#ffcc00' : '#ffaa00';
      ctx.fillRect(px + 14, py + 8, 4, 8);
      ctx.fillStyle = '#fff8';
      ctx.fillRect(px + 15, py + 6, 2, 4);
      ctx.fillStyle = 'rgba(255,100,0,0.08)';
      ctx.fillRect(px - 4, py - 4, s + 8, s + 8);
      break;
    case Tile.FENCE_H:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#c8a050';
      ctx.fillRect(px, py + 10, s, 4);
      ctx.fillRect(px, py + 18, s, 4);
      ctx.fillRect(px + 4, py + 6, 4, 20);
      ctx.fillRect(px + 24, py + 6, 4, 20);
      break;
    case Tile.FENCE_V:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#c8a050';
      ctx.fillRect(px + 10, py, 4, s);
      ctx.fillRect(px + 18, py, 4, s);
      ctx.fillRect(px + 6, py + 4, 20, 4);
      ctx.fillRect(px + 6, py + 24, 20, 4);
      break;
    default:
      ctx.fillStyle = '#2d5a1b';
      ctx.fillRect(px, py, s, s);
  }
}

export function isWalkable(map: TileMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
  const t = map[ty]?.[tx];
  return t !== Tile.TREE && t !== Tile.WATER && t !== Tile.WATER2 &&
         t !== Tile.ROCK && t !== Tile.FENCE_H && t !== Tile.FENCE_V && t !== Tile.HOUSE;
}

export function randomWalkableTile(map: TileMap, rng: () => number): { tx: number; ty: number } {
  let tx: number, ty: number, tries = 0;
  do {
    tx = Math.floor(rng() * MAP_W);
    ty = Math.floor(rng() * MAP_H);
    tries++;
  } while (!isWalkable(map, tx, ty) && tries < 100);
  return { tx, ty };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/world.ts
git commit -m "feat(client): migrate world module to TypeScript"
```

### Task 14: Migrate character module

**Files:**
- Create: `src/client/character.ts`

- [ ] **Step 1: Create src/client/character.ts**

From `public/js/character.js` — full Character class with types, using shared tool metadata:

```typescript
import { Direction, type TileMap, type Session, type ToolCall } from '../shared/types.js';
import { getToolMeta, getToolPose, TOOL_DEFAULT } from '../shared/tool-metadata.js';
import {
  TILE_SIZE, CHARACTER_SPEED_MIN, CHARACTER_SPEED_RANGE,
  WALK_FRAME_INTERVAL, IDLE_BOB_PERIOD, WAITING_BOB_PERIOD,
  IDLE_BOB_AMPLITUDE, WAITING_BOB_AMPLITUDE,
} from '../shared/constants.js';
import { isWalkable, randomWalkableTile } from './world.js';
import { prettyProject } from './utils/formatters.js';

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

export class Character {
  id: string;
  session: Session;
  map: TileMap;
  rng: () => number;

  // Appearance (deterministic from session ID)
  skinColor: string;
  shirtColor: string;
  hairColor: string;
  hatType: number;
  isCodex: boolean;

  // Position
  x: number;
  y: number;
  tx: number;
  ty: number;
  targetX: number;
  targetY: number;

  // Movement
  path: null;
  moving: boolean;
  speed: number;

  // Animation
  walkFrame: number;
  walkTime: number;
  dir: Direction;
  bobOffset: number;
  idleTime: number;
  actionTime: number;

  // Tool state
  currentTool: ToolCall | null;
  bubbleAlpha: number;
  bubbleScale: number;
  selected: boolean;

  displayLabel: string;

  constructor(session: Session, map: TileMap) {
    this.session = session;
    this.map = map;
    this.id = session.sessionId;

    const seed = hashStr(this.id);
    this.rng = mkRng(seed);

    this.skinColor = hsl(this.rng() * 360, 40 + this.rng() * 30, 55 + this.rng() * 20);
    this.shirtColor = hsl(this.rng() * 360, 60 + this.rng() * 30, 40 + this.rng() * 20);
    this.hairColor = hsl(this.rng() * 60, 30 + this.rng() * 40, 20 + this.rng() * 30);
    this.hatType = Math.floor(this.rng() * 4);

    const spawn = randomWalkableTile(map, () => this.rng());
    this.x = spawn.tx * TILE_SIZE + TILE_SIZE / 2;
    this.y = spawn.ty * TILE_SIZE + TILE_SIZE / 2;
    this.tx = spawn.tx;
    this.ty = spawn.ty;

    this.targetX = this.x;
    this.targetY = this.y;
    this.path = null;
    this.moving = false;
    this.speed = CHARACTER_SPEED_MIN + this.rng() * CHARACTER_SPEED_RANGE;

    this.walkFrame = 0;
    this.walkTime = 0;
    this.dir = Direction.DOWN;
    this.bobOffset = 0;
    this.idleTime = 0;
    this.actionTime = 0;

    this.isCodex = session.source === 'codex';
    this.currentTool = session.lastTool ?? null;
    this.bubbleAlpha = 0;
    this.bubbleScale = 0;
    this.selected = false;

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

        if (this.walkTime > WALK_FRAME_INTERVAL) {
          this.walkFrame = (this.walkFrame + 1) % 4;
          this.walkTime = 0;
        }
      }
    } else {
      this.idleTime += dt;
      this.walkFrame = 0;
      if (status === 'idle') {
        this.bobOffset = Math.sin(t / IDLE_BOB_PERIOD) * IDLE_BOB_AMPLITUDE;
      } else {
        this.bobOffset = Math.sin(t / WAITING_BOB_PERIOD) * WAITING_BOB_AMPLITUDE;
      }
    }

    // Bubble animation
    if (this.currentTool?.status === 'running') {
      this.bubbleAlpha = Math.min(1, this.bubbleAlpha + dt * 4);
      this.bubbleScale = Math.min(1, this.bubbleScale + dt * 5);
    } else {
      this.bubbleAlpha = Math.max(0, this.bubbleAlpha - dt * 2);
      this.bubbleScale = Math.max(0, this.bubbleScale - dt * 3);
    }
  }

  updateSession(session: Session): void {
    const oldTool = this.currentTool?.name;
    const projectChanged = session.project !== this.session.project;
    this.session = session;
    this.currentTool = session.lastTool ?? null;
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

  drawPortrait(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d')!;
    canvas.width = 32;
    canvas.height = 32;
    ctx.clearRect(0, 0, 32, 32);
    ctx.save();
    ctx.translate(16, 22);

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#555';
    ctx.fillRect(-5, 4, 4, 6);
    ctx.fillRect(1, 4, 4, 6);

    ctx.fillStyle = this.shirtColor;
    ctx.fillRect(-7, -4, 14, 10);
    ctx.fillRect(-10, -3, 4, 8);
    ctx.fillRect(6, -3, 4, 8);
    ctx.fillStyle = this.skinColor;
    ctx.fillRect(-10, 4, 4, 3);
    ctx.fillRect(6, 4, 4, 3);

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

  // --- Private drawing methods (same logic as original, just typed) ---

  private _computeLabel(): string {
    const proj = this.session.project || '';
    const parts = prettyProject(proj).split('/').filter(Boolean);
    return parts[parts.length - 1] || this.id.slice(0, 8);
  }

  private _drawCharacter(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number): void {
    const walk = this.moving;
    const frame = this.walkFrame;
    const flip = this.dir === Direction.LEFT;
    const sessionStatus = this.session.status;
    const isIdle = sessionStatus === 'idle';
    const isWaiting = sessionStatus === 'waiting';
    const isRunning = sessionStatus === 'running';
    const crouchY = isIdle ? 3 : 0;

    ctx.save();
    ctx.translate(sx, sy);
    if (flip) ctx.scale(-1, 1);

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
    let leftArmY = -3 + crouchY + armSwing;
    let rightArmY = -3 + crouchY - armSwing;
    const leftArmH = 8, rightArmH = 8;
    let leftHandY = 4 + crouchY + armSwing;
    let rightHandY = 4 + crouchY - armSwing;
    let toolPropColor: string | null = null;

    if (isWaiting) {
      rightArmY = -14;
      rightHandY = -15;
    } else if (isRunning && this.currentTool) {
      const pose = getToolPose(this.currentTool.name);
      leftArmY = pose.leftArmY + crouchY;
      rightArmY = pose.rightArmY + crouchY;
      leftHandY = pose.leftHandY + crouchY;
      rightHandY = pose.rightHandY + crouchY;
      toolPropColor = pose.propColor;
    }

    ctx.fillStyle = this.shirtColor;
    ctx.fillRect(-10, leftArmY, 4, leftArmH);
    ctx.fillRect(6, rightArmY, 4, rightArmH);

    ctx.fillStyle = this.skinColor;
    ctx.fillRect(-10, leftHandY, 4, 3);
    ctx.fillRect(6, rightHandY, 4, 3);

    if (toolPropColor) {
      ctx.fillStyle = toolPropColor;
      ctx.fillRect(9, rightHandY - 3, 2, 5);
    }

    // Head
    ctx.fillStyle = this.skinColor;
    ctx.fillRect(-6, -14, 12, 11);
    ctx.fillStyle = '#222';
    if (this.dir !== Direction.UP) {
      ctx.fillRect(-3, -11, 2, 2);
      ctx.fillRect(1, -11, 2, 2);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-3, -12, 1, 1);
      ctx.fillRect(1, -12, 1, 1);
    }
    if (!walk && this.dir === Direction.DOWN) {
      ctx.fillStyle = '#944';
      ctx.fillRect(-2, -7, 4, 1);
    }

    this._drawHat(ctx, t);
    if (this.currentTool?.status === 'running') {
      this._drawToolAction(ctx, t);
    }
    ctx.restore();
  }

  private _drawHat(ctx: CanvasRenderingContext2D, _t: number): void {
    switch (this.hatType) {
      case 0:
        ctx.fillStyle = this.hairColor;
        ctx.fillRect(-6, -18, 12, 6);
        ctx.fillRect(-7, -14, 3, 3);
        ctx.fillRect(4, -14, 3, 3);
        break;
      case 1:
        ctx.fillStyle = this.shirtColor;
        ctx.fillRect(-7, -17, 14, 5);
        ctx.fillRect(-8, -14, 4, 3);
        break;
      case 2:
        ctx.fillStyle = '#7c00c8';
        ctx.fillRect(-5, -22, 10, 10);
        ctx.fillRect(-4, -26, 8, 6);
        ctx.fillRect(-3, -30, 6, 6);
        ctx.fillRect(-2, -33, 4, 5);
        ctx.fillStyle = '#ff0';
        ctx.fillRect(-1, -34, 2, 2);
        break;
      case 3:
        ctx.fillStyle = '#8b5c2a';
        ctx.fillRect(-7, -18, 14, 6);
        ctx.fillRect(-8, -15, 16, 3);
        break;
    }
  }

  private _drawToolAction(ctx: CanvasRenderingContext2D, t: number): void {
    const meta = getToolMeta(this.currentTool?.name ?? '');
    const pulse = Math.sin(t / 200) * 0.4 + 0.6;
    ctx.globalAlpha = pulse * 0.7;
    ctx.fillStyle = meta.color;

    const sparkPos: [number, number][] = [[-12, -20], [12, -20], [-14, -5], [14, -5]];
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
    const meta = getToolMeta(this.currentTool?.name ?? '');
    const bx = sx + 14;
    const by = sy - 30;
    ctx.save();
    ctx.globalAlpha = this.bubbleAlpha;
    ctx.translate(bx, by);
    ctx.scale(this.bubbleScale, this.bubbleScale);

    const bw = 54, bh = 28;
    ctx.fillStyle = 'rgba(15,20,40,0.92)';
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = 2;
    ctx.fillRect(-4, -bh + 2, bw, bh);
    ctx.strokeRect(-4, -bh + 2, bw, bh);

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

    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillStyle = meta.color;
    ctx.fillText(meta.label, -2, -bh + 12);

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
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/character.ts
git commit -m "feat(client): migrate character module to TypeScript"
```

### Task 15: Migrate remaining frontend modules

**Files:**
- Create: `src/client/notifications.ts`
- Create: `src/client/sidebar.ts`
- Create: `src/client/panel.ts`
- Create: `src/client/interaction.ts`
- Create: `src/client/game.ts`
- Create: `src/client/components/event-stream.ts`
- Create: `src/client/components/particles.ts`
- Create: `src/client/components/pixel-logo.ts`
- Create: `src/client/components/stats.ts`
- Create: `src/client/components/timeline.ts`
- Create: `src/client/app.ts`

This task migrates all remaining frontend files. Each file follows the same pattern as the previous tasks: add TypeScript types to the existing logic without changing behavior.

- [ ] **Step 1: Create src/client/notifications.ts**

```typescript
import { TOAST_DURATION_MS, BADGE_FLASH_MS } from '../shared/constants.js';

export function showToast(msg: string): void {
  const area = document.getElementById('toast-area')!;
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = msg;
  area.appendChild(div);
  setTimeout(() => div.remove(), TOAST_DURATION_MS);
}

export function showBadge(id: string, status: string): void {
  const el = document.querySelector(`.sess-item[data-id="${id}"]`) as HTMLElement | null;
  if (!el) return;
  el.style.transition = 'background 0.3s';
  el.style.background = status === 'waiting' ? 'rgba(255,165,0,0.25)' : '';
  setTimeout(() => { el.style.background = ''; }, BADGE_FLASH_MS);
}
```

- [ ] **Step 2: Create src/client/sidebar.ts**

```typescript
import type { Session } from '../shared/types.js';
import { getToolMeta } from '../shared/tool-metadata.js';
import { prettyProject } from './utils/formatters.js';

export interface SidebarCallbacks {
  onSelect: (id: string) => void;
  onFocusWindow: (pid: number) => void;
}

export function renderSessionList(
  container: HTMLElement,
  list: Session[],
  selected: string | null,
  callbacks: SidebarCallbacks,
): void {
  const order: Record<string, number> = { waiting: 0, running: 1, idle: 2 };
  const sorted = [...list].sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2));
  container.innerHTML = '';
  for (const s of sorted) {
    container.appendChild(buildSessionItem(s, selected, callbacks));
  }
}

function buildSessionItem(
  s: Session,
  selected: string | null,
  callbacks: SidebarCallbacks,
): HTMLElement {
  const el = document.createElement('div');
  el.className = `sess-item ${s.status}`;
  el.dataset.id = s.sessionId;
  if (s.sessionId === selected) el.classList.add('selected');

  const tool = s.lastTool;
  const toolName = tool ? tool.name : '\u2014';
  const meta = getToolMeta(toolName);
  const ago = timeAgo(s.modifiedAt);
  const needsReview = s.status === 'waiting';

  const sourceBadge = s.source === 'codex'
    ? `<span class="source-badge codex" title="${'model' in s ? s.model : 'Codex'}">GPT</span>`
    : `<span class="source-badge claude" title="Claude Code">CC</span>`;

  el.innerHTML = `
    <div class="sess-top">
      <span class="sess-status-dot"></span>
      <span class="sess-id">${s.sessionId.slice(0, 8)}</span>
      ${sourceBadge}
      ${needsReview ? `<span class="sess-alert" title="Needs your review">\uD83D\uDD14</span>` : ''}
      ${s.pid ? `<button class="focus-btn" data-pid="${s.pid}" title="Focus terminal window">\uD83D\uDCCD</button>` : ''}
    </div>
    <div class="sess-project">${prettyProject(s.project)}</div>
    <div class="sess-status-row">
      <span class="sess-badge ${s.status}">${s.status.toUpperCase()}</span>
      <span class="sess-tool">${meta.icon} ${toolName}</span>
    </div>
    <div class="sess-meta">
      <span class="sess-count">${s.toolCount ?? 0} calls</span>
      <span class="sess-ago">${ago}</span>
    </div>
  `;

  const focusBtn = el.querySelector('.focus-btn') as HTMLElement | null;
  if (focusBtn && s.pid) {
    focusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      callbacks.onFocusWindow(s.pid!);
    });
  }

  el.addEventListener('click', () => callbacks.onSelect(s.sessionId));
  return el;
}

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  return Math.floor(s / 3600) + 'h ago';
}
```

- [ ] **Step 3: Create src/client/panel.ts**

```typescript
import type { Session, ToolCall } from '../shared/types.js';
import { getToolMeta } from '../shared/tool-metadata.js';
import { HISTORY_ITEMS } from '../shared/constants.js';
import { prettyProject, fmtDuration } from './utils/formatters.js';
import type { Character } from './character.js';
import { showToast } from './notifications.js';

interface PanelElements {
  sidePanel: HTMLElement;
  panelAvatar: HTMLElement;
  panelSession: HTMLElement;
  panelProject: HTMLElement;
  panelTool: HTMLElement;
  panelHistory: HTMLElement;
}

let elements: PanelElements | null = null;

export function initPanel(): PanelElements {
  elements = {
    sidePanel: document.getElementById('side-panel')!,
    panelAvatar: document.getElementById('panel-avatar')!,
    panelSession: document.getElementById('panel-session')!,
    panelProject: document.getElementById('panel-project')!,
    panelTool: document.getElementById('panel-tool')!,
    panelHistory: document.getElementById('panel-history')!,
  };
  return elements;
}

export function renderPanel(ch: Character, s: Session): void {
  if (!elements) return;

  elements.panelAvatar.innerHTML = '';
  const ac = document.createElement('canvas');
  ch.drawPortrait(ac);
  ac.style.width = '64px';
  ac.style.height = '64px';
  elements.panelAvatar.appendChild(ac);

  elements.panelSession.textContent = ch.id.slice(0, 16) + '...';
  elements.panelProject.textContent = prettyProject(ch.session.project)
    + (ch.session.source === 'codex' && 'model' in ch.session ? ` \u00B7 ${ch.session.model}` : '');

  // Focus window button
  const existingFocusBtn = document.getElementById('panel-focus-btn');
  if (existingFocusBtn) existingFocusBtn.remove();
  if (s?.pid) {
    const btn = document.createElement('button');
    btn.id = 'panel-focus-btn';
    btn.className = 'px-btn focus-panel-btn';
    btn.textContent = '\uD83D\uDCCD FOCUS WINDOW';
    btn.addEventListener('click', () => focusWindow(s.pid!));
    elements.panelProject.parentElement!.insertBefore(btn, elements.panelProject.nextSibling);
  }

  const tool = s?.lastTool ?? ch.currentTool;
  if (tool) {
    const meta = getToolMeta(tool.name);
    elements.panelTool.innerHTML = `
      <div style="color:${meta.color};font-size:10px;margin-bottom:4px">${meta.icon} ${tool.name}</div>
      <div style="color:#888;font-size:7px;word-break:break-all;line-height:1.5">${esc(getPreview(tool.input))}</div>
      <div style="color:${statusColor(tool.status)};font-size:7px;margin-top:4px">${tool.status.toUpperCase()}</div>
    `;
  } else {
    elements.panelTool.innerHTML = `<span style="color:#555">IDLE</span>`;
  }
}

export async function fetchHistory(ch: Character): Promise<void> {
  if (!elements) return;
  try {
    let toolCalls: ToolCall[];
    if (ch.session.source === 'codex') {
      const r = await fetch(`/api/codex-history?threadId=${encodeURIComponent(ch.session.sessionId)}`);
      const d = await r.json();
      toolCalls = (d.toolCalls || []).slice(-HISTORY_ITEMS).reverse();
    } else {
      const r = await fetch(`/api/transcript?path=${encodeURIComponent(ch.session.filePath!)}`);
      const d = await r.json();
      toolCalls = (d.toolCalls || []).slice(-HISTORY_ITEMS).reverse();
    }
    elements.panelHistory.innerHTML = toolCalls.map(tc => {
      const meta = getToolMeta(tc.name);
      return `<div class="ph-item ${tc.status}" style="border-color:${meta.color}">
        <span class="ph-name" style="color:${meta.color}">${meta.icon} ${tc.name}</span>
        <span class="ph-dur">${fmtDuration(tc.duration)}</span>
      </div>`;
    }).join('');
  } catch { /* ignore fetch errors */ }
}

export async function focusWindow(pid: number): Promise<void> {
  try {
    const res = await fetch('/api/focus-window', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid }),
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`\uD83D\uDCCD Focused: ${data.process}`);
    } else {
      showToast(`\u26A0\uFE0F ${data.reason}`);
    }
  } catch (err) {
    showToast(`\u26A0\uFE0F ${(err as Error).message}`);
  }
}

function getPreview(input: Record<string, unknown> | null): string {
  if (!input) return '';
  return String(
    input.command || input.file_path || input.pattern ||
    input.query || input.description || (input.prompt as string || '')
  ).slice(0, 80);
}

function statusColor(s: string): string {
  return s === 'running' ? '#ff0' : s === 'error' ? '#f44' : '#0f0';
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
```

- [ ] **Step 4: Create src/client/interaction.ts**

```typescript
import { CHARACTER_CLICK_RADIUS } from '../shared/constants.js';
import type { Character } from './character.js';

interface DragState {
  isDragging: boolean;
  dragMoved: boolean;
  dragStartX: number;
  dragStartY: number;
  dragStartCamX: number;
  dragStartCamY: number;
}

export interface InteractionCallbacks {
  clampCam: (cx: number, cy: number) => { x: number; y: number };
  getCharacters: () => Map<string, Character>;
  getCam: () => { x: number; y: number };
  setCam: (x: number, y: number) => void;
  selectSession: (id: string) => void;
  clearSelection: () => void;
  getSessions: () => Array<{ sessionId: string }>;
}

export function initInteraction(canvas: HTMLCanvasElement, callbacks: InteractionCallbacks): void {
  const drag: DragState = {
    isDragging: false,
    dragMoved: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartCamX: 0,
    dragStartCamY: 0,
  };

  canvas.addEventListener('mousedown', (e) => {
    drag.isDragging = true;
    drag.dragMoved = false;
    drag.dragStartX = e.clientX;
    drag.dragStartY = e.clientY;
    const cam = callbacks.getCam();
    drag.dragStartCamX = cam.x;
    drag.dragStartCamY = cam.y;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!drag.isDragging) return;
    const dx = e.clientX - drag.dragStartX;
    const dy = e.clientY - drag.dragStartY;
    if (Math.hypot(dx, dy) > 4) {
      drag.dragMoved = true;
      canvas.style.cursor = 'grabbing';
    }
    if (drag.dragMoved) {
      const c = callbacks.clampCam(drag.dragStartCamX - dx, drag.dragStartCamY - dy);
      callbacks.setCam(c.x, c.y);
    }
  });

  const endDrag = () => {
    drag.isDragging = false;
    canvas.style.cursor = 'default';
  };
  canvas.addEventListener('mouseup', endDrag);
  canvas.addEventListener('mouseleave', endDrag);

  canvas.addEventListener('click', (e) => {
    if (drag.dragMoved) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cam = callbacks.getCam();

    let closest: Character | null = null;
    let closestDist = CHARACTER_CLICK_RADIUS;
    for (const ch of callbacks.getCharacters().values()) {
      const d = Math.hypot(ch.x - cam.x - mx, ch.y - cam.y - my);
      if (d < closestDist) { closest = ch; closestDist = d; }
    }

    if (closest) {
      callbacks.selectSession(closest.id);
    } else {
      callbacks.clearSelection();
    }
  });

  // Space = cycle through sessions
  window.addEventListener('keydown', (e) => {
    const sessions = callbacks.getSessions();
    if (e.code === 'Space' && sessions.length) {
      e.preventDefault();
      const ids = sessions.map(s => s.sessionId);
      const cam = callbacks.getCam(); // just to check if selected
      const currentSelected = [...callbacks.getCharacters().values()].find(c => c.selected);
      const idx = currentSelected ? ids.indexOf(currentSelected.id) : -1;
      const next = ids[(idx + 1) % ids.length];
      callbacks.selectSession(next);
    }
  });
}
```

- [ ] **Step 5: Create src/client/game.ts**

This is the main entry point that wires everything together. Same logic as `public/js/game.js`, but imports from the extracted modules:

```typescript
import type { Session } from '../shared/types.js';
import { TILE_SIZE, MAP_W, MAP_H, CAMERA_LERP, LEGEND_TOOLS } from '../shared/constants.js';
import { generateMap, drawTile } from './world.js';
import { Character } from './character.js';
import { renderSessionList, type SidebarCallbacks } from './sidebar.js';
import { initPanel, renderPanel, fetchHistory, focusWindow } from './panel.js';
import { showToast, showBadge } from './notifications.js';
import { initInteraction } from './interaction.js';

// ── Setup ──
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const dpr = window.devicePixelRatio || 1;
const map = generateMap();

let characters = new Map<string, Character>();
let sessions: Session[] = [];
let selected: string | null = null;
let camX = 0, camY = 0, camTargetX = 0, camTargetY = 0;
let lastTime = 0;

// DOM refs
const activeBadge = document.getElementById('active-count')!;
const hudTime = document.getElementById('hud-time')!;
const sessionListEl = document.getElementById('session-list')!;
const sidebarCount = document.getElementById('sidebar-count')!;

const panelEls = initPanel();
const closePanel = document.getElementById('close-panel')!;

// ── Sidebar Collapse ──
const sidebar = document.getElementById('session-sidebar')!;
const toggleBtn = document.getElementById('sidebar-toggle')!;
toggleBtn.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  toggleBtn.textContent = sidebar.classList.contains('collapsed') ? '\u25B6' : '\u25C0';
  resize();
});

// ── Resize ──
function resize(): void {
  const sw = sidebar.offsetWidth;
  const W = window.innerWidth - sw;
  const H = window.innerHeight - 40;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ── Camera ──
const VIEW_W = () => canvas.width / dpr;
const VIEW_H = () => canvas.height / dpr;
const WORLD_W = MAP_W * TILE_SIZE;
const WORLD_H = MAP_H * TILE_SIZE;

function clampCam(cx: number, cy: number) {
  return {
    x: Math.max(0, Math.min(cx, WORLD_W - VIEW_W())),
    y: Math.max(0, Math.min(cy, WORLD_H - VIEW_H())),
  };
}

function centerOn(wx: number, wy: number): void {
  const c = clampCam(wx - VIEW_W() / 2, wy - VIEW_H() / 2);
  camTargetX = c.x;
  camTargetY = c.y;
}

centerOn(WORLD_W / 2, WORLD_H / 2);
camX = camTargetX;
camY = camTargetY;

// ── World render ──
function renderWorld(t: number): void {
  ctx.clearRect(0, 0, VIEW_W(), VIEW_H());
  const sx = Math.max(0, Math.floor(camX / TILE_SIZE));
  const sy = Math.max(0, Math.floor(camY / TILE_SIZE));
  const ex = Math.min(MAP_W, Math.ceil((camX + VIEW_W()) / TILE_SIZE));
  const ey = Math.min(MAP_H, Math.ceil((camY + VIEW_H()) / TILE_SIZE));
  for (let ty = sy; ty < ey; ty++) {
    for (let tx = sx; tx < ex; tx++) {
      drawTile(ctx, map[ty][tx], Math.floor(tx * TILE_SIZE - camX), Math.floor(ty * TILE_SIZE - camY), t);
    }
  }
}

// ── Game Loop ──
function gameLoop(ts: number): void {
  const dt = Math.min((ts - lastTime) / 1000, 0.1);
  lastTime = ts;

  camX += (camTargetX - camX) * CAMERA_LERP;
  camY += (camTargetY - camY) * CAMERA_LERP;

  renderWorld(ts);

  const chars = [...characters.values()].sort((a, b) => a.y - b.y);
  for (const ch of chars) {
    ch.update(dt, ts);
    ch.draw(ctx, camX, camY, ts);
  }

  hudTime.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame((ts) => { lastTime = ts; gameLoop(ts); });

// ── SSE ──
const evtSrc = new EventSource('/api/watch-active');
evtSrc.onmessage = (e) => {
  try {
    const data = JSON.parse(e.data);
    if (data.type === 'update') reconcileSessions(data.sessions || []);
  } catch { /* ignore */ }
};

function reconcileSessions(incoming: Session[]): void {
  const ids = new Set(incoming.map(s => s.sessionId));

  for (const [id] of characters) {
    if (!ids.has(id)) {
      characters.delete(id);
      showToast(`\u2B1C Session ended: ${id.slice(0, 8)}`);
    }
  }

  for (const session of incoming) {
    const id = session.sessionId;
    if (!characters.has(id)) {
      characters.set(id, new Character(session, map));
      showToast(`\u2B1B New session: ${id.slice(0, 8)}`);
    } else {
      const prev = sessions.find(s => s.sessionId === id);
      const ch = characters.get(id)!;
      if (prev?.status === 'running' && session.status === 'waiting') {
        showToast(`\uD83D\uDD14 Needs review: ${id.slice(0, 8)}`);
        showBadge(id, 'waiting');
      }
      ch.updateSession(session);
    }
  }

  sessions = incoming;
  activeBadge.textContent = `${characters.size} ACTIVE`;
  sidebarCount.textContent = String(characters.size);

  const sidebarCallbacks: SidebarCallbacks = {
    onSelect: selectSession,
    onFocusWindow: focusWindow,
  };
  renderSessionList(sessionListEl, incoming, selected, sidebarCallbacks);

  if (selected && characters.has(selected)) {
    const s = incoming.find(s => s.sessionId === selected);
    if (s) renderPanel(characters.get(selected)!, s);
  }
}

// ── Selection ──
function selectSession(id: string): void {
  selected = id;
  const ch = characters.get(id);
  const s = sessions.find(s => s.sessionId === id);
  if (!ch || !s) return;

  for (const c of characters.values()) c.selected = false;
  ch.selected = true;
  centerOn(ch.x, ch.y);

  renderPanel(ch, s);
  fetchHistory(ch);
  panelEls.sidePanel.classList.remove('hidden');

  document.querySelectorAll('.sess-item').forEach(el => {
    (el as HTMLElement).classList.toggle('selected', (el as HTMLElement).dataset.id === id);
  });
}

function clearSelection(): void {
  panelEls.sidePanel.classList.add('hidden');
  selected = null;
  for (const ch of characters.values()) ch.selected = false;
  document.querySelectorAll('.sess-item').forEach(el => el.classList.remove('selected'));
}

closePanel.addEventListener('click', clearSelection);

// ── Interaction ──
initInteraction(canvas, {
  clampCam,
  getCharacters: () => characters,
  getCam: () => ({ x: camX, y: camY }),
  setCam: (x, y) => { camX = camTargetX = x; camY = camTargetY = y; },
  selectSession,
  clearSelection,
  getSessions: () => sessions,
});

// ── Legend ──
document.getElementById('legend-items')!.innerHTML = LEGEND_TOOLS.map(([name, icon, color]) => `
  <div class="legend-item">
    <div class="legend-dot" style="background:${color}"></div>
    ${icon} ${name}
  </div>
`).join('');
```

- [ ] **Step 6: Create remaining component files**

Migrate each component from `public/js/components/` to `src/client/components/` with TypeScript types added. The logic stays identical — only add type annotations to function parameters, class properties, and return types. Import `getToolColor`/`fmtDuration` from `../utils/formatters.js` (which re-exports from shared).

Files to create (each is a direct typed port of the original):
- `src/client/components/event-stream.ts` — from `public/js/components/event-stream.js`
- `src/client/components/particles.ts` — from `public/js/components/particles.js`
- `src/client/components/pixel-logo.ts` — from `public/js/components/pixel-logo.js`
- `src/client/components/stats.ts` — from `public/js/components/stats.js`
- `src/client/components/timeline.ts` — from `public/js/components/timeline.js`

- [ ] **Step 7: Create src/client/app.ts**

Direct typed port of `public/js/app.js`. Add types to state variables, function parameters, and DOM element refs. Import components from `./components/` and utils from `./utils/`.

- [ ] **Step 8: Commit**

```bash
git add src/client/
git commit -m "feat(client): complete frontend TypeScript migration"
```

---

## Phase 5: Wiring & Verification

### Task 16: Update HTML and verify full build

**Files:**
- Modify: `public/index.html` (line 62)
- Delete: `server.js` (after verification)
- Delete: `public/js/` (after verification)

- [ ] **Step 1: Update index.html script src**

Change line 62 from:
```html
<script type="module" src="/js/game.js"></script>
```
to:
```html
<script type="module" src="/dist/game.js"></script>
```

- [ ] **Step 2: Build frontend**

```bash
npm run build:client
```

Expected: `public/dist/game.js` created.

- [ ] **Step 3: Run typecheck on both configs**

```bash
npx tsc --noEmit -p tsconfig.server.json && npx tsc --noEmit -p tsconfig.client.json
```

Expected: no errors.

- [ ] **Step 4: Run ESLint**

```bash
npx eslint src/
```

Expected: no errors (warnings for `@typescript-eslint/no-explicit-any` are acceptable).

- [ ] **Step 5: Start server and verify in browser**

```bash
npm start
```

Open http://localhost:3333, verify:
- World renders correctly
- Characters appear for active sessions
- Sidebar shows sessions with correct status
- Clicking a character opens the detail panel
- SSE updates work (sessions update every 4 seconds)
- Focus window button works (if sessions are active)

- [ ] **Step 6: Remove old JS files** (only after verification passes)

```bash
rm server.js
rm -rf public/js/
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: complete TypeScript migration, remove legacy JS"
```

---

## Phase 6: Claude Code Hooks

### Task 17: Add lint + typecheck hooks

**Files:**
- Modify: `.claude/settings.json` (or create if doesn't exist)

- [ ] **Step 1: Create .claude/settings.json with hooks**

```json
{
  "hooks": {
    "postToolUse": [
      {
        "matcher": "Write|Edit",
        "command": "bash -c 'CHANGED=\"$CLAUDE_FILE_PATHS\"; if echo \"$CHANGED\" | grep -q \"\\.ts$\"; then echo \"Running lint + typecheck...\"; npx eslint $CHANGED 2>&1 | head -30; npx tsc --noEmit -p tsconfig.server.json 2>&1 | head -20; npx tsc --noEmit -p tsconfig.client.json 2>&1 | head -20; fi'"
      }
    ]
  }
}
```

**What this does:** After every Write or Edit tool call, if any changed file ends in `.ts`, it runs ESLint on the changed files and tsc typecheck on both configs. Output is truncated to avoid flooding context.

- [ ] **Step 2: Verify hook fires**

Make a trivial edit to any `.ts` file and confirm lint + typecheck output appears.

- [ ] **Step 3: Commit**

```bash
git add .claude/settings.json
git commit -m "feat: add Claude Code hooks for lint + typecheck on .ts changes"
```

---

## Phase 7: Update CLAUDE.md

### Task 18: Update CLAUDE.md for TypeScript project

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update tech stack table**

Replace the JS-specific entries with TypeScript equivalents. Update:
- Tech stack: TypeScript, ESLint, esbuild, tsx
- Project structure: `src/` layout
- Red lines: update to reflect TS project (keep no-framework rule, update no-TypeScript → must-use-TypeScript)
- Development commands: `npm run dev`, `npm run lint`, `npm run typecheck`
- Remove references to `public/js/` files

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for TypeScript project"
```
