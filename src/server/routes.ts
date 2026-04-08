import { Router } from 'express';
import { existsSync } from 'fs';
import { watch } from 'fs';
import { readdir, readFile as readFileAsync, stat as statAsync } from 'fs/promises';
import { join } from 'path';
import { DatabaseSync } from 'node:sqlite';

import type { AppConfig, ClaudeSession, JournalEntry, Session } from '../shared/types.js';
import { SSE_FILE_POLL_MS, SSE_ACTIVE_POLL_MS } from '../shared/constants.js';

import { scanProjects, loadAliveSessions } from './scanner.js';
import { parseToolCalls } from './tool-parser.js';
import { enrichSession } from './enrichment.js';
import { scanAndEnrichCodexSessions, getCodexHistory } from './codex.js';
import { focusWindow } from './focus-window.js';

import express from 'express';

/**
 * Gather active Claude + Codex sessions (shared by /api/active and /api/watch-active).
 */
async function getActiveSessions(config: AppConfig): Promise<Session[]> {
  const all = await scanProjects(config);
  const now = Date.now();
  const active = all.filter(p => now - p.modifiedAt < config.activeThresholdMs);
  const alive = await loadAliveSessions(config);
  const claudeSessions: ClaudeSession[] = await Promise.all(
    active.map(p => enrichSession(p, alive)),
  );
  const codexSessions = scanAndEnrichCodexSessions(config);
  return [...claudeSessions, ...codexSessions];
}

/**
 * Create Express Router with all API routes.
 */
export function createRouter(config: AppConfig): Router {
  const router = Router();

  // Track SSE client count and last scan time
  let sseClients = 0;
  let lastScanAt: string | null = null;

  // Health check
  router.get('/api/health', async (_req, res) => {
    try {
      // Claude dir
      const claudeDirExists = existsSync(config.claudeDir);
      let scannedFiles = 0;
      if (claudeDirExists) {
        try {
          const projectsDir = join(config.claudeDir, 'projects');
          const entries = await readdir(projectsDir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const files = await readdir(join(projectsDir, entry.name));
            scannedFiles += files.filter(f => f.endsWith('.jsonl')).length;
          }
        } catch { /* projects dir may not exist */ }
      }

      // Codex dir
      const codexDirExists = existsSync(config.codexDir);
      let codexSqliteReadable = false;
      if (codexDirExists) {
        try {
          const db = new DatabaseSync(
            join(config.codexDir, 'state_5.sqlite'),
            { readOnly: true } as Record<string, unknown>,
          );
          db.close();
          codexSqliteReadable = true;
        } catch { /* not readable */ }
      }

      // Active sessions for filtered count
      const sessions = await getActiveSessions(config);
      const now = Date.now();
      const filteredSessions = sessions.filter(
        s => s.status === 'idle' || now - s.modifiedAt > config.activeThresholdMs,
      ).length;

      lastScanAt = new Date().toISOString();

      res.json({
        claudeDir: { path: config.claudeDir, exists: claudeDirExists },
        codexDir: { path: config.codexDir, exists: codexDirExists },
        codexSqlite: { readable: codexSqliteReadable },
        lastScanAt,
        scannedFiles,
        filteredSessions,
        sseClients,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

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

  // Active sessions only (last tool call/entry within threshold)
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
      const content = await readFileAsync(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      const entries: JournalEntry[] = lines
        .map(l => {
          try {
            return JSON.parse(l) as JournalEntry;
          } catch {
            return null;
          }
        })
        .filter((e): e is JournalEntry => e !== null);
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
      Connection: 'keep-alive',
    });
    res.write('data: {"type":"connected"}\n\n');

    let lastSize = 0;
    const send = async (): Promise<void> => {
      try {
        const s = await statAsync(filePath);
        if (s.size !== lastSize) {
          lastSize = s.size;
          res.write('data: {"type":"changed"}\n\n');
        }
      } catch {
        // file may be temporarily unavailable
      }
    };
    const watcher = watch(filePath, () => void send());
    const iv = setInterval(() => void send(), SSE_FILE_POLL_MS);
    req.on('close', () => {
      watcher.close();
      clearInterval(iv);
    });
  });

  // SSE: watch ALL active sessions (for game world)
  router.get('/api/watch-active', (req, res) => {
    sseClients++;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('data: {"type":"connected"}\n\n');

    const send = async (): Promise<void> => {
      try {
        const sessions = await getActiveSessions(config);
        lastScanAt = new Date().toISOString();
        res.write(`data: ${JSON.stringify({ type: 'update', sessions })}\n\n`);
      } catch {
        // swallow errors in SSE loop
      }
    };

    void send();
    const iv = setInterval(() => void send(), SSE_ACTIVE_POLL_MS);
    req.on('close', () => {
      sseClients--;
      clearInterval(iv);
    });
  });

  // Codex tool history for detail panel
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
  router.post('/api/focus-window', express.json(), async (req, res) => {
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
