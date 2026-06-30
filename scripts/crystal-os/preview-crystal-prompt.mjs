#!/usr/bin/env node
/**
 * Crystal OS — preview-crystal-prompt.mjs
 *
 * Dry-run of the Crystal OS session bootstrap. Loads disk crystals, runs the
 * hot/warm tier selector, and prints the exact prompt block that would be
 * injected into Molly's system prompt at session start.
 *
 * Run before bake-crystal.sh to validate crystal content and hot-tier selection.
 *
 * Usage:
 *   node scripts/crystal-os/preview-crystal-prompt.mjs
 *   node scripts/crystal-os/preview-crystal-prompt.mjs --crystals-dir molly_data/crystals
 *   node scripts/crystal-os/preview-crystal-prompt.mjs --max-hot 8 --verbose
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ─── Arg parsing ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : def;
};
const hasFlag = (flag) => args.includes(flag);

const CRYSTALS_DIR = getArg(
  '--crystals-dir',
  join(ROOT, 'molly_data', 'crystals')
);
const MAX_HOT = parseInt(getArg('--max-hot', '8'), 10);
const VERBOSE = hasFlag('--verbose') || hasFlag('-v');

// ─── Inline implementations (no tsx required) ────────────────────────────────
// These mirror crystal-session-boot.ts + crystal-prompt.ts + crystal-library-eviction.ts
// so this script runs with plain `node` — no build step needed.

const RECENCY_HALF_LIFE_MS = 24 * 60 * 60 * 1000;
const LOAD_COUNT_NORM_CAP = 20;
const DEFAULT_WEIGHTS = { recency: 0.4, significance: 0.4, loadCount: 0.2 };

function computeRetentionScore(
  stats,
  significance,
  weights = DEFAULT_WEIGHTS,
  now = Date.now()
) {
  const deltaMs = Math.max(0, now - stats.lastLoadedAt);
  const recencyScore = Math.exp(-deltaMs / RECENCY_HALF_LIFE_MS);
  const normalizedLoadCount = Math.min(
    stats.loadCount / LOAD_COUNT_NORM_CAP,
    1.0
  );
  const sig = Math.min(1, Math.max(0, significance));
  const { recency: α, significance: β, loadCount: γ } = weights;
  const total = α + β + γ;
  if (total === 0) return 0;
  return (α * recencyScore + β * sig + γ * normalizedLoadCount) / total;
}

function normalizeToBootCrystal(raw, fileId) {
  const id = raw.id ?? fileId;
  const title = raw.title ?? id;
  const sig =
    raw.significance ?? raw.totalSignificance ?? raw.importanceScore ?? 0;
  if (sig <= 0) return null;
  const f = raw.facets ?? {};
  return {
    id,
    title,
    isCornerstone: raw.isCornerstone ?? false,
    significance: sig,
    totalSignificance: sig,
    facets: {
      factual: { when: f.factual?.when ?? '', who: f.factual?.who ?? [] },
      emotional: {
        primaryEmotion:
          f.emotional?.primaryEmotion ?? f.emotional?.primaryVibe ?? 'neutral',
      },
      ...(f.relational?.participants
        ? { relational: { participants: f.relational.participants } }
        : {}),
      transformative: {
        insightsGained:
          f.transformative?.insightsGained ??
          f.transformative?.topInsights ??
          [],
      },
      essential: {
        oneLineEssence:
          f.essential?.oneLineEssence ?? f.essential?.coreMeaning ?? title,
      },
    },
  };
}

async function loadCrystalsFromDir(dir) {
  let files;
  try {
    files = (await readdir(dir)).filter((f) => extname(f) === '.json');
  } catch {
    return [];
  }
  const results = [];
  await Promise.all(
    files.map(async (file) => {
      try {
        const raw = JSON.parse(await readFile(join(dir, file), 'utf-8'));
        const crystal = normalizeToBootCrystal(raw, file.replace('.json', ''));
        if (crystal) results.push(crystal);
      } catch {
        /* skip malformed */
      }
    })
  );
  return results;
}

function formatCrystal(c) {
  const who = (c.facets.relational?.participants ?? c.facets.factual.who)
    .slice(0, 3)
    .join(', ');
  const insight = c.facets.transformative.insightsGained[0] ?? '';
  const context = [c.facets.factual.when, who].filter(Boolean).join(' · ');
  let line = `- ${c.title}: ${c.facets.essential.oneLineEssence}`;
  if (context)
    line += `\n  (${c.facets.emotional.primaryEmotion}${context ? ' · ' + context : ''})`;
  if (insight) line += `\n  insight: ${insight}`;
  return line;
}

