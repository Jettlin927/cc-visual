import type {
  JournalEntry,
  ToolCall,
  ToolCallStatus,
  ToolInput,
  ToolResultInfo,
} from '../shared/types.js';

/**
 * Build a map from tool_use_id to its result info.
 * Shared helper for extractLatestToolCall and parseToolCalls.
 */
function buildResultMap(entries: JournalEntry[]): Map<string, ToolResultInfo> {
  const results = new Map<string, ToolResultInfo>();
  for (const e of entries) {
    if (e.type === 'user') {
      for (const b of e.message?.content || []) {
        if (b?.type === 'tool_result' && b.tool_use_id) {
          results.set(b.tool_use_id, {
            isError: !!b.is_error,
            timestamp: e.timestamp || '',
          });
        }
      }
    }
  }
  return results;
}

function resolveStatus(result: ToolResultInfo | undefined): ToolCallStatus {
  if (!result) return 'running';
  return result.isError ? 'error' : 'done';
}

function computeDuration(result: ToolResultInfo | undefined, entryTimestamp: string | undefined): number | null {
  if (!result || !entryTimestamp) return null;
  return new Date(result.timestamp).getTime() - new Date(entryTimestamp).getTime();
}

/**
 * Get the most recent ToolCall from a list of journal entries.
 */
export function extractLatestToolCall(entries: JournalEntry[]): ToolCall | null {
  const results = buildResultMap(entries);
  let lastTool: ToolCall | null = null;

  for (const e of entries) {
    if (e.type === 'assistant') {
      for (const b of e.message?.content || []) {
        if (b?.type === 'tool_use' && b.id) {
          const result = results.get(b.id);
          lastTool = {
            id: b.id,
            name: b.name || '',
            input: (b.input as ToolInput) || null,
            timestamp: e.timestamp || '',
            status: resolveStatus(result),
            duration: computeDuration(result, e.timestamp),
          };
        }
      }
    }
  }

  return lastTool;
}

/**
 * Get all ToolCalls from a list of journal entries.
 */
export function parseToolCalls(entries: JournalEntry[]): ToolCall[] {
  const results = buildResultMap(entries);
  const toolCalls: ToolCall[] = [];

  for (const e of entries) {
    if (e.type === 'assistant') {
      for (const b of e.message?.content || []) {
        if (b?.type === 'tool_use' && b.id) {
          const result = results.get(b.id);
          toolCalls.push({
            id: b.id,
            name: b.name || '',
            input: (b.input as ToolInput) || null,
            timestamp: e.timestamp || '',
            status: resolveStatus(result),
            duration: computeDuration(result, e.timestamp),
          });
        }
      }
    }
  }

  return toolCalls;
}

/**
 * Human-readable one-line preview of tool input.
 */
export function getInputPreview(input: ToolInput | null | undefined): string {
  if (!input) return '';
  return (
    input.command ||
    input.file_path ||
    input.pattern ||
    input.query ||
    (input.prompt || '').slice(0, 60) ||
    input.description ||
    ''
  );
}
