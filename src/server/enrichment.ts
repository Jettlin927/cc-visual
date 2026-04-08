import type {
  ClaudeSession,
  JournalEntry,
  ScannedProject,
  SessionStatus,
  ToolCall,
} from '../shared/types.js';
import { JSONL_TAIL_LINES } from '../shared/constants.js';
import { readTail } from './scanner.js';
import { extractLatestToolCall } from './tool-parser.js';

/**
 * Enrich a scanned project with lastTool, status, toolCount, and pid.
 */
export async function enrichSession(
  project: ScannedProject,
  alive: Set<string>,
): Promise<ClaudeSession> {
  const tail = await readTail(project.filePath, JSONL_TAIL_LINES);
  const lastTool = extractLatestToolCall(tail);
  const status = detectStatus(tail, lastTool, alive.has(project.sessionId));
  const toolCount = countTools(tail);

  return {
    ...project,
    lastTool,
    status,
    toolCount,
    pid: null,
  };
}

/**
 * Detect session status: running | waiting | idle.
 * @param isAlive whether the Claude process for this session is currently running
 */
export function detectStatus(
  entries: JournalEntry[],
  lastTool: ToolCall | null,
  isAlive: boolean,
): SessionStatus {
  // Process is dead -> idle regardless of JSONL content
  if (!isAlive) return 'idle';

  // Process alive + unfinished tool call -> running
  if (lastTool?.status === 'running') return 'running';

  const sig = entries.filter(e => e.type === 'assistant' || e.type === 'user');
  // Process alive but JSONL has no content yet -> just started
  if (!sig.length) return 'running';

  const last = sig[sig.length - 1];

  if (last.type === 'assistant') {
    const content = Array.isArray(last.message?.content) ? last.message.content : [];
    // Unresolved tool_use -> running
    if (content.some(b => b?.type === 'tool_use')) return 'running';
    // Pure text reply -> Claude finished, waiting for human input
    return 'waiting';
  }

  if (last.type === 'user') {
    // tool_result or human text -> Claude is processing
    return 'running';
  }

  // Process alive, conservative fallback
  return 'running';
}

/**
 * Count tool_use blocks in journal entries.
 */
export function countTools(entries: JournalEntry[]): number {
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
