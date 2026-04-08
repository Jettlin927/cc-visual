# CLAUDE.md — CC-Visual 项目指南

## 项目是什么

CC-Visual 是一个像素风实时可视化仪表盘，把本地活跃的 Claude Code / OpenAI Codex 会话变成像素角色在游戏世界里漫游。核心价值：**一眼看出哪些 AI agent 需要人类介入**。

## 技术栈

| 层 | 选型 | 备注 |
|---|---|---|
| 语言 | TypeScript 5.x (strict) | 前后端统一 TS |
| 后端 | Express 4 + Node.js 内置 `node:sqlite` | 通过 `tsx` 直接运行 TS |
| 前端 | 原生 DOM + Canvas 2D | **无框架**，esbuild 打包 |
| 构建 | esbuild（前端打包）+ tsx（后端运行） | `build.mjs` 配置 |
| Lint | ESLint + @typescript-eslint | 自动 hook：Write/Edit .ts 后触发 |
| 实时通信 | Server-Sent Events (SSE) | 不用 WebSocket |
| 数据库 | 无独立数据库 | 读 JSONL（Claude）和 SQLite（Codex）文件 |

## 项目结构

```
src/
  shared/
    types.ts          — 所有共享接口和类型（Session, ToolCall, AppConfig, Tile, Direction...）
    tool-metadata.ts  — TOOL_META 映射 + getToolMeta/getToolColor/getToolPose 辅助函数
    constants.ts      — 命名常量（替代魔法数字）
  server/
    index.ts          — Express 入口，静态文件服务，启动
    config.ts         — 配置加载（config.json + 环境变量）
    scanner.ts        — scanProjects(), readTail(), loadAliveSessions()
    enrichment.ts     — enrichSession(), detectStatus(), countTools()
    tool-parser.ts    — parseToolCalls(), extractLatestToolCall()
    codex.ts          — Codex SQLite 集成
    focus-window.ts   — Windows 窗口聚焦（PowerShell）
    routes.ts         — 所有 Express 路由处理器
  client/
    game.ts           — 主入口：Canvas、游戏循环、SSE、会话协调
    character.ts      — Character 类（动画、绘制、姿态）
    world.ts          — 地图生成、瓦片渲染
    sidebar.ts        — 会话列表侧边栏
    panel.ts          — 详情面板
    interaction.ts    — 拖拽、点击、键盘控制
    notifications.ts  — Toast 通知
    app.ts            — 旧版仪表盘
    components/       — UI 组件（event-stream, timeline, stats, particles, pixel-logo）
    utils/            — 工具函数（formatters, sse-client）
public/
  index.html          — 单页入口（加载 /dist/game.js）
  css/style.css       — 像素风样式
  dist/               — esbuild 输出（.gitignored）
config.json           — 运行配置
docs/roadmap.md       — 迭代计划 S1-S9c
```

## 关键架构决策（不要改变这些）

1. **前端零框架**：不引入 React/Vue/任何前端框架。所有 UI 用原生 DOM + Canvas。
2. **esbuild 打包前端**：`src/client/` → `public/dist/`，不用 webpack/vite。
3. **tsx 运行后端**：`src/server/index.ts` 通过 tsx 直接运行，不编译。
4. **SSE 而非 WebSocket**：`/api/watch-active` 4 秒轮询推送会话快照。
5. **确定性角色生成**：sessionId 哈希 → 种子 RNG → 固定外观。同一会话永远同一角色。
6. **JSONL 尾部读取**：只读最后 150 行，保证速度。不要改成全量读取。
7. **进程存活检测**：`process.kill(pid, 0)` 判断会话是否存活，不 spawn 子进程。
8. **共享类型集中管理**：所有接口在 `src/shared/types.ts`，工具元数据在 `src/shared/tool-metadata.ts`，常量在 `src/shared/constants.ts`。新增类型/常量加在这里。

## 会话模型

```typescript
type SessionStatus = 'running' | 'waiting' | 'idle';
type SessionSource = 'claude' | 'codex';
type Session = ClaudeSession | CodexSession;
```

- **running** = agent 正在执行工具调用
- **waiting** = agent 输出完毕，等人类响应
- **idle** = 进程不存在或超时

状态推断逻辑在 `src/server/enrichment.ts` 的 `detectStatus()`。Codex 的状态在 `src/server/codex.ts`。

## 工具元数据映射

`TOOL_META` 定义在 `src/shared/tool-metadata.ts`，是工具名 → 图标/颜色/标签的映射。新增工具支持时在这里加一行。角色姿态用 `TOOL_POSES` / `getToolPose()`。

## 命名规范

- 变量/函数：camelCase
- 类型/接口：PascalCase
- CSS 类：kebab-case
- 文件名：kebab-case
- API 路由：`/api/kebab-case`
- 常量：UPPER_SNAKE_CASE（在 `constants.ts` 中）
- 导入路径：带 `.js` 后缀（ESM 规范）

## 开发命令

```bash
npm run dev          # tsx watch 模式，热重载后端
npm start            # 构建前端 + 启动（http://localhost:3333）
npm run build        # 构建前端（esbuild → public/dist/game.js + app.js）
npm run lint         # ESLint 检查 src/
npm run typecheck    # tsc --noEmit（server + client 两个 tsconfig）
PORT=5000 npm start  # 自定义端口
```

需要 Node.js >= 18（推荐 22+，内置 SQLite 更稳定）。

## 自动化 Hooks

`.claude/settings.json` 配置了 PostToolUse hook：
- 触发条件：Write 或 Edit 工具修改 `.ts` 文件后
- 动作：自动运行 `eslint` + `tsc --noEmit`
- 目的：提前发现类型错误和 lint 问题

## 工作模式

### 阶段 0：探索（必须用 subagent）

