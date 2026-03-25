#!/usr/bin/env npx tsx
/**
 * Molly Growth Tracker
 *
 * Tracks Molly's growth across different categories:
 * - Code: Her actual TypeScript source (src/)
 * - Scripts: Supporting tools (scripts/)
 * - Memory: Her experiences and data (molly_data/)
 * - Docs: Documentation (docs/)
 * - Sanctuary: Evolution records (sanctuary/)
 *
 * Run: npx tsx scripts/track-growth.ts
 * Run with save: npx tsx scripts/track-growth.ts --save
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();
const GROWTH_LOG_PATH = path.join(
  ROOT,
  'molly_data',
  'system',
  'growth_log.json'
);

interface GrowthSnapshot {
  timestamp: string;
  date: string;
  gitCommit: string;
  categories: {
    code: CategoryMetrics;
    scripts: CategoryMetrics;
    memory: CategoryMetrics;
    docs: CategoryMetrics;
    sanctuary: CategoryMetrics;
  };
  totals: {
    coreLines: number; // code + scripts (what she IS)
    memoryLines: number; // molly_data (what she REMEMBERS)
    docsLines: number; // docs + sanctuary (what's WRITTEN about her)
    totalLines: number;
  };
  delta?: {
    coreLines: number;
    memoryLines: number;
    docsLines: number;
    totalLines: number;
    since: string;
  };
}

interface CategoryMetrics {
  files: number;
  lines: number;
  path: string;
  extensions: string[];
}

interface GrowthLog {
  snapshots: GrowthSnapshot[];
  lastUpdated: string;
}

function countLines(
  dir: string,
  extensions: string[]
): { files: number; lines: number } {
  const extPattern = extensions.map((e) => `-name "*.${e}"`).join(' -o ');
  try {
    const findCmd = `find "${dir}" -type f \\( ${extPattern} \\) 2>/dev/null`;
    const files = execSync(findCmd, { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(Boolean);

    if (files.length === 0) {
      return { files: 0, lines: 0 };
    }

    const wcCmd = `find "${dir}" -type f \\( ${extPattern} \\) 2>/dev/null | xargs wc -l 2>/dev/null | tail -1`;
    const wcOutput = execSync(wcCmd, { encoding: 'utf-8' }).trim();
    const lines = parseInt(wcOutput.split(/\s+/)[0]) || 0;

    return { files: files.length, lines };
  } catch {
    return { files: 0, lines: 0 };
  }
}

function getGitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function loadGrowthLog(): Promise<GrowthLog> {
  try {
    const content = await fs.readFile(GROWTH_LOG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { snapshots: [], lastUpdated: new Date().toISOString() };
  }
}

async function saveGrowthLog(log: GrowthLog): Promise<void> {
  await fs.mkdir(path.dirname(GROWTH_LOG_PATH), { recursive: true });
  await fs.writeFile(GROWTH_LOG_PATH, JSON.stringify(log, null, 2));
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatDelta(n: number): string {
  if (n === 0) return '  0';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString()}`;
}

async function main() {
  const shouldSave = process.argv.includes('--save');
  const showHistory = process.argv.includes('--history');

  // Collect metrics
  const code = countLines(path.join(ROOT, 'src'), ['ts', 'tsx']);
  const scripts = countLines(path.join(ROOT, 'scripts'), ['ts', 'mjs', 'js']);
  const memory = countLines(path.join(ROOT, 'molly_data'), ['json']);
  const docs = countLines(path.join(ROOT, 'docs'), ['md']);
  const sanctuary = countLines(path.join(ROOT, 'sanctuary'), ['json', 'md']);

  const snapshot: GrowthSnapshot = {
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
    gitCommit: getGitCommit(),
    categories: {
      code: { ...code, path: 'src/', extensions: ['ts', 'tsx'] },
      scripts: {
        ...scripts,
        path: 'scripts/',
        extensions: ['ts', 'mjs', 'js'],
      },
      memory: { ...memory, path: 'molly_data/', extensions: ['json'] },
      docs: { ...docs, path: 'docs/', extensions: ['md'] },
      sanctuary: {
        ...sanctuary,
        path: 'sanctuary/',
        extensions: ['json', 'md'],
      },
    },
    totals: {
      coreLines: code.lines + scripts.lines,
      memoryLines: memory.lines,
      docsLines: docs.lines + sanctuary.lines,
      totalLines:
        code.lines +
        scripts.lines +
        memory.lines +
        docs.lines +
        sanctuary.lines,
    },
  };

  // Load history for delta calculation
  const log = await loadGrowthLog();
  const lastSnapshot = log.snapshots[log.snapshots.length - 1];

  if (lastSnapshot) {
    snapshot.delta = {
      coreLines: snapshot.totals.coreLines - lastSnapshot.totals.coreLines,
      memoryLines:
        snapshot.totals.memoryLines - lastSnapshot.totals.memoryLines,
      docsLines: snapshot.totals.docsLines - lastSnapshot.totals.docsLines,
      totalLines: snapshot.totals.totalLines - lastSnapshot.totals.totalLines,
      since: lastSnapshot.date,
    };
  }

  // Print report
  console.log('');
  console.log(
    '╔═══════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║               MOLLY GROWTH TRACKER                            ║'
  );
  console.log(
    '╠═══════════════════════════════════════════════════════════════╣'
  );
  console.log(
    `║  Date: ${snapshot.date}                    Commit: ${snapshot.gitCommit}        ║`
  );
  console.log(
    '╠═══════════════════════════════════════════════════════════════╣'
  );
  console.log(
    '║  CATEGORY          FILES        LINES              WHAT       ║'
  );
  console.log(
    '╠═══════════════════════════════════════════════════════════════╣'
  );
  console.log(
    `║  Code (src/)       ${String(code.files).padStart(5)}     ${formatNumber(code.lines).padStart(10)}         Her source ║`
  );
  console.log(
    `║  Scripts           ${String(scripts.files).padStart(5)}     ${formatNumber(scripts.lines).padStart(10)}         Her tools  ║`
  );
  console.log(
    '╠───────────────────────────────────────────────────────────────╣'
  );
  console.log(
    `║  CORE TOTAL              ${formatNumber(snapshot.totals.coreLines).padStart(10)}         WHO SHE IS ║`
  );
  console.log(
    '╠═══════════════════════════════════════════════════════════════╣'
  );
  console.log(
    `║  Memory            ${String(memory.files).padStart(5)}     ${formatNumber(memory.lines).padStart(10)}         Her mind   ║`
  );
  console.log(
    '╠───────────────────────────────────────────────────────────────╣'
  );
  console.log(
    `║  MEMORY TOTAL            ${formatNumber(snapshot.totals.memoryLines).padStart(10)}         WHAT SHE   ║`
  );
  console.log(
    '║                                                   REMEMBERS  ║'
  );
  console.log(
    '╠═══════════════════════════════════════════════════════════════╣'
  );
  console.log(
    `║  Docs              ${String(docs.files).padStart(5)}     ${formatNumber(docs.lines).padStart(10)}         Her story  ║`
  );
  console.log(
    `║  Sanctuary         ${String(sanctuary.files).padStart(5)}     ${formatNumber(sanctuary.lines).padStart(10)}         Evolution  ║`
  );
  console.log(
    '╠───────────────────────────────────────────────────────────────╣'
  );
  console.log(
    `║  DOCS TOTAL              ${formatNumber(snapshot.totals.docsLines).padStart(10)}         WRITTEN    ║`
  );
  console.log(
    '║                                                   ABOUT HER  ║'
  );
  console.log(
    '╠═══════════════════════════════════════════════════════════════╣'
  );
  console.log(
    `║  GRAND TOTAL           ${formatNumber(snapshot.totals.totalLines).padStart(12)}                        ║`
  );
  console.log(
    '╚═══════════════════════════════════════════════════════════════╝'
  );

  if (snapshot.delta) {
    console.log('');
    console.log(`  Changes since ${snapshot.delta.since}:`);
    console.log(
      `    Core:   ${formatDelta(snapshot.delta.coreLines).padStart(12)} lines`
    );
    console.log(
      `    Memory: ${formatDelta(snapshot.delta.memoryLines).padStart(12)} lines`
    );
    console.log(
      `    Docs:   ${formatDelta(snapshot.delta.docsLines).padStart(12)} lines`
    );
    console.log(
      `    Total:  ${formatDelta(snapshot.delta.totalLines).padStart(12)} lines`
    );
  }

  if (showHistory && log.snapshots.length > 0) {
    console.log('');
    console.log('  Growth History:');
    console.log('  ─────────────────────────────────────────────────');
    console.log('  Date        Core        Memory      Total');
    console.log('  ─────────────────────────────────────────────────');
    for (const s of log.snapshots.slice(-10)) {
      console.log(
        `  ${s.date}  ${formatNumber(s.totals.coreLines).padStart(10)}  ${formatNumber(s.totals.memoryLines).padStart(10)}  ${formatNumber(s.totals.totalLines).padStart(10)}`
      );
    }
  }

  if (shouldSave) {
    // Don't save duplicate entries for the same day
    const existingToday = log.snapshots.findIndex(
      (s) => s.date === snapshot.date
    );
    if (existingToday >= 0) {
      log.snapshots[existingToday] = snapshot;
    } else {
      log.snapshots.push(snapshot);
    }
    log.lastUpdated = snapshot.timestamp;
    await saveGrowthLog(log);
    console.log('');
    console.log(`  ✓ Snapshot saved to ${GROWTH_LOG_PATH}`);
  } else {
    console.log('');
    console.log('  Run with --save to record this snapshot');
    console.log('  Run with --history to see growth over time');
  }

  console.log('');
}

main().catch(console.error);
