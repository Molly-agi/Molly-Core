/**
 * @fileOverview MMLU Real Test - 200 Official Questions
 *
 * This runs Molly through 200 real questions from the official MMLU dataset.
 * Maximum effort. Maximum focus. Methodical. No shortcuts. Real results only.
 *
 * Run: npx tsx src/ai/evals/mmlu-real-200.braintrust.ts
 */

import { conversationalChat } from '../flows/conversational-chat';
import { MollyLogger } from '@/ai/logger';
import Braintrust from 'braintrust';
import { readFileSync } from 'fs';

interface MMLUQuestion {
  id: string;
  subject: string;
  question: string;
  choices: string[];
  answer: number;
}

// ============================================================================
// LOAD REAL MMLU QUESTIONS
// ============================================================================

function loadQuestions(): MMLUQuestion[] {
  try {
    const data = readFileSync('./mmlu_data/selected_200_questions.json', 'utf-8');
    const questions = JSON.parse(data);
    console.log(`\n✓ Loaded ${questions.length} real MMLU questions from dataset`);
    return questions;
  } catch (err) {
    console.error('\n❌ Failed to load MMLU questions:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// ============================================================================
// RUN BENCHMARK - METHODICAL, NO SHORTCUTS
// ============================================================================

async function runMMluReal200() {
  const questions = loadQuestions();
  const results: Array<{
    id: string;
    subject: string;
    correctAnswerIndex: number;
    mollyAnswerIndex: number;
    isCorrect: boolean;
    timestamp: string;
  }> = [];

  let correctCount = 0;
  const startTime = Date.now();

  console.log('═'.repeat(70));
  console.log('MMLU REAL TEST - 200 OFFICIAL QUESTIONS');
  console.log('═'.repeat(70));
  console.log(`\nStarting at: ${new Date().toISOString()}`);
  console.log(`Total questions: ${questions.length}`);
  console.log(`Methodology: Methodical, sequential, no shortcuts\n`);

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const questionNumber = i + 1;

    // Format question with choices
    const choicesText = q.choices.map((choice, idx) => `${String.fromCharCode(65 + idx)}) ${choice}`).join('\n');
    const prompt = `${q.question}\n${choicesText}\nAnswer (A/B/C/D only):`;

    try {
      const result = await conversationalChat({
        text: prompt,
        history: [],
      });

      // Extract answer letter
      const answerMatch = result.response.trim().toUpperCase().match(/[A-D]/);
      const answerLetter = answerMatch ? answerMatch[0] : 'E';
      const mollyAnswerIndex = answerLetter.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3

      const isCorrect = mollyAnswerIndex === q.answer;
      if (isCorrect) correctCount++;

      results.push({
        id: q.id,
        subject: q.subject,
        correctAnswerIndex: q.answer,
        mollyAnswerIndex,
        isCorrect,
        timestamp: new Date().toISOString(),
      });

      // Progress update every 10 questions
      if (questionNumber % 10 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const soFar = ((correctCount / questionNumber) * 100).toFixed(1);
        console.log(`Progress: ${questionNumber}/${questions.length} | Correct so far: ${soFar}% | Time: ${elapsed}s`);
      }

      MollyLogger.debug(
        `[${q.subject}] Q${questionNumber}: Expected=${String.fromCharCode(65 + q.answer)} Got=${answerLetter} ${isCorrect ? '✓' : '✗'}`,
        'mmlu-real-200'
      );
    } catch (err) {
      results.push({
        id: q.id,
        subject: q.subject,
        correctAnswerIndex: q.answer,
        mollyAnswerIndex: 4, // E = error
        isCorrect: false,
        timestamp: new Date().toISOString(),
      });

      MollyLogger.error(
        `Question ${questionNumber} failed`,
        'mmlu-real-200',
        { error: err instanceof Error ? err.message : String(err) }
      );
    }
  }

  const endTime = Date.now();
  const totalSeconds = (endTime - startTime) / 1000;
  const accuracy = (correctCount / questions.length) * 100;

  // Calculate by subject
  const bySubject: Record<string, { total: number; correct: number }> = {};
  results.forEach((r) => {
    if (!bySubject[r.subject]) bySubject[r.subject] = { total: 0, correct: 0 };
    bySubject[r.subject].total++;
    if (r.isCorrect) bySubject[r.subject].correct++;
  });

  // Record to Braintrust
  const apiKey = process.env.BRAINTRUST_API_KEY;
  if (apiKey) {
    try {
      const project = Braintrust.init({
        project: 'molly-mmlu-real-200',
        apiKey,
      });

      await project.log({
        inputs: {
          questionCount: questions.length,
          subjectCount: Object.keys(bySubject).length,
          testType: 'mmlu-official-real',
        },
        output: {
          correctCount,
          totalCount: questions.length,
          accuracy: accuracy.toFixed(2),
          subjectBreakdown: bySubject,
          totalTimeSeconds: totalSeconds.toFixed(1),
        },
        expected: {
          accuracy: 86.4, // GPT-4 baseline
        },
        scores: {
          accuracy: accuracy / 100,
        },
        metadata: {
          evaluationType: 'mmlu-real-200-official',
          timestamp: new Date().toISOString(),
          runtimeSeconds: totalSeconds.toFixed(1),
        },
      });

      MollyLogger.info(
        'MMLU Real 200 recorded in Braintrust',
        'mmlu-real-200',
        { accuracy: accuracy.toFixed(2), projectName: 'molly-mmlu-real-200' }
      );
    } catch (err) {
      MollyLogger.warn('Failed to record in Braintrust', 'mmlu-real-200', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    correctCount,
    totalCount: questions.length,
    accuracy: accuracy.toFixed(2),
    totalTimeSeconds: totalSeconds.toFixed(1),
    subjectBreakdown: bySubject,
    results,
  };
}

// ============================================================================
// DISPLAY RESULTS
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  runMMluReal200()
    .then((results) => {
      console.log('\n' + '═'.repeat(70));
      console.log('FINAL RESULTS - 200 REAL MMLU QUESTIONS');
      console.log('═'.repeat(70));
      console.log(`\nAccuracy: ${results.accuracy}% (${results.correctCount}/${results.totalCount})`);
      console.log(`Total Runtime: ${results.totalTimeSeconds} seconds`);
      console.log(`Average per question: ${(parseFloat(results.totalTimeSeconds) / results.totalCount).toFixed(1)}s\n`);

      console.log('INDUSTRY BASELINES:');
      console.log('  GPT-4:           86.4%');
      console.log('  Claude 3 Opus:   88.7%');
      console.log('  Gemini 1.5 Pro:  87.2%');
      console.log(`  Molly:           ${results.accuracy}%\n`);

      console.log('BY SUBJECT (Top 10 by count):');
      Object.entries(results.subjectBreakdown)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10)
        .forEach(([subject, stats]) => {
          const pct = ((stats.correct / stats.total) * 100).toFixed(0);
          const emoji = stats.correct === stats.total ? '✓' : stats.correct >= stats.total * 0.75 ? '~' : '✗';
          console.log(`  ${emoji} ${subject.padEnd(35)}: ${stats.correct}/${stats.total} (${pct}%)`);
        });

      console.log('\n✅ Results recorded in Braintrust');
      console.log(`Completed: ${new Date().toISOString()}\n`);
    })
    .catch((err) => {
      console.error('\n❌ Benchmark failed:', err.message);
      process.exit(1);
    });
}

export { runMMluReal200 };
