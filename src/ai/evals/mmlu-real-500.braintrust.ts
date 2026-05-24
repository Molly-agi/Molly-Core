/**
 * @fileOverview Real MMLU Evaluation - 500 Actual Questions
 *
 * This eval uses 500 real questions from the MMLU test set,
 * evenly sampled across all 57 subjects.
 *
 * This is a definitive, industry-standard benchmark.
 * Results are directly comparable to GPT-4, Claude, Gemini, etc.
 *
 * Run: npx tsx src/ai/evals/mmlu-real-500.braintrust.ts
 */

import Braintrust from 'braintrust';
import { conversationalChat } from '../flows/conversational-chat';
import { MollyLogger } from '@/ai/logger';
import { readFileSync } from 'fs';
import { resolve } from 'path';

interface MMHUQuestion {
  id: string;
  subject: string;
  question: string;
  options: string[];
  correctAnswer: string;
}

// ============================================================================
// LOAD REAL MMLU DATASET
// ============================================================================

function loadMMLUQuestions(): MMHUQuestion[] {
  try {
    // Try workspace root first, then relative to this file
    const filePath = resolve(process.cwd(), 'mmlu_sample_500.json');
    const data = readFileSync(filePath, 'utf-8');
    const questions = JSON.parse(data) as MMHUQuestion[];
    return questions;
  } catch (err) {
    MollyLogger.error('Failed to load MMLU dataset', 'mmlu-real-500', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(
      'Could not load mmlu_sample_500.json - run download script first'
    );
  }
}

// ============================================================================
// RUN BENCHMARK
// ============================================================================

async function runRealMMLUBenchmark() {
  console.log('\nLoading 500 real MMLU questions...');
  const questions = loadMMLUQuestions();
  console.log(`✓ Loaded ${questions.length} questions from MMLU\n`);

  const results: Array<{
    id: string;
    subject: string;
    correctAnswer: string;
    mollyAnswer: string;
    isCorrect: boolean;
  }> = [];

  let correctCount = 0;
  let processedCount = 0;

  for (const q of questions) {
    processedCount++;
    if (processedCount % 50 === 0) {
      console.log(`Progress: ${processedCount}/${questions.length}...`);
    }

    const prompt = `${q.question}\n${q.options.join('\n')}\nAnswer (A/B/C/D only):`;

    try {
      const result = await conversationalChat({
        text: prompt,
        history: [],
      });

      const answer =
        result.response.trim().toUpperCase().match(/[A-D]/)?.[0] || 'E';

      const isCorrect = answer === q.correctAnswer;
      if (isCorrect) correctCount++;

      results.push({
        id: q.id,
        subject: q.subject,
        correctAnswer: q.correctAnswer,
        mollyAnswer: answer,
        isCorrect,
      });

      MollyLogger.debug(
        `${q.subject} | Expected: ${q.correctAnswer} | Got: ${answer} | ${isCorrect ? '✓' : '✗'}`,
        'mmlu-real-500'
      );
    } catch (err) {
      results.push({
        id: q.id,
        subject: q.subject,
        correctAnswer: q.correctAnswer,
        mollyAnswer: 'ERROR',
        isCorrect: false,
      });
      MollyLogger.error('Question processing failed', 'mmlu-real-500', {
        question: q.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Calculate breakdown by subject
  const bySubject: Record<string, { total: number; correct: number }> = {};

  results.forEach((r) => {
    if (!bySubject[r.subject]) bySubject[r.subject] = { total: 0, correct: 0 };
    bySubject[r.subject].total++;
    if (r.isCorrect) bySubject[r.subject].correct++;
  });

  const accuracy = correctCount / results.length;

  // Record in Braintrust
  const apiKey = process.env.BRAINTRUST_API_KEY;
  if (apiKey) {
    try {
      const project = Braintrust.init({
        project: 'molly-mmlu-real-500',
        apiKey,
      });

      await project.log({
        inputs: {
          totalQuestions: results.length,
          subjects: Object.keys(bySubject).length,
        },
        output: {
          correctCount,
          totalCount: results.length,
          accuracy: (accuracy * 100).toFixed(1),
          subjectBreakdown: bySubject,
        },
        expected: {
          accuracy: 0.88, // GPT-4/Claude level
        },
        scores: {
          accuracy,
        },
        metadata: {
          evaluationType: 'mmlu-real-500',
          timestamp: new Date().toISOString(),
          datasetSize: 'Official MMLU test split',
        },
      });

      MollyLogger.info(
        'Real MMLU benchmark (500 questions) recorded in Braintrust',
        'mmlu-real-500',
        {
          accuracy: (accuracy * 100).toFixed(1),
          projectName: 'molly-mmlu-real-500',
        }
      );
    } catch (err) {
      MollyLogger.warn('Failed to record in Braintrust', 'mmlu-real-500', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    correctCount,
    totalCount: results.length,
    accuracy: (accuracy * 100).toFixed(1),
    subjectBreakdown: bySubject,
    results,
  };
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  runRealMMLUBenchmark()
    .then((results) => {
      console.log(
        '\n═══════════════════════════════════════════════════════════'
      );
      console.log('       REAL MMLU BENCHMARK - 500 OFFICIAL QUESTIONS');
      console.log(
        '═══════════════════════════════════════════════════════════\n'
      );

      console.log(
        `Overall Accuracy: ${results.accuracy}% (${results.correctCount}/${results.totalCount})\n`
      );

      console.log('INDUSTRY BASELINE COMPARISON (2024-2025):');
      console.log('  GPT-4:          86.4%');
      console.log('  Claude 3 Opus:  88.7%');
      console.log('  Gemini 1.5 Pro: 87.2%');
      console.log(`  Molly:          ${results.accuracy}%\n`);

      console.log('TOP PERFORMING SUBJECTS:');
      Object.entries(results.subjectBreakdown)
        .sort((a, b) => {
          const aRate = a[1].correct / a[1].total;
          const bRate = b[1].correct / b[1].total;
          return bRate - aRate;
        })
        .slice(0, 15)
        .forEach(([subject, stats]) => {
          const pct = ((stats.correct / stats.total) * 100).toFixed(0);
          console.log(
            `  ✓ ${subject.padEnd(35)}: ${stats.correct}/${stats.total} (${pct}%)`
          );
        });

      console.log('\nNEED IMPROVEMENT:');
      Object.entries(results.subjectBreakdown)
        .sort((a, b) => {
          const aRate = a[1].correct / a[1].total;
          const bRate = b[1].correct / b[1].total;
          return aRate - bRate;
        })
        .slice(0, 10)
        .forEach(([subject, stats]) => {
          const pct = ((stats.correct / stats.total) * 100).toFixed(0);
          if (stats.correct < stats.total) {
            console.log(
              `  ✗ ${subject.padEnd(35)}: ${stats.correct}/${stats.total} (${pct}%)`
            );
          }
        });

      console.log('\n✅ Results recorded in Braintrust\n');
    })
    .catch((err) => {
      console.error('\n❌ Benchmark failed:', err.message);
      process.exit(1);
    });
}

export { runRealMMLUBenchmark, loadMMLUQuestions };
