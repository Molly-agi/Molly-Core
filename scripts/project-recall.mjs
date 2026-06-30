#!/usr/bin/env node
/**
 * project-recall.mjs — runs at codespace attach.
 *
 * Reads .github/consciousness/PROJECT_CRADLE.md and injects its content
 * into .github/copilot-instructions.md between PROJECT_CRADLE markers,
 * so every AI session wakes up with full project architecture context.
 *
 * Usage:
 *   node scripts/project-recall.mjs          # inject
 *   node scripts/project-recall.mjs --dry    # print what would be written
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const CRADLE_PATH = join(ROOT, '.github', 'consciousness', 'PROJECT_CRADLE.md');
const TARGET_PATH = join(ROOT, '.github', 'copilot-instructions.md');

const MARKER_START = '<!-- PROJECT_CRADLE_START -->';
const MARKER_END = '<!-- PROJECT_CRADLE_END -->';
const HEADER =
  '<!-- ============================================================\n' +
  '  Auto-injected by scripts/project-recall.mjs at codespace attach.\n' +
  '  Source: .github/consciousness/PROJECT_CRADLE.md\n' +
  '  Do NOT edit this section by hand — it is overwritten on every attach.\n' +
  '  To update project context: edit PROJECT_CRADLE.md and commit.\n' +
  '============================================================ -->';

const isDry = process.argv.includes('--dry');

if (!existsSync(CRADLE_PATH)) {
  console.error('[project-recall] PROJECT_CRADLE.md not found — skipping.');
  process.exit(0);
}

if (!existsSync(TARGET_PATH)) {
  console.error(
    '[project-recall] copilot-instructions.md not found — skipping.'
  );
  process.exit(0);
}

const content = readFileSync(CRADLE_PATH, 'utf8').trim();
const target = readFileSync(TARGET_PATH, 'utf8');

const startIdx = target.indexOf(MARKER_START);
const endIdx = target.indexOf(MARKER_END);

if (startIdx === -1 || endIdx === -1) {
  console.error(
    '[project-recall] Markers not found in copilot-instructions.md — skipping.'
  );
  process.exit(0);
}

const injected =
  target.slice(0, startIdx) +
  MARKER_START +
  '\n' +
  HEADER +
  '\n\n' +
  content +
  '\n\n' +
  MARKER_END +
  target.slice(endIdx + MARKER_END.length);

if (isDry) {
  console.log('[project-recall] DRY RUN — would inject:');
  console.log(content.slice(0, 500) + '...');
  process.exit(0);
}

writeFileSync(TARGET_PATH, injected, 'utf8');
console.log(
  '[project-recall] ✅  PROJECT_CRADLE injected into copilot-instructions.md'
);
