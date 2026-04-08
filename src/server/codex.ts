import { join, basename } from 'path';
import { DatabaseSync } from 'node:sqlite';

import type {
  AppConfig,
  CodexSession,
  SessionStatus,
  ToolCall,
  ToolCallStatus,
} from '../shared/types.js';

interface ThreadRow {
  id: string;
  title: string | null;
  cwd: string;
  updated_at: number;
  model: string | null;
}

interface PidRow {
  process_uuid: string | null;
}

interface LogRow {
  ts: number;
  feedback_log_body: string | null;
}

interface CountRow {
  n: number;
}

const TOOL_RESULT_RE =
  /event\.name="codex\.tool_result" tool_name=(\S+) call_id=(\S+) duration_ms=(\d+) success=(\S+)/;

/**
 * Scan Codex SQLite databases and return enriched session objects
 * for all recent (non-archived, within threshold) threads.
 */
export function scanAndEnrichCodexSessions(config: AppConfig): CodexSession[] {
  const stateDbPath = join(config.codexDir, 'state_5.sqlite');
  const logsDbPath = join(config.codexDir, 'logs_1.sqlite');
  let stateDb: DatabaseSync | undefined;
  let logsDb: DatabaseSync | undefined;

  try {
    stateDb = new DatabaseSync(stateDbPath, { readOnly: true } as Record<string, unknown>);
    logsDb = new DatabaseSync(logsDbPath, { readOnly: true } as Record<string, unknown>);

    const cutoff = Math.floor((Date.now() - config.activeThresholdMs) / 1000);
    const threads = stateDb
      .prepare(
        'SELECT id, title, cwd, updated_at, model FROM threads WHERE archived = 0 AND updated_at > ? ORDER BY updated_at DESC',
      )
      .all(cutoff) as unknown as ThreadRow[];

    return threads.map(t => {
      // --- Liveness ---
      const pidRow = logsDb!
        .prepare(
          'SELECT process_uuid FROM logs WHERE thread_id = ? AND process_uuid IS NOT NULL ORDER BY ts DESC, id DESC LIMIT 1',
        )
        .get(t.id) as PidRow | undefined;

      let isAlive = false;
      if (pidRow?.process_uuid) {
        const m = pidRow.process_uuid.match(/^pid:(\d+):/);
        if (m) {
          try {
            process.kill(parseInt(m[1], 10), 0);
            isAlive = true;
          } catch {
            // not running
          }
        }
      }

      // --- Last tool call ---
      const toolRows = logsDb!
        .prepare(
          "SELECT ts, feedback_log_body FROM logs WHERE thread_id = ? AND feedback_log_body LIKE '%codex.tool_result%' AND target IN ('codex_otel.trace_safe','codex_otel.log_only') ORDER BY ts DESC, id DESC LIMIT 10",
        )
        .all(t.id) as unknown as LogRow[];

      let lastTool: ToolCall | null = null;
      for (const row of toolRows) {
        const m = row.feedback_log_body?.match(TOOL_RESULT_RE);
        if (m) {
          lastTool = {
            name: m[1],
            id: m[2],
            input: null,
            timestamp: new Date(Number(row.ts) * 1000).toISOString(),
            status: (m[4] === 'true' ? 'done' : 'error') as ToolCallStatus,
            duration: parseInt(m[3], 10),
          };
          break;
        }
      }

      // --- Tool count (deduplicate by call_id using trace_safe only) ---
      const countRow = logsDb!
        .prepare(
          "SELECT COUNT(*) as n FROM logs WHERE thread_id = ? AND target = 'codex_otel.trace_safe' AND feedback_log_body LIKE '%codex.tool_result%'",
        )
        .get(t.id) as CountRow | undefined;

      // --- Status ---
      let status: SessionStatus = 'idle';
      if (isAlive) {
        const latestRow = logsDb!
          .prepare(
            "SELECT feedback_log_body FROM logs WHERE thread_id = ? AND target = 'codex_otel.trace_safe' ORDER BY ts DESC, id DESC LIMIT 1",
          )
          .get(t.id) as LogRow | undefined;
        const body = latestRow?.feedback_log_body || '';
        status = body.includes('response.completed') ? 'waiting' : 'running';
      }

      return {
        source: 'codex' as const,
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
        pid: null,
      };
    });
  } catch {
    return [];
  } finally {
    try {
      stateDb?.close();
    } catch {
      // ignore
    }
    try {
      logsDb?.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Get tool call history for a specific Codex thread.
 */
export function getCodexHistory(config: AppConfig, threadId: string): ToolCall[] {
  const logsDbPath = join(config.codexDir, 'logs_1.sqlite');
  let logsDb: DatabaseSync | undefined;

  try {
    logsDb = new DatabaseSync(logsDbPath, { readOnly: true } as Record<string, unknown>);
    const rows = logsDb
      .prepare(
        "SELECT ts, feedback_log_body FROM logs WHERE thread_id = ? AND target = 'codex_otel.trace_safe' AND feedback_log_body LIKE '%codex.tool_result%' ORDER BY ts ASC, id ASC LIMIT 50",
      )
      .all(threadId) as unknown as LogRow[];

    const toolCalls: ToolCall[] = [];
    for (const row of rows) {
      const m = row.feedback_log_body?.match(TOOL_RESULT_RE);
      if (m) {
        toolCalls.push({
          name: m[1],
          id: m[2],
          input: null,
          timestamp: new Date(Number(row.ts) * 1000).toISOString(),
          status: (m[4] === 'true' ? 'done' : 'error') as ToolCallStatus,
          duration: parseInt(m[3], 10),
        });
      }
    }
    return toolCalls;
  } catch {
    return [];
  } finally {
    try {
      logsDb?.close();
    } catch {
      // ignore
    }
  }
}
