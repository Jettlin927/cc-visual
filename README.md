# 👾 Claude Visual — Pixel World

A real-time pixel-art dashboard that turns your active Claude Code sessions into animated characters roaming a game world.

![Claude Visual Screenshot](https://raw.githubusercontent.com/Jettlin927/Session-visual/main/public/preview.png)

## What it does

Every active Claude Code session becomes a pixel character on a shared map. Characters walk around, display speech bubbles showing the current tool being used, and update live via Server-Sent Events. You can click any character (or session in the sidebar) to inspect its tool call history in detail.

**Status indicators:**
- 🟡 `RUNNING` — Claude is actively executing a tool; character walks and strikes a tool-specific pose
- 🔔 `WAITING` — Claude has responded and is waiting for your input; character stops and shows a pulsing `!` bubble with arm raised
- ⚫ `IDLE` — no recent activity; character crouches, breathes slowly, and stays put

**Tool-specific poses (while RUNNING):**

| Tool | Pose |
|------|------|
| Bash | Both arms forward (typing) |
| Read | Both arms raised (holding book) |
| Edit / Write | Right arm raised with yellow pen prop |
| Grep / Glob | Right hand shielding eyes (searching) |
| Agent | Both arms raised in a V |
| WebFetch / WebSearch | Right hand raised to forehead (looking up) |

## Getting started

**Requirements:** Node.js 18+, Claude Code installed (sessions stored in `~/.claude/projects/`)

```bash
git clone https://github.com/Jettlin927/Session-visual.git
cd Session-visual
npm start
```

Then open [http://localhost:3333](http://localhost:3333).

The server auto-installs dependencies on first run (`prestart` hook).

## How it works

```
~/.claude/projects/          ← Claude Code writes session logs here
       │
       ▼
  server.js (Express)
  ├── GET  /api/projects      → all sessions (sorted by modified time)
  ├── GET  /api/active        → sessions modified within last 30 min
  ├── GET  /api/transcript    → full tool call history for a session
  ├── SSE  /api/watch         → file-level change events
  └── SSE  /api/watch-active  → polls active sessions every 4s, pushes updates
       │
       ▼
  public/js/ (vanilla JS + Canvas)
  ├── game.js      — main game loop, SSE listener, camera, input
  ├── character.js — pixel character rendering, walking AI, tool bubbles
  ├── world.js     — procedural tile map generation
  └── app.js       — sidebar, panel, toast notifications
```

### Session parsing

Each Claude Code session is a `.jsonl` file. The server parses these to extract:
- **Last tool call** — name, input preview, status (`running` / `done` / `error`), duration
- **Session status** — determined by two signals in combination:
  1. **Process liveness** (`~/.claude/sessions/{pid}.json`) — if the Claude process is dead, the session is `idle` regardless of JSONL content
  2. **JSONL last entry** — if alive, distinguishes `running` (unresolved tool call, or last entry is a `tool_result`) from `waiting` (last assistant message is plain text, meaning Claude has replied and is waiting for human input)
- **Tool count** — number of tool calls in the last 150 lines

### Character generation

Each character's appearance (skin color, shirt color, hair color, hat type) is deterministically generated from a hash of the session ID, so the same session always produces the same character. The name tag above each character shows the project directory name (e.g. `claude-visual`) instead of a raw session ID.

### Tool color coding

| Tool | Icon | Color |
|------|------|-------|
| Bash | ⚡ | amber |
| Read | 📖 | cyan |
| Edit / Write | ✏️ 💾 | green |
| Grep / Glob | 🔍 🔮 | purple |
| Agent | 🤖 | magenta |
| WebFetch / WebSearch | 🌐 🔎 | blue |

## Controls

| Input | Action |
|-------|--------|
| `Space` | Cycle through active sessions |
| Click character | Select and open detail panel |
| Click map (empty) | Deselect |
| Drag map | Pan the camera |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3333` | HTTP server port |
| `HOME` | system | Used to locate `~/.claude/projects/` |

Active session threshold: sessions modified within **30 minutes** are shown. Status transitions to `idle` as soon as the Claude process exits — long-running tools (slow Bash, API retries) correctly stay `running` even when the `.jsonl` file is temporarily silent.

## License

MIT
