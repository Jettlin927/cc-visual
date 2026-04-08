import { join } from 'path';
import { readdir, readFile, stat } from 'fs/promises';

import type { AppConfig, JournalEntry, ScannedProject } from '../shared/types.js';

/**
 * Scan ~/.claude/projects/ for all JSONL session files.
 */
export async function scanProjects(config: AppConfig): Promise<ScannedProject[]> {
  const projectsDir = join(config.claudeDir, 'projects');
  const entries = await readdir(projectsDir, { withFileTypes: true });
  const items: ScannedProject[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectPath = join(projectsDir, entry.name);
    const files = await readdir(projectPath);
    for (const f of files.filter(name => name.endsWith('.jsonl'))) {
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

/**
 * Read the last N lines of a JSONL file, parse each into a JournalEntry.
 */
export async function readTail(filePath: string, nLines: number): Promise<JournalEntry[]> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.trim().split('\n').slice(-nLines);
  return lines
    .map(l => {
      try {
        return JSON.parse(l) as JournalEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is JournalEntry => e !== null);
}

/**
 * Check ~/.claude/sessions/*.json for live PIDs.
 * Returns a Set of sessionIds whose Claude processes are still running.
 */
export async function loadAliveSessions(config: AppConfig): Promise<Set<string>> {
  const sessionsDir = join(config.claudeDir, 'sessions');
  const alive = new Set<string>();

  try {
    const files = await readdir(sessionsDir);
    for (const f of files.filter(name => name.endsWith('.json'))) {
      try {
        const raw = await readFile(join(sessionsDir, f), 'utf-8');
        const { pid, sessionId } = JSON.parse(raw) as { pid?: number; sessionId?: string };
        if (!sessionId || !pid) continue;
        try {
          process.kill(pid, 0);
          alive.add(sessionId);
        } catch {
          // process not running
        }
      } catch {
        // skip unreadable file
      }
    }
  } catch {
    // sessions dir may not exist
  }

  return alive;
}
