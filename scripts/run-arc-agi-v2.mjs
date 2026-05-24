#!/usr/bin/env node

/**
 * ARC-AGI Phase 2 Baseline Runner (v2 - Improved)
 * Better grid visualization, more flexible parsing, actual reasoning
 * 
 * Dataset: 400 ARC-AGI evaluation tasks (visual reasoning puzzles)
 * Sample: 50 tasks for Phase 2 baseline
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

const MODEL = 'gemini-3.1-flash-lite-preview';
const SAMPLE_SIZE = 50;
const DATA_DIR = path.join(PROJECT_ROOT, 'data', 'arc-agi');

// Render grid as ASCII art (much better than emojis)
function renderGridASCII(grid) {
  const cellWidth = 2;
  const border = '┌' + grid[0].map(() => '─'.repeat(cellWidth)).join('┬') + '┐';
  const bottomBorder = '└' + grid[0].map(() => '─'.repeat(cellWidth)).join('┴') + '┘';
  
  const rows = grid.map((row, i) => {
    const cells = row.map(val => val.toString().padStart(cellWidth, ' '));
    const rowStr = '│' + cells.join('│') + '│';
    const sep = i < grid.length - 1 ? '\n├' + grid[0].map(() => '─'.repeat(cellWidth)).join('┼') + '┤\n' : '';
    return rowStr + sep;
  }).join('');
  
  return border + '\n' + rows + '\n' + bottomBorder;
}

// Format task for Gemini with clear instructions
function formatTaskForGemini(task, taskId) {
  const trainExamples = task.train.map((ex, i) => `
Training Pair ${i + 1}:
INPUT (${ex.input.length}x${ex.input[0].length}):
${renderGridASCII(ex.input)}

OUTPUT (${ex.output.length}x${ex.output[0].length}):
${renderGridASCII(ex.output)}
`).join('\n');

  const testInput = task.test[0].input;
  const testSize = `${testInput.length}x${testInput[0].length}`;
  
  const prompt = `# ARC-AGI Puzzle ${taskId}

You are solving abstract reasoning puzzles. Each puzzle shows input-output pairs during training, and you must predict the output for a test input.

## Training Examples
${trainExamples}

## Your Task
Predict the output for this test input:

TEST INPUT (${testSize}):
${renderGridASCII(testInput)}

## Instructions
1. Analyze the transformation pattern in the training examples
2. Apply that pattern to the test input
3. Provide your answer as a grid of numbers (0-9)

## Answer Format
Provide your predicted output grid as rows of numbers, one row per line:
---
[num1] [num2] [num3] ...
[num4] [num5] [num6] ...
...
---

For example, if the output is a 2x3 grid with the top row being 5,5,5 and bottom row 0,0,0:
---
5 5 5
0 0 0
---

Your answer ONLY. No explanation needed. Just the grid.`;

  return prompt;
}

// Parse output grid - MUCH more flexible
function parseGridFromResponse(response) {
  // Remove markdown code blocks if present
  let cleaned = response.replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, ''));
  
  // Find all lines that look like they contain numbers
  const lines = cleaned.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  const rows = [];
  
  for (const line of lines) {
    // Extract all numbers from the line
    const nums = line.match(/\d+/g);
    if (nums && nums.length > 0) {
      rows.push(nums.map(n => parseInt(n, 10)));
    }
  }

  return rows.length > 0 ? rows : null;
}

// Check if grids match
function gridsEqual(grid1, grid2) {
  if (!grid1 || !grid2) return false;
  if (grid1.length !== grid2.length) return false;
  return grid1.every((row, i) => {
    return row.length === grid2[i]?.length &&
           row.every((val, j) => val === grid2[i][j]);
  });
}

// Call Gemini API
async function callGemini(prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.1,  // Lower temp for more consistent output
          topP: 0.9,
          maxOutputTokens: 512
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`API error: ${error.error?.message}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Load sample of ARC tasks
function loadSample() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
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
  console.log(`🎨 ARC-AGI Phase 2 Baseline (v2 - Improved)`);
  console.log(`Model: ${MODEL}`);
  console.log(`Tasks: ${SAMPLE_SIZE}`);
  console.log(`\nLoading tasks...`);

  const tasks = loadSample();
  console.log(`✓ Loaded ${tasks.length} tasks\n`);

  const results = {
    timestamp: Date.now(),
    model: MODEL,
    version: 'v2-improved',
    sampleSize: SAMPLE_SIZE,
    tasks: []
  };

  let correct = 0;
  let parseFailures = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    
    try {
      process.stdout.write(`\r[${i + 1}/${SAMPLE_SIZE}] Evaluating...`);

      const prompt = formatTaskForGemini(task, task.id);
      const response = await callGemini(prompt);
      
      const predicted = parseGridFromResponse(response);
      const expected = task.test[0].output;
      
      const isCorrect = gridsEqual(predicted, expected);
      if (isCorrect) correct++;

      results.tasks.push({
        id: task.id,
        correct: isCorrect,
        parseSuccess: predicted !== null,
        predictedDims: predicted ? `${predicted.length}x${predicted[0]?.length}` : null,
        expectedDims: `${expected.length}x${expected[0].length}`,
        responseLength: response.length
      });

      if (!predicted) parseFailures++;

      // Checkpoint every 10 tasks
      if ((i + 1) % 10 === 0) {
        const checkpointPath = path.join(
          PROJECT_ROOT,
          'docs',
          `ARC_AGI_V2_CHECKPOINT_${MODEL.replace(/[^a-z0-9]/g, '_')}.json`
        );
        fs.writeFileSync(checkpointPath, JSON.stringify(results, null, 2));
        process.stdout.write(` ✓`);
      }

    } catch (error) {
      console.error(`\n❌ Task ${i + 1} error: ${error.message}`);
      errors++;
      results.tasks.push({
        id: task.id,
        correct: false,
        parseSuccess: false,
        error: error.message
      });
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;
  const accuracy = (correct / SAMPLE_SIZE * 100).toFixed(1);

  results.correct = correct;
  results.parseFailures = parseFailures;
  results.errors = errors;
  results.accuracy = parseFloat(accuracy);
  results.elapsedSeconds = elapsed;

  console.log(`\n\n📊 Results`);
  console.log(`Accuracy: ${accuracy}% (${correct}/${SAMPLE_SIZE})`);
  console.log(`Parse failures: ${parseFailures}`);
  console.log(`API errors: ${errors}`);
  console.log(`Time: ${elapsed.toFixed(1)}s`);

  // Save results
  const resultsPath = path.join(
    PROJECT_ROOT,
    'docs',
    `ARC_AGI_V2_${MODEL.replace(/[^a-z0-9]/g, '_')}_${Date.now()}.json`
  );
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`✓ Saved to ${path.relative(PROJECT_ROOT, resultsPath)}`);

  return results;
}

runBenchmark().catch(console.error);
