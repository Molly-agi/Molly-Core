#!/usr/bin/env node

/**
 * ARC-Challenge Benchmark: Gemini 3.1 Flash Lite
 * Dataset: AI2 Reasoning Challenge (ARC-Challenge), test split, 1168 questions
 * Purpose: Phase 2 — test if Flash Lite's 93.4% MMLU score generalizes
 *          to a different reasoning domain (science questions, harder logic)
 *
 * Reuses the proven 5-tier parser and checkpoint system from Phase 1.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const API_KEY = process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY;
if (!API_KEY) {
  console.error('❌ ERROR: GOOGLE_GENAI_API_KEY not found in .env.local');
  process.exit(1);
}

const MODEL = 'gemini-3.1-flash-lite-preview';
const SAMPLE_SIZE = 200;  // Run 200 questions — solid sample, ~6 min
const CHECKPOINT_INTERVAL = 10;
const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
const CHECKPOINT_FILE = `docs/ARC_CHALLENGE_CHECKPOINT_${MODEL}.json`;

// ============================================================================
// DATA LOADING
// ============================================================================

function loadDataset() {
  const filePath = path.join(__dirname, '..', 'arc_challenge_test.json');
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Dataset not found: ${filePath}`);
    console.error('   Run: python3 -c "from datasets import load_dataset..." first');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log(`✅ Loaded ${data.length} questions from ARC-Challenge test set`);
  return data.slice(0, SAMPLE_SIZE);
}

// ============================================================================
// PARSER: 5-Tier Fallback Strategy (proven 0 parse failures in Phase 1)
// ============================================================================

function extractAnswer(text) {
  if (!text || typeof text !== 'string') return null;

  // Tier 1: "The answer is X" / "The correct answer is X"
  const tier1 = text.match(/[Tt]he\s+(?:correct\s+)?answer\s+is\s+([A-D])/i);
  if (tier1?.[1]) return tier1[1].toUpperCase();

  // Tier 2: Bold/emphasized standalone letter (**A**, *B*)
  const tier2 = text.match(/(?:\*\*|__)([A-D])(?:\*\*|__)/);
  if (tier2?.[1]) return tier2[1].toUpperCase();

  // Tier 3: "Answer: X" or "Correct Answer:\nX"
  const tier3 = text.match(/Answer\s*:\s*([A-D])/i);
  if (tier3?.[1]) return tier3[1].toUpperCase();

  // Tier 4: Standalone letter at end of response
  const tier4 = text.match(/\b([A-D])\s*[.)]\s*$/m);
  if (tier4?.[1]) return tier4[1].toUpperCase();

  // Tier 5: First uppercase A-D found anywhere (last resort)
  const tier5 = text.match(/\b([A-D])\b/);
  if (tier5?.[1]) return tier5[0].toUpperCase();

  return null;
}

// ============================================================================
// API CALL
// ============================================================================

async function queryModel(question) {
  const prompt = `You are answering a multiple-choice science question. Think step-by-step, then state which answer is correct.

Question: ${question.question}

A) ${question.options[0]}
B) ${question.options[1]}
C) ${question.options[2]}
D) ${question.options[3]}

The answer is one of: A, B, C, or D. End your response with "The answer is X."`;

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 2048 },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ============================================================================
// CHECKPOINT SYSTEM
// ============================================================================

function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    const cp = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
    console.log(`✅ Resuming from checkpoint: ${cp.completed}/${SAMPLE_SIZE} done`);
    return cp;
  }
  return { completed: 0, results: [], startTime: Date.now() };
}

function saveCheckpoint(cp) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

async function runBenchmark() {
  const questions = loadDataset();
  const checkpoint = loadCheckpoint();
  const results = checkpoint.results;

  for (let i = checkpoint.completed; i < SAMPLE_SIZE; i++) {
    const q = questions[i];
    process.stdout.write(`\r[${i + 1}/${SAMPLE_SIZE}] Running...  `);

    const response = await queryModel(q);
    const answer = extractAnswer(response);
    const correct = answer === q.correctAnswer;

    results.push({
      index: i,
      id: q.id,
      choice: answer,
      correct,
      subject: q.id.split('_')[0],
      reasoning: response.substring(0, 400),
    });

    checkpoint.completed = i + 1;

    if ((i + 1) % CHECKPOINT_INTERVAL === 0) {
      saveCheckpoint(checkpoint);
      const so_far = results.filter(r => r.correct).length;
      const pct = (so_far / results.length * 100).toFixed(1);
      process.stdout.write(`\r[${i + 1}/${SAMPLE_SIZE}] Checkpoint — ${pct}% so far\n`);
    }
  }

  console.log('\n');
  return { results, elapsedMs: Date.now() - checkpoint.startTime };
}

// ============================================================================
// ANALYSIS
// ============================================================================

function analyzeResults(results, elapsedMs) {
  const correct = results.filter(r => r.correct).length;
  const parseFailures = results.filter(r => r.choice === null).length;
  const accuracy = (correct / results.length * 100).toFixed(1);
  const elapsed = (elapsedMs / 1000).toFixed(1);

  console.log('📊 ARC-CHALLENGE RESULTS (Gemini 3.1 Flash Lite)');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`  Questions:     ${results.length}`);
  console.log(`  Correct:       ${correct}/${results.length}`);
  console.log(`  Accuracy:      ${accuracy}%`);
  console.log(`  Parse Failures: ${parseFailures}`);
  console.log(`  Time:          ${elapsed}s (${(elapsedMs / results.length / 1000).toFixed(2)}s/q)\n`);

  // Phase 1 comparison
  console.log('📈 COMPARISON WITH PHASE 1 (MMLU-Pro)');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`  MMLU-Pro:       93.4% (500Q, text knowledge)`);
  console.log(`  ARC-Challenge:  ${accuracy}% (${results.length}Q, science reasoning)`);
  const delta = (parseFloat(accuracy) - 93.4).toFixed(1);
  if (parseFloat(accuracy) > 93.4) {
    console.log(`  Delta:          +${delta}pp (Flash Lite stronger on science reasoning)`);
  } else if (parseFloat(accuracy) === 93.4) {
    console.log(`  Delta:          0pp (consistent across domains)`);
  } else {
    console.log(`  Delta:          ${delta}pp (MMLU edge vs science reasoning)`);
  }

  // Save results
  const timestamp = Date.now();
  const filename = `docs/ARC_CHALLENGE_BENCHMARK_${MODEL}_${timestamp}.json`;
  const output = {
    timestamp: new Date().toISOString(),
    model: MODEL,
    benchmark: 'ARC-Challenge',
    sampleSize: results.length,
    accuracy: parseFloat(accuracy),
    correct,
    parseFailures,
    elapsedSeconds: parseFloat(elapsed),
    phase1Comparison: { mmluAccuracy: 93.4, arcAccuracy: parseFloat(accuracy), delta: parseFloat(delta) },
    results,
  };
  fs.writeFileSync(filename, JSON.stringify(output, null, 2));
  console.log(`\n  Saved: ${filename}`);

  return filename;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n🚀 ARC-Challenge Benchmark — Gemini 3.1 Flash Lite');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`  Questions: ${SAMPLE_SIZE} (of 1168 total in test set)`);
  console.log(`  Model: ${MODEL}`);
  console.log(`  Phase: Phase 2 cross-domain validation\n`);

  try {
    const { results, elapsedMs } = await runBenchmark();
    analyzeResults(results, elapsedMs);

    if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
    console.log('\n✅ Benchmark complete!\n');
  } catch (err) {
    console.error('\n❌ Benchmark failed:', err.message);
    process.exit(1);
  }
}

main();
