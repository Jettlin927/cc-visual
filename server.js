import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import { readdir, readFile, stat } from 'fs/promises';
import { watch } from 'fs';
import { homedir } from 'os';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load config.json, fall back to defaults if missing
let cfg = {};
try {
  cfg = JSON.parse(await readFile(join(__dirname, 'config.json'), 'utf-8'));
} catch {}

const app = express();
const PORT        = process.env.PORT || cfg.port || 3333;
const CLAUDE_DIR  = (cfg.claudeDir || '~/.claude').replace(/^~/, homedir());
const CODEX_DIR   = (cfg.codexDir  || '~/.codex' ).replace(/^~/, homedir());
const SESSIONS_DIR = join(CLAUDE_DIR, 'sessions');
const ACTIVE_THRESHOLD_MS = (cfg.activeThresholdMinutes || 30) * 60 * 1000;

app.use(express.static(join(__dirname, 'public')));

// All projects/sessions
app.get('/api/projects', async (req, res) => {
  try {
    const items = await scanProjects();
    items.sort((a, b) => b.modifiedAt - a.modifiedAt);
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Active sessions only (last tool call/entry within 30 min)
app.get('/api/active', async (req, res) => {
  try {
    const all = await scanProjects();
    const now = Date.now();
    const active = all.filter(p => now - p.modifiedAt < ACTIVE_THRESHOLD_MS);
    const alive = await loadAliveSessions();
    const claudeSessions = await Promise.all(active.map(p => enrichSession(p, alive)));
    const codexSessions = scanAndEnrichCodexSessions();
    res.json([...claudeSessions, ...codexSessions]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Full transcript parse
app.get('/api/transcript', async (req, res) => {
  const { path: filePath } = req.query;
  if (!filePath || !filePath.startsWith(CLAUDE_DIR)) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    const toolCalls = parseToolCalls(lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean));
    res.json({ totalLines: lines.length, toolCalls });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// SSE: watch a file
app.get('/api/watch', (req, res) => {
  const filePath = req.query.path;
  if (!filePath || !filePath.startsWith(CLAUDE_DIR)) {
    return res.status(400).json({ error: 'Invalid path' });
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
      if (s.size !== lastSize) { lastSize = s.size; res.write(`data: {"type":"changed"}\n\n`); }
    } catch {}
  };
  const watcher = watch(filePath, send);
  const iv = setInterval(send, 3000);
  req.on('close', () => { watcher.close(); clearInterval(iv); });
});

// SSE: watch ALL active sessions (for game world)
app.get('/api/watch-active', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write('data: {"type":"connected"}\n\n');

  const send = async () => {
    try {
      const all = await scanProjects();
      const now = Date.now();
      const active = all.filter(p => now - p.modifiedAt < ACTIVE_THRESHOLD_MS);
      const alive = await loadAliveSessions();
      const claudeSessions = await Promise.all(active.map(p => enrichSession(p, alive)));
      const codexSessions = scanAndEnrichCodexSessions();
      res.write(`data: ${JSON.stringify({ type: 'update', sessions: [...claudeSessions, ...codexSessions] })}\n\n`);
    } catch {}
  };

  send();
  const iv = setInterval(send, 4000);
  req.on('close', () => clearInterval(iv));
});

// ---- Helpers ----

// Returns Set<sessionId> for all Claude processes currently alive
async function loadAliveSessions() {
  const alive = new Set();
  try {
    const files = await readdir(SESSIONS_DIR);
    for (const f of files.filter(f => f.endsWith('.json'))) {
      try {
        const raw = await readFile(join(SESSIONS_DIR, f), 'utf-8');
        const { pid, sessionId } = JSON.parse(raw);
        if (!sessionId || !pid) continue;
        try { process.kill(pid, 0); alive.add(sessionId); } catch {}
      } catch {}
    }
  } catch {}
  return alive;
}

async function enrichSession(p, alive) {
  const tail = await readTail(p.filePath, 150);
  const lastTool = extractLatestToolCall(tail);
  const status = detectStatus(tail, lastTool, alive.has(p.sessionId));
  const toolCount = countTools(tail);
  return { ...p, lastTool, status, toolCount };
}

// Detect: running | waiting | idle
// isAlive: whether the Claude process for this session is running
function detectStatus(entries, lastTool, isAlive) {
  // Process is dead → idle regardless of JSONL content
  if (!isAlive) return 'idle';

  // Process alive + unfinished tool call → running
  if (lastTool?.status === 'running') return 'running';

  const toArr = (c) => Array.isArray(c) ? c : [];
  const sig = entries.filter(e => e.type === 'assistant' || e.type === 'user');
  // Process alive but JSONL has no content yet → just started
  if (!sig.length) return 'running';

  const last = sig[sig.length - 1];

  if (last.type === 'assistant') {
    const content = toArr(last.message?.content);
    // Unresolved tool_use → running
    if (content.some(b => b?.type === 'tool_use')) return 'running';
    // Pure text reply → Claude finished, waiting for human input
    return 'waiting';
  }

  if (last.type === 'user') {
    // tool_result or human text → Claude is processing
    return 'running';
  }

  // Process alive, conservative fallback
  return 'running';
}

function countTools(entries) {
  let n = 0;
  for (const e of entries) {
    if (e.type === 'assistant') {
      const content = Array.isArray(e.message?.content) ? e.message.content : [];
      for (const b of content) {
        if (b?.type === 'tool_use') n++;
      }
    }
  }
  return n;
}

async function scanProjects() {
  const projectsDir = join(CLAUDE_DIR, 'projects');
  const entries = await readdir(projectsDir, { withFileTypes: true });
  const items = [];
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

async function readTail(filePath, nLines) {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.trim().split('\n').slice(-nLines);
  return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function extractLatestToolCall(entries) {
  let lastTool = null;
  let lastResult = null;
  // Build map of tool_use_id -> result
  const results = new Map();
  for (const e of entries) {
    if (e.type === 'user') {
      for (const b of (e.message?.content || [])) {
        if (b?.type === 'tool_result') results.set(b.tool_use_id, { isError: b.is_error, timestamp: e.timestamp });
      }
    }
  }
  for (const e of entries) {
    if (e.type === 'assistant') {
      for (const b of (e.message?.content || [])) {
        if (b?.type === 'tool_use') {
          const result = results.get(b.id);
          lastTool = {
            id: b.id,
            name: b.name,
            input: b.input,
            timestamp: e.timestamp,
            status: result ? (result.isError ? 'error' : 'done') : 'running',
            duration: result ? new Date(result.timestamp) - new Date(e.timestamp) : null,
          };
        }
      }
    }
  }
  return lastTool;
}

function parseToolCalls(entries) {
  const results = new Map();
  for (const e of entries) {
    if (e.type === 'user') {
      for (const b of (e.message?.content || [])) {
        if (b?.type === 'tool_result') results.set(b.tool_use_id, { isError: b.is_error, timestamp: e.timestamp });
      }
    }
  }
  const toolCalls = [];
  for (const e of entries) {
    if (e.type === 'assistant') {
      for (const b of (e.message?.content || [])) {
        if (b?.type === 'tool_use') {
          const result = results.get(b.id);
          toolCalls.push({
            id: b.id, name: b.name, input: b.input, timestamp: e.timestamp,
            status: result ? (result.isError ? 'error' : 'done') : 'running',
            duration: result ? new Date(result.timestamp) - new Date(e.timestamp) : null,
          });
        }
      }
    }
  }
  return toolCalls;
}

function getInputPreview(input) {
  if (!input) return '';
  return input.command || input.file_path || input.pattern || input.query || (input.prompt || '').slice(0, 60) || input.description || '';
}

// ---- Codex (OpenAI) support ----

// Returns enriched session objects for all recent Codex threads (synchronous SQLite)
function scanAndEnrichCodexSessions() {
  const stateDbPath = join(CODEX_DIR, 'state_5.sqlite');
  const logsDbPath  = join(CODEX_DIR, 'logs_1.sqlite');
  let stateDb, logsDb;
  try {
    stateDb = new DatabaseSync(stateDbPath, { readOnly: true });
    logsDb  = new DatabaseSync(logsDbPath,  { readOnly: true });

    const cutoff  = Math.floor((Date.now() - ACTIVE_THRESHOLD_MS) / 1000);
    const threads = stateDb.prepare(
      'SELECT id, title, cwd, updated_at, model FROM threads WHERE archived = 0 AND updated_at > ? ORDER BY updated_at DESC'
    ).all(cutoff);

    return threads.map(t => {
      // --- Liveness ---
      const pidRow = logsDb.prepare(
        'SELECT process_uuid FROM logs WHERE thread_id = ? AND process_uuid IS NOT NULL ORDER BY ts DESC, id DESC LIMIT 1'
      ).get(t.id);
      let isAlive = false;
      if (pidRow?.process_uuid) {
        const m = pidRow.process_uuid.match(/^pid:(\d+):/);
        if (m) { try { process.kill(parseInt(m[1], 10), 0); isAlive = true; } catch {} }
      }

      // --- Last tool call ---
      const toolRows = logsDb.prepare(
        "SELECT ts, feedback_log_body FROM logs WHERE thread_id = ? AND feedback_log_body LIKE '%codex.tool_result%' AND target IN ('codex_otel.trace_safe','codex_otel.log_only') ORDER BY ts DESC, id DESC LIMIT 10"
      ).all(t.id);
      let lastTool = null;
      for (const row of toolRows) {
        const m = row.feedback_log_body?.match(/event\.name="codex\.tool_result" tool_name=(\S+) call_id=(\S+) duration_ms=(\d+) success=(\S+)/);
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

      // --- Tool count (deduplicate by call_id using trace_safe only) ---
      const countRow = logsDb.prepare(
        "SELECT COUNT(*) as n FROM logs WHERE thread_id = ? AND target = 'codex_otel.trace_safe' AND feedback_log_body LIKE '%codex.tool_result%'"
      ).get(t.id);

      // --- Status: check last meaningful event ---
      let status = 'idle';
      if (isAlive) {
        const latestRow = logsDb.prepare(
          "SELECT feedback_log_body FROM logs WHERE thread_id = ? AND target = 'codex_otel.trace_safe' ORDER BY ts DESC, id DESC LIMIT 1"
        ).get(t.id);
        const body = latestRow?.feedback_log_body || '';
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
      };
    });
  } catch {
    return [];
  } finally {
    try { stateDb?.close(); } catch {}
    try { logsDb?.close();  } catch {}
  }
}

// Codex tool history for detail panel
app.get('/api/codex-history', (req, res) => {
  const { threadId } = req.query;
  if (!threadId) return res.status(400).json({ error: 'Missing threadId' });
  let logsDb;
  try {
    logsDb = new DatabaseSync(join(CODEX_DIR, 'logs_1.sqlite'), { readOnly: true });
    const rows = logsDb.prepare(
      "SELECT ts, feedback_log_body FROM logs WHERE thread_id = ? AND target = 'codex_otel.trace_safe' AND feedback_log_body LIKE '%codex.tool_result%' ORDER BY ts ASC, id ASC LIMIT 50"
    ).all(threadId);
    const toolCalls = [];
    for (const row of rows) {
      const m = row.feedback_log_body?.match(/event\.name="codex\.tool_result" tool_name=(\S+) call_id=(\S+) duration_ms=(\d+) success=(\S+)/);
      if (m) {
        toolCalls.push({
          name: m[1], id: m[2], input: null,
          timestamp: new Date(Number(row.ts) * 1000).toISOString(),
          status: m[4] === 'true' ? 'done' : 'error',
          duration: parseInt(m[3], 10),
        });
      }
    }
    res.json({ toolCalls });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    try { logsDb?.close(); } catch {}
  }
});

app.listen(PORT, () => {
  console.log(`\n  👾 Claude Visual running at http://localhost:${PORT}\n`);
  console.log(`  Claude Code: ${CLAUDE_DIR}/projects/`);
  console.log(`  Codex:       ${CODEX_DIR}/state_5.sqlite`);
  console.log(`\n  Active sessions = last modified within 30 minutes\n`);
});
