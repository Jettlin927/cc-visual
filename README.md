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

---

# 👾 Claude Visual — 像素世界（中文说明）

一个实时像素风仪表盘，将你所有活跃的 Claude Code 会话变成在游戏地图上漫游的像素小人。

## 功能介绍

每个活跃的 Claude Code 会话都会生成一个专属像素角色，在共享地图上自由行走。角色会通过动作和气泡实时反映当前会话的状态，帮助你一眼找出哪个任务在等你介入。

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

**环境要求：** Node.js 18+，已安装 Claude Code（会话日志存储在 `~/.claude/projects/`）

```bash
git clone https://github.com/Jettlin927/Session-visual.git
cd Session-visual
npm start
```

然后打开 [http://localhost:3333](http://localhost:3333)。

首次运行时通过 `prestart` 钩子自动安装依赖。

## 工作原理

```
~/.claude/projects/        ← Claude Code 的会话日志目录
~/.claude/sessions/        ← 进程登记表（用于判断进程是否存活）
       │
       ▼
  server.js (Express)
  ├── GET  /api/projects      → 所有会话（按修改时间排序）
  ├── GET  /api/active        → 30 分钟内活跃的会话
  ├── GET  /api/transcript    → 某个会话的完整工具调用历史
  └── SSE  /api/watch-active  → 每 4 秒推送活跃会话更新
       │
       ▼
  public/js/ (原生 JS + Canvas)
  ├── game.js      — 游戏主循环、SSE 监听、相机、输入
  ├── character.js — 像素角色渲染、行走 AI、工具气泡
  └── world.js     — 程序化生成地图
```

### 会话状态检测

状态判断采用两个信号的组合：

1. **进程存活检查** (`~/.claude/sessions/{pid}.json`) — 进程已死则直接标记为 `idle`，不依赖文件时间戳
2. **JSONL 最后条目** — 进程存活时，通过最后一条有效消息区分 `running`（工具未完成，或最后是 `tool_result`）和 `waiting`（最后是 assistant 纯文本，Claude 已回复在等人）

这样可以正确处理 API 超时重试、慢速 Bash 命令等场景——即使 `.jsonl` 文件暂时无新内容，只要进程还在就保持 `running`。

### 角色外观生成

每个角色的外观（肤色、衣服颜色、发色、帽子类型）由 session ID 的哈希值确定性生成，同一个 session 永远对应同一个角色。角色头顶显示项目目录名（如 `claude-visual`）而非原始 session ID，便于快速定位。

### 工具颜色对照

| 工具 | 图标 | 颜色 |
|------|------|------|
| Bash | ⚡ | 琥珀色 |
| Read | 📖 | 青色 |
| Edit / Write | ✏️ 💾 | 绿色 |
| Grep / Glob | 🔍 🔮 | 紫色 |
| Agent | 🤖 | 品红 |
| WebFetch / WebSearch | 🌐 🔎 | 蓝色 |

## 操作说明

| 操作 | 功能 |
|------|------|
| `Space` | 循环切换活跃会话 |
| 点击角色 | 选中并打开详情面板 |
| 点击空白地图 | 取消选中 |
| 拖动地图 | 平移视角 |

## 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3333` | HTTP 服务端口 |
| `HOME` | 系统默认 | 用于定位 `~/.claude/` 目录 |

活跃会话阈值：**30 分钟**内有修改的会话会显示在地图上。
