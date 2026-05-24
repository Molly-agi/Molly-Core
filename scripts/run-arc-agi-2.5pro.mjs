#!/usr/bin/env node

/**
 * ARC-AGI Phase 2 Baseline Runner
 * Tests visual pattern reasoning with gemini-2.5-pro
 *
 * Dataset: 400 ARC-AGI evaluation tasks (visual reasoning puzzles)
 * Sample: 50 tasks for Phase 2 baseline
 * Output: JSON checkpoint with per-task results
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

// Load env from .env.local
function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  }
}

loadEnv();

const API_KEY = process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY;
if (!API_KEY) {
  console.error('❌ GOOGLE_GENAI_API_KEY not found in .env.local');
  process.exit(1);
}

const MODEL = 'gemini-2.5-pro';
const SAMPLE_SIZE = 50;
const VERSION = "v2-2.5pro"; // clean number grids, multi-tier parser
const DATA_DIR = path.join(PROJECT_ROOT, 'data', 'arc-agi');

// Render grid as clean number grid (no emoji - loses spatial structure)
function renderGrid(grid) {
  return grid.map((row) => row.join(' ')).join('\n');
}

// Format task for Gemini with clean numeric representation
function formatTaskForGemini(task) {
  const trainExamples = task.train
    .map((ex, i) => {
      const inputDims = `${ex.input.length}x${ex.input[0].length}`;
      const outputDims = `${ex.output.length}x${ex.output[0].length}`;
      return `Example ${i + 1} (input ${inputDims} → output ${outputDims}):
INPUT:
${renderGrid(ex.input)}
OUTPUT:
${renderGrid(ex.output)}`;
    })
    .join('\n\n');

  const testDims = `${task.test[0].input.length}x${task.test[0].input[0].length}`;
  const testInput = renderGrid(task.test[0].input);

  const prompt = `You are solving ARC (Abstraction and Reasoning Corpus) puzzles. Each puzzle shows input/output grid pairs. Find the transformation rule and apply it to the test input.

Grids use numbers 0-9. Study ALL examples carefully before answering.

${trainExamples}

TEST INPUT (${testDims}):
${testInput}

Step 1: Describe the transformation rule you observe.
Step 2: Apply that rule to the test input.
Step 3: Output the result grid.

Your answer MUST end with the output grid in this exact format:
ANSWER:
[row of space-separated numbers]
[row of space-separated numbers]
...`;

  return prompt;
}

// Parse output grid from response - multi-tier parser
function parseGridFromResponse(response) {
  // Tier 1: Look for ANSWER: section
  const answerMatch = response.match(/ANSWER:\s*\n([\s\S]+?)(?:\n\n|$)/);
  if (answerMatch) {
    const grid = parseNumberRows(answerMatch[1]);
    if (grid) return grid;
  }

  // Tier 2: Look for last contiguous block of number rows at end of response
  const lines = response.trim().split('\n');
  const numberLines = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const cleaned = lines[i].replace(/[\[\],]/g, '').trim();
    if (/^[\d\s]+$/.test(cleaned) && cleaned.length > 0) {
      numberLines.unshift(cleaned);
    } else if (numberLines.length > 0) {
      break;
    }
  }
  if (numberLines.length > 0) {
    const grid = parseNumberRows(numberLines.join('\n'));
    if (grid) return grid;
  }

  // Tier 3: Find any markdown code block with numbers
  const codeBlockMatch = response.match(/```[\w]*\n([\d\s\n]+)```/);
  if (codeBlockMatch) {
    const grid = parseNumberRows(codeBlockMatch[1]);
    if (grid) return grid;
  }

  return null;
}

function parseNumberRows(text) {
  const rows = [];
  for (const line of text.trim().split('\n')) {
    const cleaned = line.replace(/[\[\],]/g, '').trim();
    if (!cleaned) continue;
    const nums = cleaned.match(/\d+/g);
    if (nums && nums.length > 0) {
      rows.push(nums.map((n) => parseInt(n, 10)));
    }
  }
  return rows.length > 0 ? rows : null;
}

// Check if grids match
function gridsEqual(grid1, grid2) {
  if (!grid1 || !grid2) return false;
  if (grid1.length !== grid2.length) return false;
  return grid1.every((row, i) => {
    return (
      row.length === grid2[i].length &&
      row.every((val, j) => val === grid2[i][j])
    );
  });
}

// Delay helper for rate limiting
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Call Gemini API with retry on empty response
async function callGemini(prompt, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await sleep(5000 * attempt);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.0,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
      }),
    }
  );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`API error: ${error.error?.message}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (text) return text;
    // empty response = rate limited, retry
  }
  return '';
}



// Load sample of ARC tasks
function loadSample() {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  const sample = [];
  const step = Math.floor(files.length / SAMPLE_SIZE);

  for (let i = 0; i < SAMPLE_SIZE && i * step < files.length; i++) {
    const file = files[i * step];
    const filepath = path.join(DATA_DIR, file);
    const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    sample.push({ id: file.replace('.json', ''), ...data });
  }

  return sample;
}

// Main benchmark
async function runBenchmark() {
  console.log(`🎨 ARC-AGI Phase 2 Baseline`);
  console.log(`Model: ${MODEL}`);
  console.log(`Tasks: ${SAMPLE_SIZE}`);
  console.log(`\nLoading tasks...`);

  const tasks = loadSample();
  console.log(`✓ Loaded ${tasks.length} tasks\n`);

  const results = {
    timestamp: Date.now(),
    model: MODEL,
    sampleSize: SAMPLE_SIZE,
    tasks: [],
  };

  let correct = 0;
  let parseFailures = 0;
  const startTime = Date.now();

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];

    try {
      process.stdout.write(`\r[${i + 1}/${SAMPLE_SIZE}] Evaluating...`);

      // 2.5 Pro has lower free-tier rate limits — pace requests
      if (i > 0) await sleep(2000);

      const prompt = formatTaskForGemini(task);
      const response = await callGemini(prompt);

      const predicted = parseGridFromResponse(response);
      const expected = task.test[0].output;

      const isCorrect = gridsEqual(predicted, expected);
      if (isCorrect) correct++;

      results.tasks.push({
        id: task.id,
        correct: isCorrect,
        parseSuccess: predicted !== null,
        responseLength: response.length,
      });

      if (!predicted) parseFailures++;

      // Checkpoint every 10 tasks
      if ((i + 1) % 10 === 0) {
        const checkpointPath = path.join(
          PROJECT_ROOT,
          'docs',
          `ARC_AGI_BASELINE_CHECKPOINT_${MODEL.replace(/[^a-z0-9]/g, '_')}.json`
        );
        fs.writeFileSync(checkpointPath, JSON.stringify(results, null, 2));
        process.stdout.write(` ✓`);
      }
    } catch (error) {
      console.error(`\n❌ Task ${i + 1} failed: ${error.message}`);
      results.tasks.push({
        id: task.id,
        correct: false,
        parseSuccess: false,
        error: error.message,
      });
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;
  const accuracy = ((correct / SAMPLE_SIZE) * 100).toFixed(1);

  results.correct = correct;
  results.parseFailures = parseFailures;
  results.accuracy = parseFloat(accuracy);
  results.elapsedSeconds = elapsed;

  console.log(`\n\n📊 Results`);
  console.log(`Accuracy: ${accuracy}% (${correct}/${SAMPLE_SIZE})`);
  console.log(`Parse failures: ${parseFailures}`);
  console.log(`Time: ${elapsed.toFixed(1)}s`);

  // Save results
  const resultsPath = path.join(
    PROJECT_ROOT,
    'docs',
    `ARC_AGI_BASELINE_${VERSION}_${MODEL.replace(/[^a-z0-9]/g, '_')}_${Date.now()}.json`
  );
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`✓ Saved to ${path.relative(PROJECT_ROOT, resultsPath)}`);

  return results;
}

runBenchmark().catch(console.error);
