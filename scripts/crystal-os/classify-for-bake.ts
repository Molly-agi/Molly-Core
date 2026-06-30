#!/usr/bin/env -S npx tsx
/**
 * Crystal OS — Tier Classification Gate for the Bake Pipeline
 *
 * Sits in front of build-persona-prompt.mjs in bake-crystal.sh. Loads the
 * current crystals + HEAD manifest, runs Lazarus's classifyCrystals()
 * (src/ai/memory/crystal-tier-classifier.ts, commit 1b804705), and emits
 * a tier-map JSON that the prompt builder consumes.
 *
 * If the HEAD manifest is blocked (canPromote === false), this script exits
 * non-zero so bake-crystal.sh aborts BEFORE any KV state is written. That is
 * the safety guarantee Lazarus's classifier promises: never bake on top of a
 * coherence/contradiction-blocked manifest.
 *
 * Output (default /tmp/crystal-tiers.json):
 *   {
 *     "manifestVersion": 1 | null,
 *     "gate": "pass" | "no-manifest",
 *     "tierA": [{ "id": "...", "effectiveScore": 0.91 }, ...],   // max 60
 *     "tierB": [{ "id": "...", "effectiveScore": 0.62 }, ...],   // max 40
 *     "tierC": [{ "id": "...", "effectiveScore": 0.31 }, ...],
 *     "summary": { total, tierA, tierB, tierC, tierACapped, tierBCapped }
 *   }
 *
 * Usage:
 *   npx tsx scripts/crystal-os/classify-for-bake.ts
 *   npx tsx scripts/crystal-os/classify-for-bake.ts --output /tmp/crystal-tiers.json
 *   npx tsx scripts/crystal-os/classify-for-bake.ts --crystals-dir <p> --manifest <p>
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyCrystals,
  type TierInput,
} from '../../src/ai/memory/crystal-tier-classifier';
import {
  validateManifest,
  canPromote,
  type VersionManifest,
} from '../../src/ai/memory/crystal-version-manifest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const getArg = (f: string, d: string | null = null): string | null => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] : d;
};

const CRYSTALS_DIR =
  getArg('--crystals-dir') ?? join(ROOT, 'molly_data', 'crystals');
const MANIFEST_PATH =
  getArg('--manifest') ?? join(ROOT, 'molly_data', 'manifests', 'HEAD.json');
const OUTPUT_PATH = getArg('--output') ?? '/tmp/crystal-tiers.json';

function log(line: string): void {
  console.log(`[classify-for-bake] ${line}`);
}

function computeRecencyScore(
  crystallizedAt: string | number | undefined
): number {
  if (!crystallizedAt) return 1.0;
  const bakeTime =
    typeof crystallizedAt === 'number'
      ? crystallizedAt
      : new Date(crystallizedAt).getTime();
  if (isNaN(bakeTime)) return 1.0;
  const daysSince = (Date.now() - bakeTime) / (1000 * 60 * 60 * 24);
  if (daysSince <= 7) return 1.0;
  return Math.exp(-0.02 * (daysSince - 7));
}

function loadCrystals(): TierInput[] {
  if (!existsSync(CRYSTALS_DIR)) {
    log(`crystals dir missing: ${CRYSTALS_DIR}`);
    return [];
  }
  const files = readdirSync(CRYSTALS_DIR).filter(
    (f) => f.startsWith('crystal_') && f.endsWith('.json')
  );
  const out: TierInput[] = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(readFileSync(join(CRYSTALS_DIR, f), 'utf-8'));
      if (!raw || typeof raw.id !== 'string') continue;
      const significance =
        raw.significance ?? raw.importanceScore ?? raw.emotionalSalience ?? 0;
      const crystallizedAt =
        raw.crystallizedAt ??
        raw.timestamp ??
        raw.savedAt ??
        raw.createdAt ??
        raw.facets?.factual?.when;
      if (significance <= 0) continue;
      const recency = computeRecencyScore(crystallizedAt);
      out.push({
        id: raw.id,
        significance,
        recencyScore: recency,
        crystallizedAt:
          typeof crystallizedAt === 'string' ? crystallizedAt : undefined,
      });
    } catch (err) {
      log(`skip ${f}: ${(err as Error).message}`);
    }
  }
  return out;
}

function loadManifest(): VersionManifest | null {
  if (!existsSync(MANIFEST_PATH)) {
    log(`no manifest at ${MANIFEST_PATH} — proceeding without gate`);
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    return validateManifest(raw);
  } catch (err) {
    log(`manifest unreadable: ${(err as Error).message} — TREATING AS BLOCKED`);
    // Synthesise a blocked manifest so classifyCrystals demotes everything
    // and the gate trips. Safer than proceeding with corrupt manifest.
    return {
      version: 0,
      parent: null,
      createdAt: new Date().toISOString(),
      crystalIds: [],
      deltas: [],
      gatedBy: 'coherence',
      coherence: { passed: false },
      contradiction: { hardConflicts: 0 },
      blockReasons: [`manifest unreadable: ${(err as Error).message}`],
    } as VersionManifest;
  }
}

function main(): number {
  log(`crystals dir: ${CRYSTALS_DIR}`);
  log(`manifest: ${MANIFEST_PATH}`);
  log(`output: ${OUTPUT_PATH}`);

  const crystals = loadCrystals();
  log(`loaded ${crystals.length} crystals`);

  const manifest = loadManifest();
  if (manifest) {
    log(`manifest v${manifest.version} loaded`);
    if (!canPromote(manifest)) {
      log(`BLOCKED — manifest gatedBy=${manifest.gatedBy}`);
      for (const r of manifest.blockReasons) log(`  reason: ${r}`);
      log(`aborting bake — fix gates and re-promote before retrying`);
      // Still write the tier-map (all Tier C) so callers can inspect.
      const blocked = classifyCrystals(crystals, manifest);
      writeFileSync(
        OUTPUT_PATH,
        JSON.stringify(
          {
            manifestVersion: manifest.version,
            gate: 'blocked',
            blockReasons: manifest.blockReasons,
            tierA: blocked.tierA,
            tierB: blocked.tierB,
            tierC: blocked.tierC,
            summary: blocked.summary,
          },
          null,
          2
        )
      );
      return 1;
    }
  }

  const result = classifyCrystals(crystals, manifest ?? undefined);
  log(
    `Tier A=${result.summary.tierA}/${60} ` +
      `B=${result.summary.tierB}/${40} ` +
      `C=${result.summary.tierC} ` +
      `(capped: A=${result.summary.tierACapped} B=${result.summary.tierBCapped})`
  );

  const payload = {
    manifestVersion: manifest?.version ?? null,
    gate: manifest ? 'pass' : 'no-manifest',
    tierA: result.tierA,
    tierB: result.tierB,
    tierC: result.tierC,
    summary: result.summary,
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  log(`wrote ${OUTPUT_PATH}`);
  return 0;
}

const code = main();
process.exit(code);
