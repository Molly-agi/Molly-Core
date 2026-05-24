#!/usr/bin/env node
/**
 * Molly AGI — MMLU-Pro Benchmark (Real Model)
 *
 * Runs a sample of MMLU-Pro questions against Molly's underlying Gemini model
 * via direct REST API call. Measures accuracy and compares to published baselines.
 *
 * Usage:
 *   node scripts/run-mmlu-benchmark.mjs              # 50 questions
 *   node scripts/run-mmlu-benchmark.mjs --sample=100 # 100 questions
 *   node scripts/run-mmlu-benchmark.mjs --model=gemini-2.5-pro  # pro model
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

const API_KEY = process.env.GOOGLE_GENAI_API_KEY;
if (!API_KEY) { console.error('❌ GOOGLE_GENAI_API_KEY not found'); process.exit(1); }

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const sampleArg = args.find(a => a.startsWith('--sample='));
const modelArg  = args.find(a => a.startsWith('--model='));
const SAMPLE_SIZE = sampleArg ? parseInt(sampleArg.split('=')[1]) : 50;
const MODEL = modelArg ? modelArg.split('=')[1] : 'gemini-3.1-flash-lite-preview';

// ── Industry baselines (published numbers) ─────────────────────────────────
const INDUSTRY_BASELINES = {
  'Random (4-choice)':   25.0,
  'Random (10-choice)':  10.0,
  'GPT-4o':              74.4,
  'Claude Opus 4':       86.8,
  'Claude Sonnet 4.5':   80.2,
  'Gemini 2.5 Pro':      86.3,
  'Gemini 2.5 Flash':    78.5,
  'Gemini 3.1 Pro':       null, // Not yet published
};

const colors = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  blue: '\x1b[34m', cyan: '\x1b[36m', yellow: '\x1b[33m',
  bold: '\x1b[1m', dim: '\x1b[2m',
};
const c = (color, ...a) => console.log(color, ...a, colors.reset);

// ── Load MMLU-Pro dataset ─────────────────────────────────────────────────────
function loadDataset() {
  const dataPath = path.resolve(__dirname, '../mmlu_sample_500.json');
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  // Handle both array and object formats
  return Array.isArray(raw) ? raw : Object.values(raw);
}

function sampleQuestions(questions, n) {
  const shuffled = [...questions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, questions.length));
}

// ── Format prompt for Molly/Gemini ───────────────────────────────────────────
function formatPrompt(q) {
  const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const options = q.options.map((opt, i) => `${optionLetters[i]}. ${opt}`).join('\n');

  return `Answer this multiple-choice question. After your reasoning, end your response with exactly: "The answer is X" where X is the letter.

Subject: ${q.subject}
Question: ${q.question}

Options:
${options}`;
}

// ── Parse model answer ────────────────────────────────────────────────────────
function parseAnswer(text, numOptions) {
  if (!text) return -1;
  const t = text.toUpperCase();

  // 1. "The answer is X" (our requested format)
  let m = t.match(/THE ANSWER IS\s*[:\s]?([A-J])/);
  if (m) { const i = m[1].charCodeAt(0)-65; return i < numOptions ? i : -1; }

  // 2. "Answer: X" or "Answer is X"
  m = t.match(/ANSWER[:\s]+(?:IS\s+)?([A-J])[^A-Z]/);
  if (m) { const i = m[1].charCodeAt(0)-65; return i < numOptions ? i : -1; }

  // 3. "(X)" at end of text
  m = t.match(/\(([A-J])\)\s*$/);
  if (m) { const i = m[1].charCodeAt(0)-65; return i < numOptions ? i : -1; }

  // 4. Bare letter at very start
  m = t.trim().match(/^([A-J])[).\s]/);
  if (m) { const i = m[1].charCodeAt(0)-65; return i < numOptions ? i : -1; }

  // 5. Last standalone letter in response
  const all = [...t.matchAll(/(?:^|\s)([A-J])(?:\s|$|[).:])/g)];
  if (all.length > 0) { const i = all[all.length-1][1].charCodeAt(0)-65; return i < numOptions ? i : -1; }

  return -1;
}

// ── Normalize correct answer to index ────────────────────────────────────────
function normalizeCorrectAnswer(q) {
  const { correctAnswer, answer } = q;
  const val = correctAnswer ?? answer;
  if (val == null) return -1;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const letter = val.trim().toUpperCase();
    if (/^[A-J]$/.test(letter)) return letter.charCodeAt(0) - 65;
    const num = parseInt(val);
    if (!isNaN(num)) return num;
  }
  return -1;
}

// ── Call Gemini REST API ──────────────────────────────────────────────────────
async function askGemini(prompt, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.0,    // Deterministic for benchmarking
              maxOutputTokens: 4096, // Allow full reasoning chains
            },
          }),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        if (res.status === 429 && attempt < retries) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        throw new Error(`API ${res.status}: ${err.slice(0, 200)}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return text;
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + colors.bold + colors.cyan +
    '═══════════════════════════════════════════════════════' + colors.reset);
  c(colors.bold + colors.cyan, '   MOLLY AGI — MMLU-Pro BENCHMARK');
  console.log(colors.bold + colors.cyan +
    '═══════════════════════════════════════════════════════' + colors.reset + '\n');

  c(colors.blue, `Model:   ${MODEL}`);
  c(colors.blue, `Sample:  ${SAMPLE_SIZE} questions`);
  c(colors.blue, `Dataset: MMLU-Pro (500-question subset)`);
  console.log();

  // Load and sample
  c(colors.blue, '📥 Loading MMLU-Pro dataset...');
  const all = loadDataset();
  const questions = sampleQuestions(all, SAMPLE_SIZE);
  c(colors.green, `✓ Sampled ${questions.length} questions from ${all.length} total\n`);

  // Subjects breakdown
  const subjects = {};
  for (const q of questions) subjects[q.subject] = (subjects[q.subject] || 0) + 1;
  const subjectList = Object.entries(subjects).sort((a,b) => b[1]-a[1]).slice(0,5)
    .map(([s,n]) => `${s}(${n})`).join(', ');
  c(colors.dim, `  Top subjects: ${subjectList}\n`);

  // Run evaluation
  c(colors.blue, `🧪 Running evaluation against ${MODEL}...`);
  c(colors.dim, '  (temperature=0 for reproducibility)\n');

  // ── Checkpoint — auto-resume if interrupted ──────────────────────────────
  const checkpointPath = path.resolve(__dirname, `../docs/mmlu_checkpoint_${MODEL.replace(/\W/g,'_')}.json`);
  let results = [];
  let correct = 0;
  if (fs.existsSync(checkpointPath)) {
    try {
      results = JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));
      correct = results.filter(r => r.correct).length;
      c(colors.yellow, `  ⚡ Resuming from checkpoint: ${results.length} already done (${correct} correct)`);
    } catch { results = []; }
  }
  const doneIds = new Set(results.map(r => r.id));
  const remaining = questions.filter(q => !doneIds.has(q.id));
  if (doneIds.size > 0) c(colors.dim, `  Skipping ${doneIds.size} completed, running ${remaining.length} remaining\n`);

  const bySubject = {};
  for (const r of results) {
    if (!bySubject[r.subject]) bySubject[r.subject] = { correct: 0, total: 0 };
    bySubject[r.subject].total++;
    if (r.correct) bySubject[r.subject].correct++;
  }

  let parseFailures = results.filter(r => r.predicted === -1).length;
  const startTime = Date.now();

  for (let i = 0; i < remaining.length; i++) {
    const q = remaining[i];
    const prompt = formatPrompt(q);
    const correctIdx = normalizeCorrectAnswer(q);

    try {
      const rawAnswer = await askGemini(prompt);
      const predictedIdx = parseAnswer(rawAnswer, q.options.length);
      const isCorrect = predictedIdx === correctIdx && correctIdx !== -1;

      if (predictedIdx === -1) parseFailures++;
      if (isCorrect) correct++;

      results.push({
        id: q.id,
        subject: q.subject,
        correct: isCorrect,
        predicted: predictedIdx,
        expected: correctIdx,
        rawAnswer: rawAnswer?.trim(),
      });

      if (!bySubject[q.subject]) bySubject[q.subject] = { correct: 0, total: 0 };
      bySubject[q.subject].total++;
      if (isCorrect) bySubject[q.subject].correct++;

      const total = results.length;
      const pct = ((correct / total) * 100).toFixed(1);
      const mark = isCorrect ? colors.green + '✓' : colors.red + '✗';
      process.stdout.write(`\r  ${mark}${colors.reset} ${total}/${questions.length} — Running accuracy: ${pct}%   `);
    } catch (e) {
      c(colors.red, `\n  ❌ Error on ${q.id}: ${e.message}`);
      results.push({ id: q.id, subject: q.subject, correct: false, predicted: -1, error: e.message });
    }

    // Save checkpoint every 10 questions
    if (results.length % 10 === 0) {
      fs.writeFileSync(checkpointPath, JSON.stringify(results, null, 2));
    }

    // Throttle — avoid rate limiting
    if (i < remaining.length - 1) await new Promise(r => setTimeout(r, 200));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n');

  // Save final checkpoint (full)
  fs.writeFileSync(checkpointPath, JSON.stringify(results, null, 2));

  // ── Results ─────────────────────────────────────────────────────────────────
  const total = results.length;
  const accuracy = (correct / total * 100).toFixed(2);

  console.log(colors.bold + '── RESULTS ─────────────────────────────────────────────' + colors.reset);
  console.log(`  Questions:      ${total}`);
  console.log(`  Correct:        ${correct}`);
  console.log(`  Accuracy:       ${colors.bold}${accuracy}%${colors.reset}`);
  console.log(`  Parse failures: ${parseFailures}`);
  console.log(`  Time:           ${elapsed}s`);
  console.log();

  // ── By subject (top 5) ───────────────────────────────────────────────────────
  console.log(colors.bold + '── BY SUBJECT ──────────────────────────────────────────' + colors.reset);
  const subjectRows = Object.entries(bySubject)
    .map(([s, d]) => ({ subject: s, acc: d.correct / d.total, total: d.total }))
    .sort((a, b) => b.acc - a.acc);
  for (const row of subjectRows.slice(0, 8)) {
    const bar = '█'.repeat(Math.round(row.acc * 20));
    const pct = (row.acc * 100).toFixed(0).padStart(3);
    console.log(`  ${row.subject.padEnd(25)} ${pct}% ${colors.dim}${bar}${colors.reset} (n=${row.total})`);
  }
  console.log();

  // ── Industry comparison ───────────────────────────────────────────────────────
  console.log(colors.bold + '── INDUSTRY COMPARISON (MMLU-Pro) ─────────────────────' + colors.reset);
  const mollyAcc = parseFloat(accuracy);
  const allModels = [
    ...Object.entries(INDUSTRY_BASELINES).filter(([,v]) => v !== null),
    [`Molly (${MODEL})`, mollyAcc],
  ].sort((a, b) => b[1] - a[1]);

  for (const [name, acc] of allModels) {
    const isMolly = name.startsWith('Molly');
    const bar = '█'.repeat(Math.round(acc / 100 * 30));
    const marker = isMolly ? colors.cyan + colors.bold + ' ◄ MOLLY' + colors.reset : '';
    const col = isMolly ? colors.cyan + colors.bold : (acc > mollyAcc ? colors.dim : colors.green);
    console.log(`  ${col}${name.padEnd(28)}${(acc).toFixed(1).padStart(5)}%  ${colors.dim}${bar}${colors.reset}${marker}`);
  }
  console.log();

  // ── Save results ──────────────────────────────────────────────────────────────
  const output = {
    timestamp: new Date().toISOString(),
    model: MODEL,
    sampleSize: total,
    accuracy: parseFloat(accuracy),
    correct,
    parseFailures,
    elapsedSeconds: parseFloat(elapsed),
    bySubject: subjectRows,
    industryComparison: Object.fromEntries(
      allModels.map(([name, acc]) => [name, acc])
    ),
    questions: results,
  };

  const outFile = `docs/MMLU_BENCHMARK_${MODEL.replace(/\W/g, '_')}_${Date.now()}.json`;
  const outPath = path.resolve(__dirname, '..', outFile);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  c(colors.cyan, `💾 Results saved: ${outFile}`);
  console.log();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
