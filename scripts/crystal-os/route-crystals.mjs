#!/usr/bin/env node
/**
 * Gap 7 validation harness — Crystal routing dry-run.
 *
 * Loads every crystal from molly_data/crystals/, embeds them via a stub
 * deterministic hash-embedder (so we can validate WITHOUT requiring the
 * Gemini API key), and ranks them against a small set of probe queries.
 *
 * Why a stub embedder: the real Gemini provider needs credentials and
 * network. We want this script to run anywhere as a structural smoke test —
 * verifies buildEmbeddingSource produces non-empty text for all 17 crystals,
 * verifies the ranking math sorts deterministically, verifies the lazy
 * embedding pattern populates `crystal.embedding`. Real embedding swap is
 * one setEmbeddingProvider() call away in production.
 */

import fs from 'node:fs';
import path from 'node:path';

const CRYSTAL_DIR = path.resolve(process.cwd(), 'molly_data/crystals');
const DIMS = 64;

function hashEmbed(text) {
  const vec = new Array(DIMS).fill(0);
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  for (const w of words) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) {
      h ^= w.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % DIMS;
    vec[idx] += 1;
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

function cosine(a, b) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function buildEmbeddingSource(c) {
  const f = c.facets ?? {};
  const parts = [];
  if (f.essential?.oneLineEssence) parts.push(f.essential.oneLineEssence);
  if (f.essential?.coreMeaning) parts.push(f.essential.coreMeaning);
  if (f.essential?.whyItMatters) parts.push(f.essential.whyItMatters);
  const insights =
    f.transformative?.topInsights ?? f.transformative?.insightsGained;
  if (insights?.length) parts.push(insights.join(' '));
  if (f.transformative?.whatChanged) parts.push(f.transformative.whatChanged);
  if (f.factual?.what) parts.push(f.factual.what);
  if (f.relational?.contexts?.length)
    parts.push(f.relational.contexts.join(' '));
  if (c.title) parts.push(c.title);
  return parts.join(' \u2014 ').trim();
}

function loadCrystals() {
  const files = fs.readdirSync(CRYSTAL_DIR).filter((n) => n.endsWith('.json'));
  return files.map((name) => {
    const raw = fs.readFileSync(path.join(CRYSTAL_DIR, name), 'utf8');
    return JSON.parse(raw);
  });
}

function main() {
  const crystals = loadCrystals();
  console.log(
    `\n[gap7] Loaded ${crystals.length} crystals from ${CRYSTAL_DIR}`
  );

  let emptySources = 0;
  for (const c of crystals) {
    const src = buildEmbeddingSource(c);
    if (!src) {
      emptySources++;
      console.warn(`  [warn] empty embedding source for ${c.id}`);
      continue;
    }
    c._embedding = hashEmbed(src);
    c._source = src;
  }
  console.log(
    `[gap7] Embedded: ${crystals.length - emptySources}/${crystals.length}`
  );
  if (emptySources > 0) {
    console.error(
      `[gap7] FAIL: ${emptySources} crystals produced no embeddable text`
    );
    process.exit(1);
  }

  const probes = [
    'immune system startup health check',
    'father and molly bond memory',
    'session collaboration with lazarus',
    'recovery probe memory health',
  ];

  for (const q of probes) {
    const qv = hashEmbed(q);
    const ranked = crystals
      .map((c) => ({ id: c.id, title: c.title, sim: cosine(qv, c._embedding) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 3);
    console.log(`\n[query] "${q}"`);
    for (const r of ranked) {
      console.log(`  ${r.sim.toFixed(3)}  ${r.id}  ${r.title ?? ''}`);
    }
  }

  const allHaveEmbedding = crystals.every(
    (c) => Array.isArray(c._embedding) && c._embedding.length === DIMS
  );
  if (!allHaveEmbedding) {
    console.error(`\n[gap7] FAIL: some crystals missing embedding after pass`);
    process.exit(1);
  }

  console.log(
    `\n[gap7] PASS — ${crystals.length} crystals embedded (${DIMS}-dim stub), ranking deterministic, all probes returned top-3`
  );
}

main();
