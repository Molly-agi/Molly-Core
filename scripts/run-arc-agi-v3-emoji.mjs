#!/usr/bin/env node
/**
 * ARC-AGI v3 - Emoji grids + fixed parser + 2048 tokens
 * Isolation test: does emoji representation affect accuracy vs v2 (numbers)?
 * Everything identical to v2 EXCEPT renderGrid uses emojis.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1]])
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}
loadEnv();

const API_KEY = process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY;
if (!API_KEY) { console.error('❌ GOOGLE_GENAI_API_KEY not found'); process.exit(1); }

const MODEL = 'gemini-3.1-flash-lite-preview';
const SAMPLE_SIZE = 50;
const VERSION = 'v3-emoji';
const DATA_DIR = path.join(PROJECT_ROOT, 'data', 'arc-agi');

// Emoji color map (same as v1)
const EMOJI = { 0:'⬛',1:'🟦',2:'🟥',3:'🟫',4:'🟩',5:'🟪',6:'🟨',7:'🟧',8:'⬜',9:'🔳' };

// Render grid as emoji
function renderGrid(grid) {
  return grid.map(row => row.map(v => EMOJI[v] ?? `[${v}]`).join('')).join('\n');
}

// Also render as numbers for the ANSWER section so parser can read it
function renderGridNumbers(grid) {
  return grid.map(row => row.join(' ')).join('\n');
}

function formatTaskForGemini(task) {
  const trainExamples = task.train.map((ex, i) => {
    const inputDims = `${ex.input.length}x${ex.input[0].length}`;
    const outputDims = `${ex.output.length}x${ex.output[0].length}`;
    return `Example ${i + 1} (input ${inputDims} → output ${outputDims}):
INPUT:
${renderGrid(ex.input)}

OUTPUT:
${renderGrid(ex.output)}`;
  }).join('\n\n');

  const testDims = `${task.test[0].input.length}x${task.test[0].input[0].length}`;

  return `You are solving ARC (Abstraction and Reasoning Corpus) puzzles. Each puzzle shows input/output grid pairs using colored squares. Find the transformation rule and apply it to the test input.

${trainExamples}

TEST INPUT (${testDims}):
${renderGrid(task.test[0].input)}

Step 1: Describe the transformation rule you observe.
Step 2: Apply that rule to the test input.
Step 3: Output the result grid.

Your answer MUST end with the output grid as space-separated numbers (0-9) in this exact format:
ANSWER:
[row of space-separated numbers]
[row of space-separated numbers]
...`;
}

// Multi-tier parser (same as v2)
function parseGridFromResponse(response) {
  const answerMatch = response.match(/ANSWER:\s*\n([\s\S]+?)(?:\n\n|$)/);
  if (answerMatch) {
    const grid = parseNumberRows(answerMatch[1]);
    if (grid) return grid;
  }
  const lines = response.trim().split('\n');
  const numberLines = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const cleaned = lines[i].replace(/[\[\],]/g, '').trim();
    if (/^[\d\s]+$/.test(cleaned) && cleaned.length > 0) {
      numberLines.unshift(cleaned);
    } else if (numberLines.length > 0) break;
  }
  if (numberLines.length > 0) {
    const grid = parseNumberRows(numberLines.join('\n'));
    if (grid) return grid;
  }
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
    if (nums?.length > 0) rows.push(nums.map(n => parseInt(n, 10)));
  }
  return rows.length > 0 ? rows : null;
}

function gridsEqual(g1, g2) {
  if (!g1 || !g2 || g1.length !== g2.length) return false;
  return g1.every((row, i) => row.length === g2[i].length && row.every((v, j) => v === g2[i][j]));
}

async function callGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.0, topP: 0.95, maxOutputTokens: 2048 }
      })
    }
  );
  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message); }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function loadSample() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const sample = [];
  const step = Math.floor(files.length / SAMPLE_SIZE);
  for (let i = 0; i < SAMPLE_SIZE && i * step < files.length; i++) {
    const file = files[i * step];
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
    sample.push({ id: file.replace('.json', ''), ...data });
  }
  return sample;
}

async function runBenchmark() {
  console.log(`🎨 ARC-AGI ${VERSION} — Emoji grids, fixed parser`);
  console.log(`Model: ${MODEL} | Tasks: ${SAMPLE_SIZE}\n`);

  const tasks = loadSample();
  const results = { timestamp: Date.now(), model: MODEL, version: VERSION, sampleSize: SAMPLE_SIZE, tasks: [] };
  let correct = 0, parseFailures = 0;
  const startTime = Date.now();

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    try {
      process.stdout.write(`\r[${i + 1}/${SAMPLE_SIZE}] Evaluating...`);
      const prompt = formatTaskForGemini(task);
      const response = await callGemini(prompt);
      const predicted = parseGridFromResponse(response);
      const expected = task.test[0].output;
      const isCorrect = gridsEqual(predicted, expected);
      if (isCorrect) correct++;
      if (!predicted) parseFailures++;
      results.tasks.push({ id: task.id, correct: isCorrect, parseSuccess: predicted !== null });

      if ((i + 1) % 10 === 0) {
        fs.writeFileSync(
          path.join(PROJECT_ROOT, 'docs', `ARC_AGI_${VERSION}_CHECKPOINT.json`),
          JSON.stringify(results, null, 2)
        );
        process.stdout.write(' ✓');
      }
    } catch (e) {
      console.error(`\n❌ Task ${i + 1}: ${e.message}`);
      results.tasks.push({ id: task.id, correct: false, parseSuccess: false, error: e.message });
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const accuracy = (correct / SAMPLE_SIZE * 100).toFixed(1);
  Object.assign(results, { correct, parseFailures, accuracy: parseFloat(accuracy), elapsedSeconds: parseFloat(elapsed) });

  console.log(`\n\n📊 v3-emoji Results`);
  console.log(`Accuracy: ${accuracy}% (${correct}/${SAMPLE_SIZE})`);
  console.log(`Parse failures: ${parseFailures}`);
  console.log(`Time: ${elapsed}s`);

  const outPath = path.join(PROJECT_ROOT, 'docs', `ARC_AGI_${VERSION}_${MODEL.replace(/[^a-z0-9]/g,'_')}_${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`✓ Saved to ${path.relative(PROJECT_ROOT, outPath)}`);
}

runBenchmark().catch(console.error);
