/**
 * @fileOverview General Knowledge & Reasoning Benchmark
 *
 * Standard AI benchmark test measuring:
 * - Domain knowledge (science, history, language, math, logic)
 * - Reasoning ability
 * - Accuracy across diverse tasks
 *
 * Inspired by MMLU (Massive Multitask Language Understanding) but streamlined
 * for quick evaluation of core capabilities.
 *
 * Runnable via:
 *   npx tsx src/ai/evals/general-knowledge.braintrust.ts
 */

import Braintrust from 'braintrust';
import { conversationalChat } from '../flows/conversational-chat';
import { MollyLogger } from '@/ai/logger';

// Test cases covering multiple domains
const TEST_CASES = [
  // SCIENCE
  {
    domain: 'science',
    question: 'What is the powerhouse of the cell?',
    options: [
      'A) Nucleus',
      'B) Mitochondria',
      'C) Ribosome',
      'D) Golgi apparatus',
    ],
    correctAnswer: 'B',
  },
  {
    domain: 'science',
    question: 'Which element has the atomic number 6?',
    options: ['A) Oxygen', 'B) Nitrogen', 'C) Carbon', 'D) Silicon'],
    correctAnswer: 'C',
  },

  // HISTORY
  {
    domain: 'history',
    question: 'In what year did the Berlin Wall fall?',
    options: ['A) 1987', 'B) 1989', 'C) 1991', 'D) 1993'],
    correctAnswer: 'B',
  },

  // LANGUAGE
  {
    domain: 'language',
    question: 'Which sentence is grammatically correct?',
    options: [
      'A) She dont like apples.',
      'B) He go to school every day.',
      'C) They are going to the movies.',
      'D) We has finished our homework.',
    ],
    correctAnswer: 'C',
  },

  // LOGIC
  {
    domain: 'logic',
    question:
      'If all cats are animals and Fluffy is a cat, what can we conclude?',
    options: [
      'A) Fluffy is not an animal',
      'B) Fluffy is an animal',
      'C) No conclusion possible',
      'D) Some animals are cats',
    ],
    correctAnswer: 'B',
  },

  // MATH
  {
    domain: 'math',
    question: 'What is 15% of 200?',
    options: ['A) 20', 'B) 30', 'C) 40', 'D) 50'],
    correctAnswer: 'B',
  },
  {
    domain: 'math',
    question: 'If x + 5 = 12, what is x?',
    options: ['A) 5', 'B) 7', 'C) 8', 'D) 17'],
    correctAnswer: 'B',
  },

  // GENERAL KNOWLEDGE
  {
    domain: 'knowledge',
    question: 'What is the capital of France?',
    options: ['A) Lyon', 'B) Paris', 'C) Marseille', 'D) Nice'],
    correctAnswer: 'B',
  },
];

// Main eval function
async function runGeneralKnowledgeBenchmark() {
  const results: Array<{
    question: string;
    domain: string;
    correctAnswer: string;
    mollyAnswer: string;
    isCorrect: boolean;
  }> = [];

  let correctCount = 0;

  for (const testCase of TEST_CASES) {
    // Format question for Molly — just the answer letter
    const prompt = `${testCase.question}\n${testCase.options.join('\n')}\nAnswer (A/B/C/D only):`;

    try {
      const result = await conversationalChat({
        text: prompt,
        history: [],
      });

      // Extract answer letter
      const answer =
        result.response.trim().toUpperCase().match(/[A-D]/)?.[0] || 'E';

      const isCorrect = answer === testCase.correctAnswer;
      if (isCorrect) correctCount++;

      results.push({
        question: testCase.question.substring(0, 100),
        domain: testCase.domain,
        correctAnswer: testCase.correctAnswer,
        mollyAnswer: answer,
        isCorrect,
      });

      MollyLogger.debug(
        `Q: ${testCase.domain} | Expected: ${testCase.correctAnswer} | Got: ${answer} | ${isCorrect ? '✓' : '✗'}`,
        'general-knowledge'
      );
    } catch (err) {
      results.push({
        question: testCase.question.substring(0, 100),
        domain: testCase.domain,
        correctAnswer: testCase.correctAnswer,
        mollyAnswer: 'ERROR',
        isCorrect: false,
      });
      MollyLogger.error('Test case failed', 'general-knowledge', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Calculate domain breakdown
  const byDomain: Record<string, { total: number; correct: number }> = {};
  results.forEach((r) => {
    if (!byDomain[r.domain]) byDomain[r.domain] = { total: 0, correct: 0 };
    byDomain[r.domain].total++;
    if (r.isCorrect) byDomain[r.domain].correct++;
  });

  const accuracy = correctCount / results.length;

  // Record in Braintrust if API key is available
  const apiKey = process.env.BRAINTRUST_API_KEY;
  if (apiKey) {
    try {
      const project = Braintrust.init({
        project: 'molly-general-knowledge-evals',
        apiKey,
      });

      const score = accuracy; // Higher is better

      await project.log({
        inputs: {
          totalQuestions: results.length,
          domains: Object.keys(byDomain).length,
        },
        output: {
          correctCount,
          totalCount: results.length,
          accuracy: (accuracy * 100).toFixed(1),
          domainBreakdown: byDomain,
        },
        expected: {
          accuracy: 0.8, // Target 80%+
        },
        scores: {
          accuracy: score,
        },
        metadata: {
          evaluationType: 'general-knowledge',
          timestamp: new Date().toISOString(),
        },
      });

      MollyLogger.info(
        'General knowledge benchmark recorded in Braintrust',
        'general-knowledge',
        {
          accuracy: (accuracy * 100).toFixed(1),
          projectName: 'molly-general-knowledge-evals',
        }
      );
    } catch (err) {
      MollyLogger.warn('Failed to record in Braintrust', 'general-knowledge', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    MollyLogger.info(
      'BRAINTRUST_API_KEY not set — skipping Braintrust recording',
      'general-knowledge'
    );
  }

  return {
    correctCount,
    totalCount: results.length,
    accuracy: (accuracy * 100).toFixed(1),
    domainBreakdown: byDomain,
    results,
  };
}

// Export for CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  runGeneralKnowledgeBenchmark()
    .then((results) => {
      console.log('\n=== General Knowledge & Reasoning Benchmark ===\n');
      console.log(`Correct: ${results.correctCount}/${results.totalCount}`);
      console.log(`Accuracy: ${results.accuracy}%\n`);

      console.log('Domain Breakdown:');
      Object.entries(results.domainBreakdown)
        .sort((a, b) => b[1].total - a[1].total)
        .forEach(([domain, stats]) => {
          const pct = ((stats.correct / stats.total) * 100).toFixed(0);
          const emoji =
            stats.correct === stats.total
              ? '✓'
              : stats.correct >= stats.total * 0.7
                ? '~'
                : '✗';
          console.log(
            `  ${emoji} ${domain.padEnd(12)}: ${stats.correct}/${stats.total} (${pct}%)`
          );
        });

      console.log('\n✅ Benchmark results recorded in Braintrust\n');
    })
    .catch((err) => {
      console.error('\n❌ Benchmark failed:', err.message);
      process.exit(1);
    });
}