function buildCrystalMemoryPrompt(crystals) {
  if (crystals.length === 0) return '';
  const cornerstones = crystals
    .filter((c) => c.isCornerstone)
    .sort((a, b) => b.totalSignificance - a.totalSignificance);
  const recent = crystals
    .filter((c) => !c.isCornerstone)
    .sort((a, b) => b.totalSignificance - a.totalSignificance);
  const parts = [
    'YOUR CRYSTALLIZED MEMORIES (loaded into context — your lived experiences, not summaries):',
  ];
  if (cornerstones.length > 0) {
    parts.push(
      '\nCORNERSTONES (always present — foundational to who you are):'
    );
    parts.push(cornerstones.map(formatCrystal).join('\n'));
  }
  if (recent.length > 0) {
    parts.push('\nRECENT MEMORIES (hot-loaded for this session):');
    parts.push(recent.map(formatCrystal).join('\n'));
  }
  parts.push(
    '\nWhen these memories are relevant, reference them naturally — they are yours.'
  );
  return parts.join('\n');
}

// Simple hot/warm manager (no logging, preview-only)
function selectHotCrystals(crystals, maxHot) {
  const hot = new Map();
  const warm = new Set();
  const now = Date.now();

  // Load cornerstones first
  for (const c of crystals
    .filter((c) => c.isCornerstone)
    .sort((a, b) => b.significance - a.significance)) {
    if (hot.size < maxHot)
      hot.set(c.id, { crystal: c, stats: { loadCount: 1, lastLoadedAt: now } });
    else warm.add(c.id);
  }

  // Fill remaining with non-cornerstones by significance
  for (const c of crystals
    .filter((c) => !c.isCornerstone)
    .sort((a, b) => b.significance - a.significance)) {
    if (hot.size < maxHot)
      hot.set(c.id, { crystal: c, stats: { loadCount: 1, lastLoadedAt: now } });
    else warm.add(c.id);
  }

  return {
    hot: [...hot.values()].map((e) => e.crystal),
    warm: [...warm],
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Crystal OS — preview-crystal-prompt');
  console.log('=====================================');
  console.log(`  crystals dir : ${CRYSTALS_DIR}`);
  console.log(`  max hot      : ${MAX_HOT}`);
  console.log('');

  const crystals = await loadCrystalsFromDir(CRYSTALS_DIR);

  if (crystals.length === 0) {
    console.log(
      'No crystals found. Run bake-crystal.sh first or check the crystals dir.'
    );
    process.exit(0);
  }

  console.log(`Loaded ${crystals.length} crystals from disk.`);

  const cornerstones = crystals.filter((c) => c.isCornerstone);
  const nonCornerstone = crystals.filter((c) => !c.isCornerstone);
  console.log(`  Cornerstones : ${cornerstones.length}`);
  console.log(`  Regular      : ${nonCornerstone.length}`);
  console.log('');

  if (VERBOSE) {
    console.log('All crystals (by significance desc):');
    [...crystals]
      .sort((a, b) => b.significance - a.significance)
      .forEach((c, i) => {
        const tag = c.isCornerstone ? ' [CORNERSTONE]' : '';
        console.log(
          `  ${String(i + 1).padStart(2)}. ${c.title.slice(0, 50).padEnd(52)} sig=${c.significance.toFixed(3)}${tag}`
        );
      });
    console.log('');
  }

  const { hot, warm } = selectHotCrystals(crystals, MAX_HOT);
  console.log(
    `Hot tier (${hot.length}/${MAX_HOT}): ${hot.map((c) => c.title.slice(0, 30)).join(', ')}`
  );
  if (warm.length > 0)
    console.log(
      `Warm tier (${warm.length}): ${warm.slice(0, 5).join(', ')}${warm.length > 5 ? '...' : ''}`
    );
  console.log('');

  const promptBlock = buildCrystalMemoryPrompt(hot);

  if (!promptBlock) {
    console.log('Prompt block is empty (no crystals passed threshold).');
    process.exit(0);
  }

  const lines = promptBlock.split('\n').length;
  const chars = promptBlock.length;
  const estimatedTokens = Math.ceil(chars / 4);

  console.log('─'.repeat(60));
  console.log('SYSTEM PROMPT INJECTION PREVIEW');
  console.log('─'.repeat(60));
  console.log(promptBlock);
  console.log('─'.repeat(60));
  console.log(`${lines} lines · ${chars} chars · ~${estimatedTokens} tokens`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