接到任务后，**不要自己逐文件阅读代码**。启动 Explore subagent 完成代码库探索：
- 定位涉及的文件、函数、数据流
- 梳理改动影响范围
- 把发现汇报回来，由主 agent 决策

主 agent 只在 subagent 结果不够时才补充读取特定文件。目的：**节省主 agent 上下文窗口**。

### 阶段 1：并行评估

正式动手前，评估目标任务是否可拆分为**互不依赖的子任务**并行执行：

```
判断标准：
├── 子任务之间是否修改同一文件？ → 是 → 串行
├── 子任务之间是否有数据依赖？   → 是 → 串行
└── 都不是？                    → 并行，每个子任务分配独立 worktree
```

**可并行的典型场景：**
- 后端 API 新增 + 前端 UI 新增（不改同一文件）
- 多个独立组件的开发（如 S1 的筛选按钮 vs 搜索框，如果改不同文件）
- 文档更新 + 代码实现

**必须串行的场景：**
- 前端依赖后端新 API 的返回格式
- 多处改动共享同一文件（如 game.ts 的不同功能区）
- 后续任务依赖前序任务的输出

并行时：使用 Agent tool 配合 `isolation: "worktree"` 启动多个 agent，每个在独立 git worktree 中工作。完成后合并各 worktree 的改动。

### 阶段 2：实现

按迭代计划执行。所有新功能按 `docs/roadmap.md` 的迭代计划：

1. 明确改动文件清单
2. 编写验收用例
3. 实现（串行或并行，取决于阶段 1 的评估）
4. 验收（见阶段 3）
5. 独立 commit

### 阶段 3：验收（必须用 code-reviewer subagent）

实现完成后，**不要自己判断是否通过验收**。启动 code-reviewer subagent 进行独立审查：

审查清单：
- [ ] 改动是否符合 roadmap 中该迭代的验收标准
- [ ] 是否违反本文件中的红线
- [ ] 是否引入了不必要的依赖或复杂度
- [ ] 命名是否符合项目规范
- [ ] 前端改动是否保持了像素风一致性
- [ ] 是否有未处理的边界情况
- [ ] `npm run typecheck` 和 `npm run lint` 是否通过

只有 code-reviewer 确认通过后，才能提交 commit。如果审查发现问题，修复后**重新提交审查**，不要跳过。

### 提交

- 一个迭代一个 commit（或一个 PR）
- Commit message 用英文，简洁描述 what + why
- 不要把不相关的改动混进同一个 commit

## 红线（绝对不要做的事）

- **不要引入前端框架**（React, Vue, Svelte, etc.）
- **不要换构建工具**（保持 esbuild，不换 webpack/vite）
- **不要加新 npm 依赖**（除非真的不可避免，并先确认）
- **不要全量读取 JSONL 文件**（只读尾部 150 行）
- **不要用 WebSocket 替换 SSE**
- **不要修改确定性角色生成逻辑**（改了会导致所有角色外观突变）
- **不要在前端发起跨域请求**（所有数据走本地 Express）
- **不要存储敏感信息**（不读 API key、不存用户凭证）
- **不要写 `any` 类型**（除非真的无法避免，如第三方库缺类型定义）
- **不要跳过 typecheck**（提交前必须 `npm run typecheck` 通过）

## 什么时候停下来问人

- 需要新增 npm 依赖时
- 改动涉及 3 个以上文件且不在 roadmap 计划内时
- 会话状态推断逻辑的变更（可能影响所有会话的显示）
- 任何涉及文件写入（当前系统是只读的，只读取本地 session 文件）
- SSE 推送频率或数据格式的变更（会影响所有前端组件）
- 修改 `src/shared/types.ts` 中的核心接口（影响前后端所有模块）
- 新增工具支持时（需同时更新 `src/shared/tool-metadata.ts` 的 TOOL_META 和 TOOL_POSES）

## 隐性知识

1. **Codex 的 PID 提取很脆弱**：从 `process_uuid` 字段用 `pid:123:...` 格式正则提取（`src/server/codex.ts`）。Codex 更新可能改这个格式，改之前要验证。
2. **Windows 窗口聚焦**：`/api/focus-window` 用 PowerShell + Win32 API 实现（`src/server/focus-window.ts`），仅 Windows 可用。macOS/Linux 返回 `not yet supported`。
3. **SQLite 是同步读取**：Codex 数据用 `node:sqlite` 的同步 API。如果 Codex 数据库被锁，会阻塞事件循环。目前未处理。
4. **4 秒轮询是刻意的**：降到 1 秒会增加 CPU 开销但 UX 提升不大。不要随意改（`SSE_ACTIVE_POLL_MS` in constants.ts）。
5. **`app.ts` 是旧版仪表盘**：保留是因为有独立入口，但主逻辑在 `game.ts`。
6. **Canvas 渲染有视口裁剪**：只渲染可见区域的瓦片，不要改成全量渲染。
7. **roadmap.md 是唯一的需求文档**：功能优先级、验收标准都在里面，不在别处。
8. **`const enum` 会被内联**：`Direction` 和 `Tile` 是 const enum，编译后消失为数字常量。不要改成普通 enum。
9. **前端打包输出到 `public/dist/`**：这个目录被 .gitignored。`npm run build` 生成，`npm start` 自动执行。
10. **两个 tsconfig 分离检查**：`npm run typecheck` 同时检查 `tsconfig.server.json`（Node.js 目标）和 `tsconfig.client.json`（DOM 目标）。改动 `src/shared/` 的类型时两个都必须通过。
11. **ESM 导入必须带 .js 后缀**：TypeScript 文件之间互相导入时用 `.js` 后缀（如 `import { foo } from './bar.js'`），这是 Node.js ESM 规范要求。esbuild 打包时会正确解析。
