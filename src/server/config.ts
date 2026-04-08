import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFile } from 'fs/promises';
import { homedir } from 'os';

import type { AppConfig } from '../shared/types.js';
import {
  DEFAULT_PORT,
  DEFAULT_CLAUDE_DIR,
  DEFAULT_CODEX_DIR,
  DEFAULT_ACTIVE_THRESHOLD_MINUTES,
} from '../shared/constants.js';

/** Repo root (where config.json lives). */
export const PROJECT_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

interface RawConfig {
  port?: number;
  claudeDir?: string;
  codexDir?: string;
  activeThresholdMinutes?: number;
}

function expandHome(p: string): string {
  return p.replace(/^~/, homedir());
}

export async function loadConfig(): Promise<AppConfig> {
  let raw: RawConfig = {};
  try {
    raw = JSON.parse(await readFile(join(PROJECT_ROOT, 'config.json'), 'utf-8')) as RawConfig;
  } catch {
    // config.json is optional — use defaults
  }

  return {
    port: Number(process.env.PORT) || raw.port || DEFAULT_PORT,
    claudeDir: expandHome(raw.claudeDir || DEFAULT_CLAUDE_DIR),
    codexDir: expandHome(raw.codexDir || DEFAULT_CODEX_DIR),
    activeThresholdMs: (raw.activeThresholdMinutes || DEFAULT_ACTIVE_THRESHOLD_MINUTES) * 60 * 1000,
  };
}
