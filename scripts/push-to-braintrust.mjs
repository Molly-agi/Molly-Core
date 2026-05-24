#!/usr/bin/env node
/**
 * Push MMLU-Pro Benchmark Results to Braintrust
 *
 * Loads the completed 500-question benchmark results and logs them as a
 * Braintrust experiment so they appear in the dashboard alongside other models.
 *
 * Usage: node scripts/push-to-braintrust.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = path.resolve(__dirname, '../.env.local');
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
}

const { Eval } = await import('braintrust');

const RESULTS_FILE = path.resolve(
  __dirname,
  '../docs/MMLU_BENCHMARK_gemini_3_1_flash_lite_preview_1779631300858.json'
);

const colors = {
  reset: '\x1b[0m', green: '\x1b[32m', cyan: '\x1b[36m',
  blue: '\x1b[34m', bold: '\x1b[1m', yellow: '\x1b[33m',
};
const c = (col, ...a) => console.log(col, ...a, colors.reset);

async function main() {
  console.log('\n' + colors.bold + colors.cyan +
    '══════════════════════════════════════════' + colors.reset);
  c(colors.bold + colors.cyan, '   PUSH TO BRAINTRUST — MMLU-Pro Results');
  console.log(colors.bold + colors.cyan +
    '══════════════════════════════════════════' + colors.reset + '\n');

  // Load results
  c(colors.blue, '📂 Loading benchmark results...');
  const data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
  c(colors.green, `✓ ${data.sampleSize} questions, ${data.accuracy}% accuracy\n`);

  c(colors.blue, `📤 Pushing to Braintrust project: molly-agi-benchmarks`);
  c(colors.blue, `   Experiment: molly-mmlu-pro-gemini-3.1-flash-lite\n`);

  // Build dataset entries from results
  const dataset = data.questions
    .filter(q => q.expected !== undefined && q.expected !== -1)
    .map(q => ({
      input: { id: q.id, subject: q.subject },
      expected: q.expected,
    }));

  // Build scores map
  const scoreMap = {};
  for (const q of data.questions) {
    scoreMap[q.id] = {
      correct: q.correct,
      predicted: q.predicted,
      expected: q.expected,
      subject: q.subject,
    };
  }

  // Run Braintrust Eval
  await Eval('molly-agi-benchmarks', {
    experimentName: `molly-mmlu-pro-gemini-3.1-flash-lite-${new Date().toISOString().slice(0,10)}`,
    description: `MMLU-Pro 500-question benchmark. Model: ${data.model}. Accuracy: ${data.accuracy}%. Date: ${data.timestamp}`,
    data: () => dataset,
    task: async (input) => {
      // Results already computed — just look them up
      const result = scoreMap[input.id];
      return result?.predicted ?? -1;
    },
    scores: [
      ({ output, expected }) => ({
        name: 'accuracy',
        score: output === expected ? 1 : 0,
      }),
    ],
    metadata: {
      model: data.model,
      accuracy: data.accuracy,
      sampleSize: data.sampleSize,
      parseFailures: data.parseFailures,
      elapsedSeconds: data.elapsedSeconds,
      timestamp: data.timestamp,
      industryComparison: data.industryComparison,
    },
  });

  console.log();
  c(colors.green, '✅ Results pushed to Braintrust successfully.');
  c(colors.cyan, '   View at: https://www.braintrust.dev/app/');
  console.log();
}

main().catch(e => {
  console.error('❌', e.message);
  if (e.message.includes('401') || e.message.includes('403')) {
    console.error('   Check BRAINTRUST_API_KEY in .env.local');
  }
  process.exit(1);
});
