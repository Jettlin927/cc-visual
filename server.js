import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdir, readFile, stat } from 'fs/promises';
import { watch } from 'fs';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3333;
const CLAUDE_DIR = join(homedir(), '.claude');
const SESSIONS_DIR = join(CLAUDE_DIR, 'sessions');
const ACTIVE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

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
    // Parse last few entries of each active session to get latest tool call
    const result = await Promise.all(active.map(enrichSession));
    res.json(result);
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
      const result = await Promise.all(active.map(enrichSession));
      res.write(`data: ${JSON.stringify({ type: 'update', sessions: result })}\n\n`);
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

app.listen(PORT, () => {
  console.log(`\n  👾 Claude Visual running at http://localhost:${PORT}\n`);
  console.log(`  Scanning: ${CLAUDE_DIR}/projects/\n`);
  console.log(`  Active sessions = last modified within 30 minutes\n`);
});
