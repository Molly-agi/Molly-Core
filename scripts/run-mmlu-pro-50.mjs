#!/usr/bin/env node

/**
 * MMLU-Pro 50-Question Benchmark: Gemini 3.1 Pro Preview
 * Purpose: Compare Pro quality against Phase 1 Flash Lite baseline (93.4%)
 * Dataset: First 50 questions from MMLU-Pro 500-question set
 * Runtime: ~90 seconds
 * 
 * This reuses the proven 5-tier parser from Phase 1
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

const MODEL = 'gemini-3.1-pro-preview';
const SAMPLE_SIZE = 50;
const CHECKPOINT_INTERVAL = 10;
const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// ============================================================================
// DATA LOADING
// ============================================================================

function loadDataset() {
  const filePath = path.join(__dirname, '..', 'mmlu_sample_500.json');
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Dataset not found: ${filePath}`);
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log(`✅ Loaded ${data.length} questions from dataset`);
  
  // Take only first 50
  return data.slice(0, SAMPLE_SIZE);
}

// ============================================================================
// PARSER: 5-Tier Fallback Strategy (Proven from Phase 1)
// ============================================================================

function extractAnswer(text) {
  if (!text || typeof text !== 'string') return null;

  // Tier 1: Explicit "The answer is X" pattern
  const tier1 = text.match(/[Tt]he\s+(?:correct\s+)?answer\s+is\s+([A-D])/i);
  if (tier1?.[1]) return tier1[1].toUpperCase();

  // Tier 2: Bold or emphasized answer (e.g., **A**, *B*)
  const tier2 = text.match(/(?:\*\*|__|\*)([A-D])(?:\*\*|__|\*)/);
  if (tier2?.[1]) return tier2[1].toUpperCase();

  // Tier 3: Answer followed by colon (e.g., "Answer: A")
  const tier3 = text.match(/Answer\s*:\s*([A-D])/i);
  if (tier3?.[1]) return tier3[1].toUpperCase();

  // Tier 4: Single letter at the end (e.g., text ends with "A")
  const tier4 = text.match(/([A-D])\s*\.?\s*$/);
  if (tier4?.[1]) return tier4[1].toUpperCase();

  // Tier 5: First valid letter found (last resort)
  const tier5 = text.match(/[A-D]/);
  if (tier5?.[0]) return tier5[0].toUpperCase();

  return null;
}

// ============================================================================
// API CALL
// ============================================================================

async function queryModel(question) {
  const prompt = `You are answering a multiple-choice question. Think step-by-step and provide your reasoning, then give the answer.

Question: ${question.question}

A) ${question.options[0]}
B) ${question.options[1]}
C) ${question.options[2]}
D) ${question.options[3]}

Please think through this carefully and state which answer is correct. The answer is one of: A, B, C, or D.`;

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text;
  } catch (error) {
    console.error(`❌ API Error for question: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// CHECKPOINT SYSTEM
// ============================================================================

const CHECKPOINT_FILE = `docs/MMLU_PRO_50_CHECKPOINT_${MODEL}.json`;

function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    const checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
    console.log(`✅ Resuming from checkpoint: ${checkpoint.completed}/${SAMPLE_SIZE} completed`);
    return checkpoint;
  }
  return { completed: 0, results: [], startTime: Date.now() };
}

function saveCheckpoint(checkpoint) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

async function runBenchmark() {
  const questions = loadDataset();
  let checkpoint = loadCheckpoint();
  const results = checkpoint.results;

  // Run remaining questions
  for (let i = checkpoint.completed; i < SAMPLE_SIZE; i++) {
    const question = questions[i];
    process.stdout.write(`\r[${i + 1}/${SAMPLE_SIZE}] Processing...`);

    try {
      const response = await queryModel(question);
      const answer = extractAnswer(response);
      const correct = answer === question.correctAnswer;

      results.push({
        index: i,
        question: question.question.substring(0, 100),
        choice: answer,
        correct,
        reasoning: response.substring(0, 500),
      });

      checkpoint.completed = i + 1;

      // Save checkpoint every CHECKPOINT_INTERVAL questions
      if ((i + 1) % CHECKPOINT_INTERVAL === 0) {
        saveCheckpoint(checkpoint);
        console.log(`\n   💾 Checkpoint saved at ${i + 1} questions`);
      }
    } catch (error) {
      console.error(`\n❌ Failed at question ${i + 1}`);
      throw error;
    }
  }

  console.log('\n');
  return results;
}

// ============================================================================
// RESULTS ANALYSIS
// ============================================================================

function analyzeResults(results) {
  const correct = results.filter(r => r.correct).length;
  const accuracy = (correct / results.length) * 100;

  console.log('📊 RESULTS');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`  Questions: ${results.length}`);
  console.log(`  Correct: ${correct}/${results.length}`);
  console.log(`  Accuracy: ${accuracy.toFixed(1)}%\n`);

  // Save detailed results
  const timestamp = Date.now();
  const filename = `docs/MMLU_BENCHMARK_${MODEL.replace(/\./g, '_')}_${timestamp}.json`;
  
  const output = {
    timestamp: new Date().toISOString(),
    model: MODEL,
    sampleSize: results.length,
    accuracy,
    correct,
    subset: 'first_50_of_phase1',
    bySubject: {},
    results,
  };

  fs.writeFileSync(filename, JSON.stringify(output, null, 2));
  console.log(`  Saved to: ${filename}\n`);

  return { filename, accuracy, correct };
}

// ============================================================================
// COMPARISON
// ============================================================================

function compareWithPhase1(proResult) {
  // Phase 1: Flash Lite on 500 questions = 93.4%
  const flashAccuracy = 93.4;
  const flashCost = 0.043;
  const proCost = 0.16; // 50 questions

  console.log('📈 COMPARISON: Pro vs Flash Lite');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`  Pro accuracy (50 Q):    ${proResult.accuracy.toFixed(1)}%`);
  console.log(`  Flash accuracy (500 Q): ${flashAccuracy.toFixed(1)}%`);
  console.log(`  Delta:                  ${(proResult.accuracy - flashAccuracy).toFixed(1)} percentage points\n`);
  console.log(`  Cost comparison:`);
  console.log(`    Flash Lite: $${flashCost.toFixed(3)} for 500 questions`);
  console.log(`    Pro:        $${proCost.toFixed(3)} for 50 questions`);
  console.log(`    Ratio:      Pro is ~${(proCost / flashCost / 10).toFixed(1)}x more expensive per question\n`);

  if (proResult.accuracy > flashAccuracy) {
    console.log(`  ✅ Pro performs better than Flash on this subset (+${(proResult.accuracy - flashAccuracy).toFixed(1)}%)`);
  } else if (proResult.accuracy === flashAccuracy) {
    console.log(`  ➖ Pro matches Flash performance on this subset`);
  } else {
    console.log(`  ⚠️  Flash outperforms Pro on this subset (${(flashAccuracy - proResult.accuracy).toFixed(1)}% better)`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  try {
    console.log('\n🚀 Starting MMLU-Pro 50-Question Benchmark (Gemini 3.1 Pro Preview)');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const results = await runBenchmark();
    const analysis = analyzeResults(results);
    compareWithPhase1(analysis);

    // Clean up checkpoint after success
    if (fs.existsSync(CHECKPOINT_FILE)) {
      fs.unlinkSync(CHECKPOINT_FILE);
    }

    console.log('\n✅ Benchmark complete!');
  } catch (error) {
    console.error('\n❌ Benchmark failed:', error.message);
    process.exit(1);
  }
}

main();
