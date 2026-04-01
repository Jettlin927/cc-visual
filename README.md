# 👾 Claude Visual — Pixel World

A real-time pixel-art dashboard that turns your active **Claude Code** and **OpenAI Codex** sessions into animated characters roaming a game world.

![Claude Visual Screenshot](https://raw.githubusercontent.com/Jettlin927/cc-visual/main/preview.png)

## What it does

Every active Claude Code or Codex session becomes a pixel character on a shared map. Characters walk around, display speech bubbles showing the current tool being used, and update live via Server-Sent Events. You can click any character (or session in the sidebar) to inspect its tool call history in detail.

**Source badges** in the sidebar distinguish sessions: `CC` (green) = Claude Code, `GPT` (blue) = Codex. Codex characters also have blue name tags on the map.

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

**Requirements:** Node.js 22+ (uses built-in `node:sqlite` for Codex support), Claude Code and/or Codex installed

```bash
git clone https://github.com/Jettlin927/cc-visual.git
cd cc-visual
npm start
```

Then open [http://localhost:3333](http://localhost:3333).

The server auto-installs dependencies on first run (`prestart` hook).

## How it works

```
~/.claude/projects/          ← Claude Code session logs (JSONL)
~/.codex/state_5.sqlite      ← Codex thread state (SQLite)
~/.codex/logs_1.sqlite       ← Codex activity logs (SQLite)
       │
       ▼
  server.js (Express)
  ├── GET  /api/projects        → all Claude sessions (sorted by modified time)
  ├── GET  /api/active          → all active sessions (Claude + Codex, last 30 min)
  ├── GET  /api/transcript      → Claude session tool call history
  ├── GET  /api/codex-history   → Codex thread tool call history
  ├── SSE  /api/watch           → file-level change events
  └── SSE  /api/watch-active    → polls all active sessions every 4s, pushes updates
       │
       ▼
  public/js/ (vanilla JS + Canvas)
  ├── game.js      — main game loop, SSE listener, camera, input
  ├── character.js — pixel character rendering, walking AI, tool bubbles
  ├── world.js     — procedural tile map generation
  └── app.js       — sidebar, panel, toast notifications
```

### Session parsing

**Claude Code:** Each session is a `.jsonl` file. The server parses these to extract:
- **Last tool call** — name, input preview, status (`running` / `done` / `error`), duration
- **Session status** — determined by two signals in combination:
  1. **Process liveness** (`~/.claude/sessions/{pid}.json`) — if the Claude process is dead, the session is `idle` regardless of JSONL content
  2. **JSONL last entry** — if alive, distinguishes `running` (unresolved tool call, or last entry is a `tool_result`) from `waiting` (last assistant message is plain text, meaning Claude has replied and is waiting for human input)
- **Tool count** — number of tool calls in the last 150 lines

**Codex:** Sessions are read from two SQLite databases via Node.js built-in `node:sqlite`:
- **`state_5.sqlite`** → thread metadata (id, title, cwd, model, updated_at)
- **`logs_1.sqlite`** → activity logs, process PID (extracted from `process_uuid` field), tool results (parsed from `codex.tool_result` log events)
- **Status detection** — PID liveness check + last log event type (`response.completed` → waiting, otherwise → running)

### Character generation

Each character's appearance (skin color, shirt color, hair color, hat type) is deterministically generated from a hash of the session ID, so the same session always produces the same character. The name tag above each character shows the project directory name (e.g. `claude-visual`) instead of a raw session ID.

### Tool color coding

| Tool (Claude Code) | Tool (Codex) | Icon | Color |
|---------------------|--------------|------|-------|
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
| `port` | `3333` | HTTP server port |
| `claudeDir` | `~/.claude` | Path to your Claude data directory (`~` expanded automatically). Both `{claudeDir}/projects/` (session logs) and `{claudeDir}/sessions/` (process registry) are derived from this value. |
| `codexDir` | `~/.codex` | Path to your Codex data directory. The server reads `{codexDir}/state_5.sqlite` and `{codexDir}/logs_1.sqlite`. If the directory doesn't exist, Codex support is silently skipped. |
| `activeThresholdMinutes` | `30` | Sessions not modified within this window are hidden from the map |

The `PORT` environment variable overrides `config.json` if set.

Active session threshold: sessions modified within the configured window are shown. Status transitions to `idle` as soon as the process exits — long-running tools (slow Bash, API retries) correctly stay `running` even when the log file is temporarily silent.

## License

MIT

---

# 👾 Claude Visual — 像素世界（中文说明）

一个实时像素风仪表盘，将你所有活跃的 **Claude Code** 和 **OpenAI Codex** 会话变成在游戏地图上漫游的像素小人。

## 功能介绍

每个活跃的 Claude Code 或 Codex 会话都会生成一个专属像素角色，在共享地图上自由行走。角色会通过动作和气泡实时反映当前会话的状态，帮助你一眼找出哪个任务在等你介入。

**来源标识**：侧边栏中 `CC`（绿色）= Claude Code，`GPT`（蓝色）= Codex。Codex 角色在地图上的名牌也是蓝色背景。

**状态说明：**
- 🟡 `RUNNING`（运行中）— Claude 正在执行工具；角色走路，并根据工具类型摆出对应姿势
- 🔔 `WAITING`（等待检阅）— Claude 已回复，在等你输入；角色静止，右手举起，头顶显示闪烁的 `!` 气泡
- ⚫ `IDLE`（空闲）— 无近期活动；角色蹲下、缓慢呼吸，静止不动

**工具对应姿势（RUNNING 状态时）：**

| 工具 | 姿势 |
|------|------|
| Bash | 双臂前伸（打字） |
| Read | 双臂微抬（捧书） |
| Edit / Write | 右臂上举，持黄色笔道具 |
| Grep / Glob | 右手遮眼（眺望搜索） |
| Agent | 双臂 V 字举起 |
| WebFetch / WebSearch | 右手遮额，抬头看 |

## 快速开始

**环境要求：** Node.js 22+（使用内置 `node:sqlite` 支持 Codex），已安装 Claude Code 和/或 Codex

```bash
git clone https://github.com/Jettlin927/cc-visual.git
cd cc-visual
npm start
```

然后打开 [http://localhost:3333](http://localhost:3333)。

首次运行时通过 `prestart` 钩子自动安装依赖。

## 工作原理

```
~/.claude/projects/        ← Claude Code 的会话日志目录（JSONL）
~/.codex/state_5.sqlite    ← Codex 线程状态（SQLite）
~/.codex/logs_1.sqlite     ← Codex 活动日志（SQLite）
       │
       ▼
  server.js (Express)
  ├── GET  /api/projects        → 所有 Claude 会话（按修改时间排序）
  ├── GET  /api/active          → 所有活跃会话（Claude + Codex，30 分钟内）
  ├── GET  /api/transcript      → Claude 会话工具调用历史
  ├── GET  /api/codex-history   → Codex 线程工具调用历史
  └── SSE  /api/watch-active    → 每 4 秒推送所有活跃会话更新
       │
       ▼
  public/js/ (原生 JS + Canvas)
  ├── game.js      — 游戏主循环、SSE 监听、相机、输入
  ├── character.js — 像素角色渲染、行走 AI、工具气泡
  └── world.js     — 程序化生成地图
```

### 会话状态检测

**Claude Code：** 状态判断采用两个信号的组合：

1. **进程存活检查** (`~/.claude/sessions/{pid}.json`) — 进程已死则直接标记为 `idle`，不依赖文件时间戳
2. **JSONL 最后条目** — 进程存活时，通过最后一条有效消息区分 `running`（工具未完成，或最后是 `tool_result`）和 `waiting`（最后是 assistant 纯文本，Claude 已回复在等人）

**Codex：** 通过 Node.js 内置 `node:sqlite` 读取两个 SQLite 数据库：

1. **`state_5.sqlite`** → 线程元数据（id、标题、工作目录、模型、更新时间）
2. **`logs_1.sqlite`** → 活动日志、进程 PID（从 `process_uuid` 字段提取）、工具结果（解析 `codex.tool_result` 日志事件）
3. **状态检测** — PID 存活检查 + 最后日志事件类型（`response.completed` → waiting，否则 → running）

### 角色外观生成

每个角色的外观（肤色、衣服颜色、发色、帽子类型）由 session ID 的哈希值确定性生成，同一个 session 永远对应同一个角色。角色头顶显示项目目录名（如 `claude-visual`）而非原始 session ID，便于快速定位。

### 工具颜色对照

| 工具（Claude Code） | 工具（Codex） | 图标 | 颜色 |
|---------------------|--------------|------|------|
| Bash | exec_command | ⚡ | 琥珀色 |
| Read | read_file | 📖 | 青色 |
| Edit / Write | str_replace_based_edit_tool / write_file | ✏️ 💾 | 绿色 |
| Grep / Glob | grep_search / glob_search | 🔍 🔮 | 紫色 |
| Agent | — | 🤖 | 品红 |
| WebFetch / WebSearch | web_fetch / web_search | 🌐 🔎 | 蓝色 |
| — | write_stdin | ⌨️ | 琥珀色 |

## 操作说明

| 操作 | 功能 |
|------|------|
| `Space` | 循环切换活跃会话 |
| 点击角色 | 选中并打开详情面板 |
| 点击空白地图 | 取消选中 |
| 拖动地图 | 平移视角 |

## 配置

编辑项目根目录的 **`config.json`**：

```json
{
  "port": 3333,
  "claudeDir": "~/.claude",
  "codexDir": "~/.codex",
  "activeThresholdMinutes": 30
}
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `port` | `3333` | HTTP 服务端口 |
| `claudeDir` | `~/.claude` | Claude 数据目录路径（`~` 自动展开）。`{claudeDir}/projects/`（会话日志）和 `{claudeDir}/sessions/`（进程登记表）均从此字段推导 |
| `codexDir` | `~/.codex` | Codex 数据目录路径。服务器读取 `{codexDir}/state_5.sqlite` 和 `{codexDir}/logs_1.sqlite`。目录不存在时自动跳过 |
| `activeThresholdMinutes` | `30` | 超过此分钟数未修改的会话将从地图上隐藏 |

环境变量 `PORT` 的优先级高于 `config.json`。
