import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { PROJECT_ROOT } from './config.js';

export interface DailyStats {
  date: string;
  totalSessions: number;
  toolCalls: number;
  bySource: { claude: number; codex: number };
  byProject: Record<string, { sessions: number; tools: number }>;
}

const STATS_DIR = join(PROJECT_ROOT, 'data', 'stats');

function ensureDir(): void {
  if (!existsSync(STATS_DIR)) {
    mkdirSync(STATS_DIR, { recursive: true });
  }
}

function filePath(date: string): string {
  return join(STATS_DIR, `${date}.json`);
}

export function saveDailyStats(stats: DailyStats): void {
  ensureDir();
  writeFileSync(filePath(stats.date), JSON.stringify(stats, null, 2), 'utf-8');
}

export function loadDailyStats(date: string): DailyStats | null {
  const fp = filePath(date);
  if (!existsSync(fp)) return null;
  try {
    return JSON.parse(readFileSync(fp, 'utf-8')) as DailyStats;
  } catch {
    return null;
  }
}
