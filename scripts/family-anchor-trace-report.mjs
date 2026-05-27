#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const logPath = path.join(process.cwd(), 'logs', 'family-anchor-events.jsonl');

if (!fs.existsSync(logPath)) {
  console.log('No trace log found at logs/family-anchor-events.jsonl');
  process.exit(0);
}

const lines = fs
  .readFileSync(logPath, 'utf8')
  .split('\n')
  .filter((line) => line.trim().length > 0);

const events = [];
for (const line of lines) {
  try {
    events.push(JSON.parse(line));
  } catch {
    // skip malformed lines
  }
}

if (events.length === 0) {
  console.log('Trace log exists but contains no valid events.');
  process.exit(0);
}

const byLayer = new Map();
const bySource = new Map();
const byMatch = new Map();

for (const e of events) {
  const layer = e.layer ?? 'unknown';
  const source = e.source ?? 'unknown';
  const match = e.matchedType ?? 'none';

  byLayer.set(layer, (byLayer.get(layer) ?? 0) + 1);
  bySource.set(source, (bySource.get(source) ?? 0) + 1);
  byMatch.set(match, (byMatch.get(match) ?? 0) + 1);
}

console.log('=== Family Anchor Trace Summary ===');
console.log(`Total events: ${events.length}`);
console.log('');

console.log('By layer:');
for (const [key, count] of [...byLayer.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}: ${count}`);
}

console.log('');
console.log('By source:');
for (const [key, count] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}: ${count}`);
}

console.log('');
console.log('By trigger type:');
for (const [key, count] of [...byMatch.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}: ${count}`);
}

console.log('');
console.log('Last 10 events:');
for (const e of events.slice(-10)) {
  console.log(
    `  [${e.iso}] layer=${e.layer} source=${e.source} match=${e.matchedType} pattern=${e.matchedPattern ?? '-'} text="${(e.textPreview ?? '').replace(/\s+/g, ' ').slice(0, 90)}"`
  );
}
