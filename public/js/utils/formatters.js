export const TOOL_COLORS = {
  Bash: '#ffa500', Read: '#0ff', Edit: '#0f0', Write: '#0f0',
  Grep: '#bc8cff', Glob: '#bc8cff', Agent: '#f0f',
  WebFetch: '#58a6ff', WebSearch: '#58a6ff', Skill: '#ff0',
  ToolSearch: '#aaa', EnterPlanMode: '#f0f', ExitPlanMode: '#f0f',
  TaskCreate: '#888', TaskUpdate: '#888', NotebookEdit: '#ff0',
};

export function getToolColor(name) {
  return TOOL_COLORS[name] || '#888';
}

export function getToolClass(name) {
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

export function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

export function fmtDuration(ms) {
  if (ms == null) return '...';
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return Math.floor(ms / 60000) + 'm' + Math.floor((ms % 60000) / 1000) + 's';
}

export function fmtElapsed(startMs) {
  const s = Math.floor((Date.now() - startMs) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

export function truncate(s, n = 80) {
  if (!s) return '';
  s = typeof s === 'string' ? s : JSON.stringify(s);
  return s.length > n ? s.slice(0, n) + '...' : s;
}

export function inputPreview(input) {
  if (!input) return '';
  return input.command || input.file_path || input.pattern || input.query || input.description || truncate(input.prompt, 60) || '';
}

export function prettyProject(name) {
  // Convert "-Users-jettlin-code-foo" to "~/code/foo"
  return name.replace(/^-Users-[^-]+-/, '~/').replace(/-/g, '/');
}

export function fmtSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1048576).toFixed(1) + 'MB';
}
