# 👾 Claude Visual — Pixel World

A real-time pixel-art dashboard that turns your active Claude Code sessions into animated characters roaming a game world.

![Claude Visual Screenshot](https://raw.githubusercontent.com/Jettlin927/Session-visual/main/public/preview.png)

## What it does

Every active Claude Code session becomes a pixel character on a shared map. Characters walk around, display speech bubbles showing the current tool being used, and update live via Server-Sent Events. You can click any character (or session in the sidebar) to inspect its tool call history in detail.

**Status indicators:**
- 🟡 `RUNNING` — Claude is actively executing a tool
- 🔔 `WAITING` — Claude has responded and is waiting for your input
- ⚫ `IDLE` — no recent activity

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
- **Session status** — inferred from whether the last message is an unresolved `tool_use`, a user message, or an assistant text reply
- **Tool count** — number of tool calls in the last 80 lines

### Character generation

Each character's appearance (skin color, shirt color, hair color, hat type) is deterministically generated from a hash of the session ID, so the same session always produces the same character.

### Tool color coding

| Tool | Icon | Color |
|------|------|-------|
| Bash | ⚡ | amber |
| Read | 📖 | cyan |
| Edit / Write | ✏️ 💾 | green |
| Grep / Glob | 🔍 🔮 | purple |
| Agent | 🤖 | magenta |
| WebFetch / WebSearch | 🌐 🔎 | blue |

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Space` | Cycle through active sessions |
| Click character | Select and open detail panel |
| Click map (empty) | Deselect |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3333` | HTTP server port |
| `HOME` | system | Used to locate `~/.claude/projects/` |

Active session threshold: sessions modified within **30 minutes** are shown. Status transitions to `idle` after **10 minutes** of no new messages.

## License

MIT
