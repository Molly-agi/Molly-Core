#!/usr/bin/env node

/**
 * ARC-AGI Program Synthesis Benchmark
 *
 * Instead of asking Gemini to guess the output directly,
 * Molly writes a Python function that implements the transformation rule,
 * verifies it against ALL training examples, then applies it to the test input.
 *
 * Baseline (v2, direct answer): 20% on 50 tasks
 * This run: program synthesis + verification
 *
 * Same 50 tasks as baseline for direct comparison.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

// ── Env ──────────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
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

// ── Config ───────────────────────────────────────────────────────────────────

const MODEL = 'gemini-2.5-flash';
const SAMPLE_SIZE = Number(process.env.ARC_SAMPLE_SIZE || process.argv[2] || 50);
const MAX_ATTEMPTS = 3;
const DATA_DIR = path.join(PROJECT_ROOT, 'data', 'arc-agi');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'docs', 'arc-agi-program-synthesis-results.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderGrid(grid) {
  return grid.map(row => row.join(' ')).join('\n');
}

function gridsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((row, i) =>
    Array.isArray(b[i]) && row.length === b[i].length && row.every((v, j) => v === b[i][j])
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Gemini API ────────────────────────────────────────────────────────────────

async function callGemini(prompt, attempt = 0) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
    },
  });

  for (let retry = 0; retry <= 3; retry++) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (resp.status === 429) {
        const wait = (retry + 1) * 5000;
        console.log(`    ⏳ Rate limited, waiting ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${err.slice(0, 200)}`);
      }

      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return text;
    } catch (e) {
      if (retry === 3) throw e;
      await sleep(2000 * (retry + 1));
    }
  }
  return '';
}

// ── Code Extraction ───────────────────────────────────────────────────────────

function extractTransformFunction(source) {
  const start = source.search(/def\s+transform\s*\(/);
  if (start < 0) return null;

  const tail = source.slice(start).replace(/\r/g, '');
  const lines = tail.split('\n');
  if (lines.length === 0) return null;

  const kept = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      kept.push(line);
      continue;
    }
    // Keep only the indented function body; stop when top-level text/code resumes.
    if (/^\s+/.test(line)) {
      kept.push(line);
      continue;
    }
    break;
  }

  const code = kept.join('\n').trim();
  return code.length > 0 ? code : null;
}

function extractPythonCode(text) {
  const blocks = Array.from(text.matchAll(/```(?:python)?\s*([\s\S]*?)```/gi))
    .map(m => m[1].trim())
    .filter(Boolean);

  for (const block of blocks) {
    const fn = extractTransformFunction(block);
    if (fn) return fn;
  }

  return extractTransformFunction(text);
}

// ── Python Execution ──────────────────────────────────────────────────────────

function runPythonCode(code, inputGrid) {
  const harness = `
import json, sys, traceback

${code}

try:
    test_input = ${JSON.stringify(inputGrid)}
    result = transform(test_input)
    # Ensure result is list of lists of ints
    if hasattr(result, 'tolist'):
        result = result.tolist()
    result = [[int(v) for v in row] for row in result]
    print(json.dumps({"ok": True, "output": result}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e), "trace": traceback.format_exc()}))
`;

  const tmpFile = path.join(os.tmpdir(), `arc_synth_${Date.now()}.py`);
  try {
    fs.writeFileSync(tmpFile, harness);
    const out = execSync(`python3 "${tmpFile}"`, { timeout: 10000, encoding: 'utf-8' });
    const lines = out.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    return JSON.parse(lastLine);
  } catch (e) {
    return { ok: false, error: e.message?.slice(0, 300) };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

// ── Verification ──────────────────────────────────────────────────────────────

function verifyCode(code, examples) {
  const errors = [];
  for (let i = 0; i < examples.length; i++) {
    const { input, output: expected } = examples[i];
    const result = runPythonCode(code, input);
    if (!result.ok) {
      errors.push(`Example ${i + 1}: Runtime error — ${result.error}`);
    } else if (!gridsEqual(result.output, expected)) {
      const got = JSON.stringify(result.output);
      const want = JSON.stringify(expected);
      errors.push(`Example ${i + 1}: Wrong output.\n  Got:  ${got.slice(0, 100)}\n  Want: ${want.slice(0, 100)}`);
    }
  }
  return errors;
}

// ── Synthesis Prompt ──────────────────────────────────────────────────────────

function buildPrompt(examples, testInput, previousAttempt) {
  const exText = examples.map((ex, i) => {
    const id = `${ex.input.length}×${ex.input[0]?.length ?? '?'}`;
    const od = `${ex.output.length}×${ex.output[0]?.length ?? '?'}`;
    return `Example ${i + 1} (${id} → ${od}):
INPUT:
${renderGrid(ex.input)}
OUTPUT:
${renderGrid(ex.output)}`;
  }).join('\n\n');

  const tid = `${testInput.length}×${testInput[0]?.length ?? '?'}`;

  const retrySection = previousAttempt ? `
## Previous Attempt Failed

Your previous code:
\`\`\`python
${previousAttempt.code}
\`\`\`

Errors:
${previousAttempt.errors.join('\n')}

Study the errors carefully and write a corrected version.
` : '';

  return `You are solving an ARC-AGI (Abstract Reasoning Corpus) pattern recognition puzzle.
Each puzzle shows examples of an input grid being transformed into an output grid.
Your task is to discover the transformation rule and implement it as Python code.

## Training Examples

${exText}

## Test Input (${tid})

${renderGrid(testInput)}
${retrySection}
## Instructions

1. Study all training examples carefully. Look for patterns in:
   - Color changes (which values transform to which)
   - Shape operations (rotation, reflection, scaling, shifting)
   - Object detection and manipulation
   - Grid size changes
   - Counting and conditional logic

2. State the transformation rule in plain language.

3. Write a Python function with this exact signature:
   def transform(grid: list[list[int]]) -> list[list[int]]:

The function must:
- Take a 2D list of integers as input
- Return a 2D list of integers as output
- Handle the test input correctly based on the rule you discovered
- Work correctly for ALL training examples (this is verified automatically)
- Use only Python standard library (no numpy, no imports needed unless stdlib)

Return ONLY the Python function in a \`\`\`python\`\`\` code block.
Do not include test code or example calls. Just the transform function.`;
}

// ── Per-Task Solver ───────────────────────────────────────────────────────────

async function solveTask(task, taskId) {
  const examples = task.train;
  const testInput = task.test[0].input;
  const expectedOutput = task.test[0].output;

  let lastCode = null;
  let lastErrors = [];
  let attemptsUsed = 0;
  let verified = false;
  let predictedOutput = null;
  let ruleDescription = '(not extracted)';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attemptsUsed = attempt;
    const previousAttempt = attempt > 1 ? { code: lastCode, errors: lastErrors } : null;
    const prompt = buildPrompt(examples, testInput, previousAttempt);

    let responseText;
    try {
      responseText = await callGemini(prompt, attempt);
    } catch (e) {
      return {
        taskId,
        correct: false,
        verified: false,
        attemptsUsed,
        error: `Gemini API error: ${e.message}`,
        predictedOutput: null,
      };
    }

    const code = extractPythonCode(responseText);
    if (!code) {
      lastErrors = ['No Python code block found in response'];
      lastCode = '(no code extracted)';
      continue;
    }

    lastCode = code;

    // Verify against all training examples
    const verifyErrors = verifyCode(code, examples);
    if (verifyErrors.length === 0) {
      verified = true;
      // Apply to test input
      const testResult = runPythonCode(code, testInput);
      if (testResult.ok) {
        predictedOutput = testResult.output;
      } else {
        lastErrors = [`Test execution failed: ${testResult.error}`];
        verified = false;
        continue;
      }
      break;
    } else {
      lastErrors = verifyErrors;
    }
  }

  const correct = predictedOutput ? gridsEqual(predictedOutput, expectedOutput) : false;

  return {
    taskId,
    correct,
    verified,
    attemptsUsed,
    predictedOutput,
    expectedOutput,
    synthesizedCode: lastCode,
    errors: lastErrors.length > 0 ? lastErrors : undefined,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const taskFiles = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .slice(0, SAMPLE_SIZE);

  console.log(`\n🧠 ARC-AGI Program Synthesis Benchmark`);
  console.log(`   Model: ${MODEL}`);
  console.log(`   Tasks: ${taskFiles.length}`);
  console.log(`   Max attempts per task: ${MAX_ATTEMPTS}`);
  console.log(`   Strategy: synthesize Python code → verify → predict\n`);

  const results = [];
  let correct = 0;
  let verified = 0;
  let errors = 0;

  const startTime = Date.now();

  for (let i = 0; i < taskFiles.length; i++) {
    const taskFile = taskFiles[i];
    const taskId = taskFile.replace('.json', '');
    const taskPath = path.join(DATA_DIR, taskFile);
    const task = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));

    process.stdout.write(`[${String(i + 1).padStart(2)}/${taskFiles.length}] ${taskId} ... `);

    const result = await solveTask(task, taskId);
    results.push(result);

    if (result.correct) { correct++; process.stdout.write('✅ correct'); }
    else if (result.verified) { process.stdout.write('🔶 verified (wrong answer)'); }
    else if (result.error) { errors++; process.stdout.write(`❌ error: ${result.error.slice(0, 50)}`); }
    else { process.stdout.write('❌ failed'); }

    console.log(` [attempt ${result.attemptsUsed}/${MAX_ATTEMPTS}]`);

    // Brief pause between tasks to be kind to the API
    if (i < taskFiles.length - 1) await sleep(1000);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const accuracy = ((correct / taskFiles.length) * 100).toFixed(1);
  const verifiedCount = results.filter(r => r.verified).length;

  console.log('\n─────────────────────────────────────────');
  console.log(`✅ Correct:         ${correct}/${taskFiles.length} (${accuracy}%)`);
  console.log(`🔶 Code verified:   ${verifiedCount}/${taskFiles.length} (code passed training, wrong test answer)`);
  console.log(`❌ Errors/failures: ${errors}`);
  console.log(`⏱  Elapsed:         ${elapsed}s`);
  console.log(`📊 Baseline (v2):   20% (direct answer)`);
  console.log(`📊 This run (synth): ${accuracy}%`);
  console.log('─────────────────────────────────────────\n');

  // Save results
  const summary = {
    version: 'program-synthesis-v1',
    model: MODEL,
    date: new Date().toISOString(),
    sampleSize: taskFiles.length,
    maxAttempts: MAX_ATTEMPTS,
    accuracy: parseFloat(accuracy),
    correct,
    verified: verifiedCount,
    errors,
    elapsedSeconds: parseFloat(elapsed),
    baselineAccuracy: 20.0,
    results,
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2));
  console.log(`💾 Results saved to: docs/arc-agi-program-synthesis-results.json`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
