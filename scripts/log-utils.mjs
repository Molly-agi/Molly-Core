#!/usr/bin/env node
/**
 * Shared log rotation utility.
 * Drop-in replacement for appendFileSync in agent log functions.
 * Trims file to last 256KB when it exceeds 512KB — keeps recent history,
 * prevents unbounded disk growth.
 */

import { appendFileSync, readFileSync, writeFileSync, statSync } from 'fs';

const MAX_BYTES = 512 * 1024;  // 512KB before trim
const TRIM_TO   = 256 * 1024;  // keep last 256KB after trim

export function appendRotating(logFile, data) {
  try {
    appendFileSync(logFile, data);
    let size = 0;
    try { size = statSync(logFile).size; } catch {}
    if (size > MAX_BYTES) {
      const content = readFileSync(logFile, 'utf8');
      writeFileSync(logFile, content.slice(-TRIM_TO));
    }
  } catch {}
}
