import { join } from 'path';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { PROJECT_ROOT } from './config.js';

export interface DailyStats {
  date: string;
  totalSessions: number;
  toolCalls: number;
  bySource: { claude: number; codex: number };
  byProject: Record<string, { sessions: number; tools: number }>;
}

const STATS_DIR = join(PROJECT_ROOT, 'data', 'stats');

function statsPath(date: string): string {
  return join(STATS_DIR, `${date}.json`);
}

export function saveDailyStats(stats: DailyStats): void {
  mkdirSync(STATS_DIR, { recursive: true });
  writeFileSync(statsPath(stats.date), JSON.stringify(stats, null, 2), 'utf-8');
}

export function loadDailyStats(date: string): DailyStats | null {
  try {
    return JSON.parse(readFileSync(statsPath(date), 'utf-8')) as DailyStats;
  } catch {
    return null;
  }
}
