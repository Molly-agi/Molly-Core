#!/usr/bin/env -S npx tsx
// scripts/titan/null-baseline-monitor.ts
//
// Monitoring wrapper for null-baseline-72b.ts.
// Watches the checkpoint JSONL and logs phase transitions.
// If the child dies without completing, reports where it failed.
//
// Usage: npx tsx scripts/titan/null-baseline-monitor.ts

import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const CHECKPOINT =
  '/workspaces/Molly-Core/docs/benchmarks/reports/null-baseline-72b-checkpoint.jsonl';
const LOG_FILE = '/tmp/null-baseline-72b.log';
const SCRIPT = join(process.cwd(), 'scripts/titan/null-baseline-72b.ts');

const PHASES = [
  '[1/4] Loading eval corpus',
  '[2/4] Loading GGUF',
  '[3/4] Initializing parallel worker pool',
  '[4/4] Running null-baseline perplexity eval',
];

function getWindowCount(): number {
  if (!existsSync(CHECKPOINT)) return 0;
  const lines = readFileSync(CHECKPOINT, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean);
  return lines.length;
}

function getLastPhase(): string {
  if (!existsSync(LOG_FILE)) return 'not started';
  const log = readFileSync(LOG_FILE, 'utf-8');
  let last = 'startup';
  for (const phase of PHASES) {
    if (log.includes(phase)) last = phase;
  }
  return last;
}

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

async function main() {
  console.log(`[monitor] ${timestamp()} — Starting null-baseline-72b`);
  console.log(`[monitor] Checkpoint: ${CHECKPOINT}`);
  console.log(`[monitor] Log: ${LOG_FILE}\n`);

  const windowsBefore = getWindowCount();
  console.log(`[monitor] Existing windows in checkpoint: ${windowsBefore}`);

  const child = spawn('npx', ['tsx', SCRIPT], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let lastReportedWindows = windowsBefore;
  let lastPhase = '';

  // Pipe stdout/stderr to log file AND console
  const { createWriteStream } = await import('fs');
  const logStream = createWriteStream(LOG_FILE, { flags: 'w' });

  child.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    logStream.write(text);
    process.stdout.write(text);

    // Detect phase transitions
    for (const phase of PHASES) {
      if (text.includes(phase) && phase !== lastPhase) {
        lastPhase = phase;
        console.log(`\n[monitor] ${timestamp()} — PHASE: ${phase}`);
      }
    }
  });

  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    logStream.write(text);
    process.stderr.write(text);
  });

  // Periodic checkpoint progress
  const interval = setInterval(() => {
    const windows = getWindowCount();
    if (windows > lastReportedWindows) {
      const rate = windows - windowsBefore;
      console.log(
        `[monitor] ${timestamp()} — ${windows}/30 windows complete (${rate} this run)`
      );
      lastReportedWindows = windows;
    }
  }, 30_000);

  child.on('exit', (code, signal) => {
    clearInterval(interval);
    logStream.end();

    const finalWindows = getWindowCount();
    const phase = getLastPhase();

    console.log(`\n[monitor] ${'='.repeat(50)}`);
    console.log(`[monitor] ${timestamp()} — Process exited`);
    console.log(`[monitor]   Exit code: ${code}`);
    console.log(`[monitor]   Signal: ${signal ?? 'none'}`);
    console.log(`[monitor]   Last phase reached: ${phase}`);
    console.log(`[monitor]   Windows completed: ${finalWindows}/30`);
    console.log(
      `[monitor]   Windows this run: ${finalWindows - windowsBefore}`
    );

    if (code !== 0 && finalWindows < 30) {
      console.log(`[monitor]   STATUS: FAILED — died in "${phase}"`);
      if (phase.includes('[2/4]') || phase.includes('[3/4]')) {
        console.log(
          `[monitor]   DIAGNOSIS: Died during model loading (OOM likely)`
        );
        console.log(
          `[monitor]   SUGGESTION: Reduce workers or check available RAM`
        );
      }
    } else if (finalWindows >= 30) {
      console.log(`[monitor]   STATUS: COMPLETE`);
    }
    console.log(`[monitor] ${'='.repeat(50)}`);
  });

  console.log(`[monitor] Child PID: ${child.pid}`);
}

main().catch((err) => {
  console.error(`[monitor] Fatal: ${err.stack ?? err.message}`);
  process.exit(1);
});
