import express from 'express';
import { join } from 'path';

import { loadConfig, PROJECT_ROOT } from './config.js';
import { createRouter } from './routes.js';

const config = await loadConfig();

const app = express();
app.use(express.static(join(PROJECT_ROOT, 'public')));
app.use(createRouter(config));

app.listen(config.port, () => {
  console.log(`\n  \u{1F47E} Claude Visual running at http://localhost:${config.port}\n`);
  console.log(`  Claude Code: ${config.claudeDir}/projects/`);
  console.log(`  Codex:       ${config.codexDir}/state_5.sqlite`);
  console.log(`\n  Active sessions = last modified within 30 minutes\n`);
});
