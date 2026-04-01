# 👾 CC Visual — 像素世界

> **[English](./README_EN.md)**

实时像素风仪表盘，将你所有活跃的 **Claude Code** 和 **OpenAI Codex** 会话变成在游戏地图上漫游的像素小人。

![CC Visual Screenshot](https://raw.githubusercontent.com/Jettlin927/cc-visual/main/preview.png)

## 支持的 AI 编程工具

| 工具 | 数据来源 | 状态检测方式 |
|------|----------|-------------|
| **Claude Code** | `~/.claude/projects/*.jsonl` | 进程存活 + JSONL 解析 |
| **OpenAI Codex** | `~/.codex/state_5.sqlite` + `logs_1.sqlite` | 进程存活 + SQLite 日志事件 |

侧边栏通过来源徽章区分会话：`CC`（绿色）= Claude Code，`GPT`（蓝色）= Codex。Codex 角色在地图上的名牌也是蓝色背景，一眼就能分清。

## 功能介绍

每个活跃会话都会生成一个专属像素角色，在共享地图上自由行走。角色会通过动作和气泡实时反映当前会话的状态，帮助你一眼找出哪个任务在等你介入。

**状态说明：**
- 🟡 `RUNNING`（运行中）— 正在执行工具；角色走路，并根据工具类型摆出对应姿势
- 🔔 `WAITING`（等待检阅）— 已回复，在等你输入；角色静止，右手举起，头顶显示闪烁的 `!` 气泡
- ⚫ `IDLE`（空闲）— 进程已退出或无近期活动；角色蹲下、缓慢呼吸

**工具对应姿势（RUNNING 状态时）：**

| 工具 | 姿势 |
|------|------|
| Bash / exec_command | 双臂前伸（打字） |
| Read / read_file | 双臂微抬（捧书） |
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

然后打开 [http://localhost:3333](http://localhost:3333)。首次运行时自动安装依赖。

## 工作原理

```
~/.claude/projects/        ← Claude Code 会话日志（JSONL）
~/.claude/sessions/        ← Claude Code 进程登记表
~/.codex/state_5.sqlite    ← Codex 线程状态（SQLite）
~/.codex/logs_1.sqlite     ← Codex 活动日志（SQLite）
       │
       ▼
  server.js (Express)
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

**Claude Code：** 两个信号组合判断：

1. **进程存活检查** (`~/.claude/sessions/{pid}.json`) — 进程已死则直接标记为 `idle`
2. **JSONL 最后条目** — 进程存活时，区分 `running`（工具未完成 / 最后是 `tool_result`）和 `waiting`（最后是 assistant 纯文本）

**Codex：** 通过 `node:sqlite` 读取 SQLite 数据库：

1. **`state_5.sqlite`** → 线程元数据（id、标题、工作目录、模型、更新时间）
2. **`logs_1.sqlite`** → 从 `process_uuid` 提取 PID 做存活检测；解析 `codex.tool_result` 获取工具调用；`response.completed` 事件判断 waiting 状态

### 角色外观生成

每个角色的外观（肤色、衣服颜色、发色、帽子类型）由 session ID 的哈希值确定性生成，同一个 session 永远对应同一个角色。角色头顶显示项目目录名（如 `cc-visual`）而非原始 session ID。

### 工具颜色对照

| Claude Code 工具 | Codex 工具 | 图标 | 颜色 |
|------------------|------------|------|------|
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
| `port` | `3333` | HTTP 服务端口（环境变量 `PORT` 优先） |
| `claudeDir` | `~/.claude` | Claude 数据目录路径（`~` 自动展开） |
| `codexDir` | `~/.codex` | Codex 数据目录路径（不存在时自动跳过） |
| `activeThresholdMinutes` | `30` | 超过此分钟数未修改的会话将隐藏 |

## License

MIT
