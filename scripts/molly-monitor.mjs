#!/usr/bin/env node
/**
 * Molly monitor wrapper.
 *
 * Keeps npm script compatibility while delegating to the maintained
 * TypeScript system health manager.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const isContinuous = process.argv.includes('--continuous');
const args = isContinuous
  ? ['tsx', 'scripts/system-health-manager.ts', 'monitor', '30']
  : ['tsx', 'scripts/system-health-manager.ts', 'check'];

const child = spawn('npx', args, {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
