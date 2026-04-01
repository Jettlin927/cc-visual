# 👾 CC Visual — Pixel World

> **[中文说明](./README.md)**

A real-time pixel-art dashboard that turns your active **Claude Code** and **OpenAI Codex** sessions into animated characters roaming a game world.

![CC Visual Screenshot](https://raw.githubusercontent.com/Jettlin927/cc-visual/main/preview.png)

## Supported AI Coding Tools

| Tool | Data Source | Status Detection |
|------|-----------|------------------|
| **Claude Code** | `~/.claude/projects/*.jsonl` | Process liveness + JSONL parsing |
| **OpenAI Codex** | `~/.codex/state_5.sqlite` + `logs_1.sqlite` | Process liveness + SQLite log events |

Source badges in the sidebar distinguish sessions: `CC` (green) = Claude Code, `GPT` (blue) = Codex. Codex characters also have blue name tags on the map.

## What it does

Every active Claude Code or Codex session becomes a pixel character on a shared map. Characters walk around, display speech bubbles showing the current tool being used, and update live via Server-Sent Events. You can click any character (or session in the sidebar) to inspect its tool call history in detail.

**Status indicators:**
- 🟡 `RUNNING` — actively executing a tool; character walks and strikes a tool-specific pose
- 🔔 `WAITING` — responded and waiting for your input; character stops and shows a pulsing `!` bubble with arm raised
- ⚫ `IDLE` — process exited or no recent activity; character crouches and breathes slowly

**Tool-specific poses (while RUNNING):**

| Tool | Pose |
|------|------|
| Bash / exec_command | Both arms forward (typing) |
| Read / read_file | Both arms raised (holding book) |
| Edit / Write | Right arm raised with yellow pen prop |
| Grep / Glob | Right hand shielding eyes (searching) |
| Agent | Both arms raised in a V |
| WebFetch / WebSearch | Right hand raised to forehead (looking up) |

## Getting started

**Requirements:** Node.js 22+ (uses built-in `node:sqlite` for Codex support), Claude Code and/or Codex installed

```bash
git clone https://github.com/Jettlin927/cc-visual.git
cd cc-visual
npm start
```

Then open [http://localhost:3333](http://localhost:3333). Dependencies are auto-installed on first run.

## How it works

```
~/.claude/projects/        ← Claude Code session logs (JSONL)
~/.claude/sessions/        ← Claude Code process registry
~/.codex/state_5.sqlite    ← Codex thread state (SQLite)
~/.codex/logs_1.sqlite     ← Codex activity logs (SQLite)
       │
       ▼
  server.js (Express)
  ├── GET  /api/active          → all active sessions (Claude + Codex, last 30 min)
  ├── GET  /api/transcript      → Claude session tool call history
  ├── GET  /api/codex-history   → Codex thread tool call history
  └── SSE  /api/watch-active    → polls all active sessions every 4s, pushes updates
       │
       ▼
  public/js/ (vanilla JS + Canvas)
  ├── game.js      — main game loop, SSE listener, camera, input
  ├── character.js — pixel character rendering, walking AI, tool bubbles
  └── world.js     — procedural tile map generation
```

### Session parsing

**Claude Code:** Each session is a `.jsonl` file. The server parses these to extract:
- **Last tool call** — name, input preview, status (`running` / `done` / `error`), duration
- **Session status** — determined by two signals:
  1. **Process liveness** (`~/.claude/sessions/{pid}.json`) — if dead, session is `idle`
  2. **JSONL last entry** — if alive, distinguishes `running` (unresolved tool call or `tool_result`) from `waiting` (pure assistant text)
- **Tool count** — number of tool calls in the last 150 lines

**Codex:** Sessions are read from two SQLite databases via Node.js built-in `node:sqlite`:
- **`state_5.sqlite`** → thread metadata (id, title, cwd, model, updated_at)
- **`logs_1.sqlite`** → process PID (from `process_uuid`), tool results (from `codex.tool_result` events), status detection (`response.completed` → waiting)

### Character generation

Each character's appearance (skin color, shirt color, hair color, hat type) is deterministically generated from a hash of the session ID, so the same session always produces the same character. The name tag shows the project directory name (e.g. `cc-visual`) instead of a raw session ID.

### Tool color coding

| Claude Code Tool | Codex Tool | Icon | Color |
|------------------|------------|------|-------|
| Bash | exec_command | ⚡ | amber |
| Read | read_file | 📖 | cyan |
| Edit / Write | str_replace_based_edit_tool / write_file | ✏️ 💾 | green |
| Grep / Glob | grep_search / glob_search | 🔍 🔮 | purple |
| Agent | — | 🤖 | magenta |
| WebFetch / WebSearch | web_fetch / web_search | 🌐 🔎 | blue |
| — | write_stdin | ⌨️ | amber |

## Controls

| Input | Action |
|-------|--------|
| `Space` | Cycle through active sessions |
| Click character | Select and open detail panel |
| Click map (empty) | Deselect |
| Drag map | Pan the camera |

## Configuration

Edit **`config.json`** in the project root:

```json
{
  "port": 3333,
  "claudeDir": "~/.claude",
  "codexDir": "~/.codex",
  "activeThresholdMinutes": 30
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `port` | `3333` | HTTP server port (`PORT` env var takes precedence) |
| `claudeDir` | `~/.claude` | Path to Claude data directory (`~` expanded automatically) |
| `codexDir` | `~/.codex` | Path to Codex data directory (silently skipped if missing) |
| `activeThresholdMinutes` | `30` | Sessions not modified within this window are hidden |

## License

MIT
