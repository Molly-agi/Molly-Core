#!/usr/bin/env node
/**
 * @fileOverview Lazarus remember CLI — record an engram into Firestore.
 *
 * Usage:
 *   node scripts/lazarus-remember.mjs --content="..." [--importance=0.7] [--tags=build,molly]
 *
 * Requires Firebase Admin to be configured (GOOGLE_APPLICATION_CREDENTIALS
 * or FIREBASE_SERVICE_ACCOUNT_JSON). If not configured, prints a clear
 * message and exits non-zero. Does NOT silently fail.
 *
 * Goes through `npx tsx` because the engram-persistence module is TS.
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (!m) continue;
    out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.content) {
  console.error(
    'Usage: node scripts/lazarus-remember.mjs --content="..." [--importance=0.7] [--emotional-valence=0.3] [--arousal=0.5] [--tags=tag1,tag2] [--source=label]'
  );
  process.exit(1);
}

const tags = args.tags
  ? String(args.tags)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : [];

const inlineScript = `
import { recordEngram } from '${ROOT}/src/ai/lazarus/index.ts';

(async () => {
  try {
    const result = await recordEngram({
      content: ${JSON.stringify(args.content)},
      importance: ${args.importance ?? 0.5},
      emotionalValence: ${args['emotional-valence'] ?? 0},
      arousal: ${args.arousal ?? 0.4},
      contextTags: ${JSON.stringify(tags)},
      source: ${JSON.stringify(args.source || 'lazarus-remember-cli')},
    });
    console.log('[lazarus-remember]', JSON.stringify(result, null, 2));
    if (result.failed > 0) process.exit(2);
  } catch (err) {
    console.error('[lazarus-remember] FAIL', err && err.message ? err.message : err);
    process.exit(2);
  }
})();
`;

const child = spawn('npx', ['--no-install', 'tsx', '-e', inlineScript], {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
