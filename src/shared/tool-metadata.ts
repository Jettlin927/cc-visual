import type { ToolMeta, ZoneName } from './types.js';

// ─── Tool metadata (icon, color, label) ──────────────────

export const TOOL_META: Record<string, ToolMeta> = {
  // Claude Code tools
  Bash:           { icon: '\u26A1', color: '#fa0', label: 'BASH' },
  Read:           { icon: '\uD83D\uDCD6', color: '#0ff', label: 'READ' },
  Edit:           { icon: '\u270F\uFE0F', color: '#0f0', label: 'EDIT' },
  Write:          { icon: '\uD83D\uDCBE', color: '#0f0', label: 'WRITE' },
  Grep:           { icon: '\uD83D\uDD0D', color: '#bc8cff', label: 'GREP' },
  Glob:           { icon: '\uD83D\uDD2E', color: '#bc8cff', label: 'GLOB' },
  Agent:          { icon: '\uD83E\uDD16', color: '#f0f', label: 'AGENT' },
  WebFetch:       { icon: '\uD83C\uDF10', color: '#58a6ff', label: 'FETCH' },
  WebSearch:      { icon: '\uD83D\uDD0E', color: '#58a6ff', label: 'SEARCH' },
  Skill:          { icon: '\u2699\uFE0F', color: '#ff0', label: 'SKILL' },
  ToolSearch:     { icon: '\uD83D\uDDC2', color: '#aaa', label: 'SEARCH' },
  EnterPlanMode:  { icon: '\uD83D\uDCD0', color: '#f0f', label: 'PLAN' },
  ExitPlanMode:   { icon: '\u2705', color: '#0f0', label: 'PLAN\u2713' },
  TaskCreate:     { icon: '\uD83D\uDCDD', color: '#888', label: 'TASK' },
  TaskUpdate:     { icon: '\uD83D\uDD04', color: '#888', label: 'UPDATE' },
  NotebookEdit:   { icon: '\uD83D\uDCD3', color: '#ff0', label: 'NOTEBK' },
  // Codex tools
  exec_command:   { icon: '\u26A1', color: '#fa0', label: 'EXEC' },
  write_stdin:    { icon: '\u2328\uFE0F', color: '#fa0', label: 'STDIN' },
  read_file:      { icon: '\uD83D\uDCD6', color: '#0ff', label: 'READ' },
  write_file:     { icon: '\uD83D\uDCBE', color: '#0f0', label: 'WRITE' },
  str_replace_based_edit_tool: { icon: '\u270F\uFE0F', color: '#0f0', label: 'EDIT' },
  glob_search:    { icon: '\uD83D\uDD2E', color: '#bc8cff', label: 'GLOB' },
  grep_search:    { icon: '\uD83D\uDD0D', color: '#bc8cff', label: 'GREP' },
  web_search:     { icon: '\uD83D\uDD0E', color: '#58a6ff', label: 'SEARCH' },
  web_fetch:      { icon: '\uD83C\uDF10', color: '#58a6ff', label: 'FETCH' },
  shell_tool:     { icon: '\uD83D\uDC1A', color: '#fa0', label: 'SHELL' },
};

export const TOOL_DEFAULT: ToolMeta = { icon: '\u2699\uFE0F', color: '#888', label: '???' };

export function getToolMeta(name: string): ToolMeta {
  return TOOL_META[name] || TOOL_DEFAULT;
}

export function getToolColor(name: string): string {
  return TOOL_META[name]?.color ?? '#888';
}

export function getToolClass(name: string): string {
  if (!name) return 'c-other';
  const n = name.toLowerCase();
  if (n === 'bash') return 'c-bash';
  if (n === 'read') return 'c-read';
  if (n === 'edit' || n === 'write') return 'c-edit';
  if (n === 'grep' || n === 'glob') return 'c-grep';
  if (n === 'agent') return 'c-agent';
  if (n.includes('web') || n.includes('fetch')) return 'c-web';
  return 'c-other';
}

// ─── Zone mappings (tool/status → room zone) ───────────
export const TOOL_ZONE: Record<string, ZoneName> = {
  Bash: 'terminal', Read: 'bookshelf', Edit: 'workbench', Write: 'workbench',
  Grep: 'search', Glob: 'search', Agent: 'comm',
  WebFetch: 'comm', WebSearch: 'comm', Skill: 'comm',
  ToolSearch: 'search', EnterPlanMode: 'workbench', ExitPlanMode: 'workbench',
  TaskCreate: 'workbench', TaskUpdate: 'workbench', NotebookEdit: 'workbench',
  exec_command: 'terminal', write_stdin: 'terminal',
  read_file: 'bookshelf', write_file: 'workbench',
  str_replace_based_edit_tool: 'workbench',
  glob_search: 'search', grep_search: 'search',
  web_search: 'comm', web_fetch: 'comm', shell_tool: 'terminal',
};

export const STATUS_ZONE: Record<string, ZoneName> = {
  running: 'terminal',
  waiting: 'outside',
  idle: 'rest',
};

