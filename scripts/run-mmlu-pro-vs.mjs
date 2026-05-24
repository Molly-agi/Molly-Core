import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';

const apiKey = process.env.GOOGLE_GENAI_API_KEY;
if (!apiKey) {
  console.error('❌ GOOGLE_GENAI_API_KEY not set');
  process.exit(1);
}

const genai = new GoogleGenerativeAI({ apiKey });

// Parser with 5-tier fallback (proven from Phase 1)
function parseAnswer(response) {
  const text = response.toLowerCase();
  
  // Tier 1: Exact "the answer is X"
  let match = text.match(/the answer is\s+([a-d])/i);
  if (match) return match[1].toUpperCase();
  
  // Tier 2: Any "answer is X"
  match = text.match(/answer\s+is\s+([a-d])/i);
  if (match) return match[1].toUpperCase();
  
  // Tier 3: Bare letter
  match = text.match(/([a-d])/i);
  if (match) return match[1].toUpperCase();
  
  // Tier 4: Parenthetical
  match = text.match(/\(([a-d])\)/i);
  if (match) return match[1].toUpperCase();
  
  // Tier 5: Last letter found
  for (let i = text.length - 1; i >= 0; i--) {
    if (/[a-d]/i.test(text[i])) return text[i].toUpperCase();
  }
  
  return null;
}

async function runBenchmark(modelId, label) {
  console.log(`\n🚀 Running MMLU-Pro with ${label}...`);
  console.log(`Model: ${modelId}\n`);
  
  const data = JSON.parse(fs.readFileSync('mmlu_sample_500.json', 'utf-8'));
  const questions = data.slice(0, 500);
  
  const results = [];
  let correct = 0;
  let parseFailures = 0;
  let startTime = Date.now();
  
  const model = genai.getGenerativeModel({
    model: modelId,
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 4096,
    },
  });
  
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const choiceText = q.input.choices.map((c, idx) => `${String.fromCharCode(65 + idx)}) ${c}`).join('\n');
    
    const prompt = `${q.input.question}

${choiceText}

Think through this carefully. After your reasoning, end with exactly: 'The answer is X'`;
    
    try {
      const response = await model.generateContent(prompt);
      const rawAnswer = response.response.text();
      const predicted = parseAnswer(rawAnswer);
      const expected = String.fromCharCode(65 + q.input.expected_index || q.expectedOutput.answerIndex);
      const isCorrect = predicted === expected;
      
      if (!predicted) parseFailures++;
      if (isCorrect) correct++;
      
      results.push({
        id: q.id,
        subject: q.input.subject,
        correct: isCorrect,
        predicted,
        expected,
        rawAnswer,
      });
      
      if ((i + 1) % 50 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  Progress: ${i + 1}/500 (${correct} correct, ${parseFailures} parse failures) [${elapsed}s]`);
      }
    } catch (err) {
      console.error(`  ❌ Q${i + 1} error:`, err.message);
      parseFailures++;
    }
  }
  
  const elapsed = (Date.now() - startTime) / 1000;
  const accuracy = (correct / questions.length * 100).toFixed(1);
  
  console.log(`\n✅ ${label} Complete`);
  console.log(`  Accuracy: ${accuracy}% (${correct}/${questions.length})`);
  console.log(`  Parse failures: ${parseFailures}`);
  console.log(`  Total time: ${elapsed.toFixed(1)}s`);
  
  // Save results
  const filename = `docs/MMLU_BENCHMARK_${modelId.replace(/\./g, '_')}_${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify({
    model: modelId,
    accuracy: parseFloat(accuracy),
    correct,
    total: questions.length,
    parseFailures,
    elapsedSeconds: elapsed,
    timestamp: new Date().toISOString(),
    results,
  }, null, 2));
  
  console.log(`  Results saved: ${filename}\n`);
  
  return {
    model: modelId,
    accuracy: parseFloat(accuracy),
    correct,
    total: questions.length,
    parseFailures,
    elapsedSeconds: elapsed,
  };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('       MMLU-Pro Comparison: Flash Lite vs Pro');
  console.log('═══════════════════════════════════════════════════════════');
  
  const results = [];
  
  // Run with Flash Lite
  results.push(await runBenchmark('gemini-3.5-flash', 'Gemini 3.5 Flash'));
  
  // Run with Pro
  results.push(await runBenchmark('gemini-1.5-pro', 'Gemini 1.5 Pro'));
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                    COMPARISON RESULTS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  for (const r of results) {
    console.log(`${r.model.padEnd(25)} | Accuracy: ${r.accuracy.toString().padStart(5)}% | ${r.correct}/${r.total}`);
  }
  
  const delta = results[1].accuracy - results[0].accuracy;
  console.log(`\nDelta (Pro - Flash): ${delta > 0 ? '+' : ''}${delta.toFixed(1)}pp`);
  console.log(`Cost ratio: Pro is ~${(results[1].elapsedSeconds / results[0].elapsedSeconds).toFixed(1)}x slower`);
  
  console.log('\n✅ Both runs complete. Ready for Braintrust comparison.');
}

main().catch(console.error);
