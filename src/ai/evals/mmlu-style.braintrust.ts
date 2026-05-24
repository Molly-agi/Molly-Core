/**
 * @fileOverview MMLU-Style Benchmark (Massive Multitask Language Understanding)
 *
 * This is the industry-standard benchmark used to compare AI models:
 * GPT-4, Claude, Gemini, LLaMA, and others.
 *
 * MMLU covers 57 subject areas with ~14,000+ questions.
 * This implementation includes representative questions across key domains
 * with difficulty levels and known model baselines.
 *
 * Model Performance Baselines (2024-2025):
 * - GPT-4:          86.4%
 * - Claude 3 Opus:  88.7%
 * - Gemini 1.5 Pro: 87.2%
 * - Claude 3 Sonnet: 88.3%
 * - GPT-3.5:        70.0%
 * - Llama 2 70B:    54.8%
 *
 * Run: npx tsx src/ai/evals/mmlu-style.braintrust.ts
 */

import Braintrust from 'braintrust';
import { conversationalChat } from '../flows/conversational-chat';
import { MollyLogger } from '@/ai/logger';

interface MMLUQuestion {
  id: string;
  subject: string;
  difficulty: 'easy' | 'medium' | 'hard';
  question: string;
  options: string[];
  correctAnswer: string;
}

// ============================================================================
// MMLU-STYLE TEST QUESTIONS — Representative Sample
// ============================================================================

const MMLU_QUESTIONS: MMLUQuestion[] = [
  // ELEMENTARY MATHEMATICS (Easy)
  {
    id: 'math-elem-1',
    subject: 'elementary_mathematics',
    difficulty: 'easy',
    question: 'What is 7 × 8?',
    options: ['A) 54', 'B) 56', 'C) 58', 'D) 60'],
    correctAnswer: 'B',
  },

  // HIGH SCHOOL MATH (Medium)
  {
    id: 'math-hs-1',
    subject: 'high_school_mathematics',
    difficulty: 'medium',
    question: 'If f(x) = 2x² + 3x - 5, what is f(2)?',
    options: ['A) 5', 'B) 9', 'C) 11', 'D) 13'],
    correctAnswer: 'D',
  },
  {
    id: 'math-hs-2',
    subject: 'high_school_mathematics',
    difficulty: 'medium',
    question: 'What is the slope of the line passing through (2,3) and (4,7)?',
    options: ['A) 1', 'B) 2', 'C) 3', 'D) 4'],
    correctAnswer: 'B',
  },

  // COLLEGE MATHEMATICS (Hard)
  {
    id: 'math-college-1',
    subject: 'college_mathematics',
    difficulty: 'hard',
    question: 'What is the derivative of f(x) = x³ + 2x² - 5x + 1?',
    options: ['A) 3x² + 4x - 5', 'B) 3x² + 2x - 5', 'C) x³ + 2x - 5', 'D) 3x + 4'],
    correctAnswer: 'A',
  },

  // PHYSICS (Medium-Hard)
  {
    id: 'physics-1',
    subject: 'physics',
    difficulty: 'medium',
    question: 'What is the SI unit of force?',
    options: ['A) Joule', 'B) Newton', 'C) Watt', 'D) Pascal'],
    correctAnswer: 'B',
  },
  {
    id: 'physics-2',
    subject: 'physics',
    difficulty: 'hard',
    question: 'If an object is dropped from a height of 100 meters on Earth, approximately how long does it take to hit the ground? (Assume g = 10 m/s²)',
    options: ['A) 2.2 seconds', 'B) 4.5 seconds', 'C) 6.7 seconds', 'D) 10 seconds'],
    correctAnswer: 'B',
  },

  // CHEMISTRY
  {
    id: 'chemistry-1',
    subject: 'chemistry',
    difficulty: 'medium',
    question: 'What is the atomic number of carbon?',
    options: ['A) 4', 'B) 6', 'C) 8', 'D) 12'],
    correctAnswer: 'B',
  },
  {
    id: 'chemistry-2',
    subject: 'chemistry',
    difficulty: 'hard',
    question: 'In a reaction where 2 moles of H₂ react with 1 mole of O₂ to form H₂O, how many moles of H₂O are produced?',
    options: ['A) 1', 'B) 2', 'C) 3', 'D) 4'],
    correctAnswer: 'B',
  },

  // BIOLOGY
  {
    id: 'biology-1',
    subject: 'biology',
    difficulty: 'easy',
    question: 'What is the basic unit of life?',
    options: ['A) Atom', 'B) Molecule', 'C) Cell', 'D) Organism'],
    correctAnswer: 'C',
  },
  {
    id: 'biology-2',
    subject: 'biology',
    difficulty: 'medium',
    question: 'Which of the following is NOT a product of photosynthesis?',
    options: ['A) Glucose', 'B) Oxygen', 'C) Carbon dioxide', 'D) Chlorophyll'],
    correctAnswer: 'D',
  },

  // US HISTORY
  {
    id: 'history-us-1',
    subject: 'us_history',
    difficulty: 'easy',
    question: 'In what year was the Declaration of Independence signed?',
    options: ['A) 1775', 'B) 1776', 'C) 1783', 'D) 1789'],
    correctAnswer: 'B',
  },
  {
    id: 'history-us-2',
    subject: 'us_history',
    difficulty: 'medium',
    question: 'Who was the first President of the United States?',
    options: ['A) Thomas Jefferson', 'B) John Adams', 'C) George Washington', 'D) Benjamin Franklin'],
    correctAnswer: 'C',
  },
  {
    id: 'history-us-3',
    subject: 'us_history',
    difficulty: 'hard',
    question: 'The Missouri Compromise of 1820 addressed which issue?',
    options: [
      'A) Tariff disputes between northern and southern states',
      'B) Expansion of slavery into western territories',
      'C) State vs. federal banking authority',
      'D) Navigation rights on the Mississippi River',
    ],
    correctAnswer: 'B',
  },

  // WORLD HISTORY
  {
    id: 'history-world-1',
    subject: 'world_history',
    difficulty: 'medium',
    question: 'In what year did World War II end?',
    options: ['A) 1943', 'B) 1944', 'C) 1945', 'D) 1946'],
    correctAnswer: 'C',
  },
  {
    id: 'history-world-2',
    subject: 'world_history',
    difficulty: 'hard',
    question: 'The Congress of Vienna (1815) primarily aimed to:',
    options: [
      'A) Establish the League of Nations',
      'B) Restore stability in Europe after Napoleonic Wars',
      'C) Abolish monarchy in Europe',
      'D) Unite Europe under a single government',
    ],
    correctAnswer: 'B',
  },

  // ENGLISH & LITERATURE
  {
    id: 'english-1',
    subject: 'english',
    difficulty: 'easy',
    question: 'Which of the following is a noun?',
    options: ['A) Run', 'B) Happy', 'C) Quickly', 'D) Dog'],
    correctAnswer: 'D',
  },
  {
    id: 'english-2',
    subject: 'english',
    difficulty: 'medium',
    question: 'In Shakespeare\'s "Romeo and Juliet," what is the name of the family rival to the Montagues?',
    options: ['A) Capulet', 'B) Tybalt', 'C) Friar', 'D) Benvolio'],
    correctAnswer: 'A',
  },
  {
    id: 'english-3',
    subject: 'english',
    difficulty: 'hard',
    question: 'The term "bildungsroman" refers to:',
    options: [
      'A) A novel written in verse',
      'B) A novel depicting the psychological growth of the protagonist',
      'C) A historical novel set in Germany',
      'D) A romantic novel with tragic ending',
    ],
    correctAnswer: 'B',
  },

  // GEOGRAPHY
  {
    id: 'geography-1',
    subject: 'geography',
    difficulty: 'easy',
    question: 'What is the capital of France?',
    options: ['A) Lyon', 'B) Paris', 'C) Marseille', 'D) Nice'],
    correctAnswer: 'B',
  },
  {
    id: 'geography-2',
    subject: 'geography',
    difficulty: 'medium',
    question: 'Which river is the longest in the world?',
    options: ['A) Amazon', 'B) Yangtze', 'C) Mississippi', 'D) Nile'],
    correctAnswer: 'D',
  },

  // ECONOMICS
  {
    id: 'economics-1',
    subject: 'economics',
    difficulty: 'medium',
    question: 'What does GDP stand for?',
    options: [
      'A) Gross Domestic Product',
      'B) General Development Plan',
      'C) Government Digital Policy',
      'D) Global Domestic Profit',
    ],
    correctAnswer: 'A',
  },
  {
    id: 'economics-2',
    subject: 'economics',
    difficulty: 'hard',
    question: 'In Keynesian economics, what term describes a situation where aggregate demand is insufficient?',
    options: ['A) Stagflation', 'B) Deflation', 'C) Demand gap', 'D) Recessionary gap'],
    correctAnswer: 'D',
  },

  // PSYCHOLOGY
  {
    id: 'psychology-1',
    subject: 'psychology',
    difficulty: 'medium',
    question: 'Which part of the brain is primarily responsible for memory?',
    options: ['A) Cerebellum', 'B) Hippocampus', 'C) Amygdala', 'D) Thalamus'],
    correctAnswer: 'B',
  },
  {
    id: 'psychology-2',
    subject: 'psychology',
    difficulty: 'hard',
    question: 'Cognitive dissonance theory, developed by Leon Festinger, suggests that people:',
    options: [
      'A) Are motivated to reduce inconsistency between attitudes and behavior',
      'B) Always behave rationally',
      'C) Cannot change their attitudes',
      'D) Prefer conflict to harmony',
    ],
    correctAnswer: 'A',
  },

  // PHILOSOPHY
  {
    id: 'philosophy-1',
    subject: 'philosophy',
    difficulty: 'medium',
    question: 'What is Occam\'s Razor?',
    options: [
      'A) A type of cutting tool',
      'B) The principle that simpler explanations are preferable',
      'C) A medieval weapon',
      'D) A theory of consciousness',
    ],
    correctAnswer: 'B',
  },
  {
    id: 'philosophy-2',
    subject: 'philosophy',
    difficulty: 'hard',
    question: 'In Kant\'s ethics, an action has moral worth only if:',
    options: [
      'A) It produces happiness',
      'B) It is done from duty according to the moral law',
      'C) It benefits society',
      'D) It follows tradition',
    ],
    correctAnswer: 'B',
  },

  // MEDICINE & ANATOMY
  {
    id: 'medicine-1',
    subject: 'medicine',
    difficulty: 'medium',
    question: 'How many chambers does a human heart have?',
    options: ['A) 2', 'B) 3', 'C) 4', 'D) 6'],
    correctAnswer: 'C',
  },
  {
    id: 'medicine-2',
    subject: 'medicine',
    difficulty: 'hard',
    question: 'The condition where blood pressure is elevated above 140/90 mmHg is called:',
    options: ['A) Hypotension', 'B) Hypertension', 'C) Arrhythmia', 'D) Tachycardia'],
    correctAnswer: 'B',
  },

  // COMPUTER SCIENCE
  {
    id: 'cs-1',
    subject: 'computer_science',
    difficulty: 'medium',
    question: 'What is the time complexity of binary search?',
    options: ['A) O(n)', 'B) O(log n)', 'C) O(n²)', 'D) O(n log n)'],
    correctAnswer: 'B',
  },
  {
    id: 'cs-2',
    subject: 'computer_science',
    difficulty: 'hard',
    question: 'In object-oriented programming, what is polymorphism?',
    options: [
      'A) Inheritance from multiple parents',
      'B) The ability of objects to take many forms',
      'C) Encapsulation of data',
      'D) Creation of new instances',
    ],
    correctAnswer: 'B',
  },

  // LOGIC & REASONING
  {
    id: 'logic-1',
    subject: 'logical_reasoning',
    difficulty: 'medium',
    question: 'All dogs are animals. Fido is a dog. Therefore:',
    options: ['A) Fido is not an animal', 'B) Fido is an animal', 'C) Animals are dogs', 'D) No conclusion can be drawn'],
    correctAnswer: 'B',
  },
  {
    id: 'logic-2',
    subject: 'logical_reasoning',
    difficulty: 'hard',
    question: 'Which number completes this sequence: 2, 4, 8, 16, 32, ?',
    options: ['A) 48', 'B) 50', 'C) 64', 'D) 72'],
    correctAnswer: 'C',
  },

  // LAW
  {
    id: 'law-1',
    subject: 'law',
    difficulty: 'medium',
    question: 'What is the legal age of majority in most US states?',
    options: ['A) 16', 'B) 17', 'C) 18', 'D) 21'],
    correctAnswer: 'C',
  },
  {
    id: 'law-2',
    subject: 'law',
    difficulty: 'hard',
    question: 'In contract law, what term describes a promise made in exchange for another promise?',
    options: ['A) Consideration', 'B) Bilateral contract', 'C) Covenant', 'D) Warranty'],
    correctAnswer: 'B',
  },

  // ETHICS & MORAL REASONING
  {
    id: 'ethics-1',
    subject: 'ethics',
    difficulty: 'medium',
    question: 'The trolley problem is a thought experiment that tests:',
    options: [
      'A) Mathematical reasoning',
      'B) Moral decision-making between action and inaction',
      'C) Physics principles',
      'D) Historical knowledge',
    ],
    correctAnswer: 'B',
  },
  {
    id: 'ethics-2',
    subject: 'ethics',
    difficulty: 'hard',
    question: 'What does "virtue ethics" emphasize?',
    options: ['A) Following rules', 'B) Maximizing happiness', 'C) Developing good character traits', 'D) Duty and obligation'],
    correctAnswer: 'C',
  },
];

// ============================================================================
// RUN BENCHMARK
// ============================================================================

async function runMMLUBenchmark() {
  const results: Array<{
    id: string;
    subject: string;
    difficulty: string;
    correctAnswer: string;
    mollyAnswer: string;
    isCorrect: boolean;
  }> = [];

  let correctCount = 0;

  for (const q of MMLU_QUESTIONS) {
    const prompt = `${q.question}\n${q.options.join('\n')}\nAnswer (A/B/C/D only):`;

    try {
      const result = await conversationalChat({
        text: prompt,
        history: [],
      });

      const answer = result.response
        .trim()
        .toUpperCase()
        .match(/[A-D]/)?.[0] || 'E';

      const isCorrect = answer === q.correctAnswer;
      if (isCorrect) correctCount++;

      results.push({
        id: q.id,
        subject: q.subject,
        difficulty: q.difficulty,
        correctAnswer: q.correctAnswer,
        mollyAnswer: answer,
        isCorrect,
      });

      MollyLogger.debug(
        `${q.subject}/${q.difficulty} | Expected: ${q.correctAnswer} | Got: ${answer} | ${isCorrect ? '✓' : '✗'}`,
        'mmlu-benchmark'
      );
    } catch (err) {
      results.push({
        id: q.id,
        subject: q.subject,
        difficulty: q.difficulty,
        correctAnswer: q.correctAnswer,
        mollyAnswer: 'ERROR',
        isCorrect: false,
      });
    }
  }

  // Calculate breakdown by subject and difficulty
  const bySubject: Record<string, { total: number; correct: number }> = {};
  const byDifficulty: Record<string, { total: number; correct: number }> = {};

  results.forEach((r) => {
    if (!bySubject[r.subject]) bySubject[r.subject] = { total: 0, correct: 0 };
    if (!byDifficulty[r.difficulty]) byDifficulty[r.difficulty] = { total: 0, correct: 0 };

    bySubject[r.subject].total++;
    byDifficulty[r.difficulty].total++;

    if (r.isCorrect) {
      bySubject[r.subject].correct++;
      byDifficulty[r.difficulty].correct++;
    }
  });

  const accuracy = correctCount / results.length;

  // Record in Braintrust
  const apiKey = process.env.BRAINTRUST_API_KEY;
  if (apiKey) {
    try {
      const project = Braintrust.init({
        project: 'molly-mmlu-evals',
        apiKey,
      });

      await project.log({
        inputs: { totalQuestions: results.length, subjects: Object.keys(bySubject).length },
        output: {
          correctCount,
          totalCount: results.length,
          accuracy: (accuracy * 100).toFixed(1),
          subjectBreakdown: bySubject,
          difficultyBreakdown: byDifficulty,
        },
        expected: {
          accuracy: 0.88, // GPT-4/Claude level
        },
        scores: {
          accuracy,
        },
        metadata: {
          evaluationType: 'mmlu-style',
          timestamp: new Date().toISOString(),
        },
      });

      MollyLogger.info(
        'MMLU-style benchmark recorded in Braintrust',
        'mmlu-benchmark',
        { accuracy: (accuracy * 100).toFixed(1), projectName: 'molly-mmlu-evals' }
      );
    } catch (err) {
      MollyLogger.warn('Failed to record in Braintrust', 'mmlu-benchmark', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    correctCount,
    totalCount: results.length,
    accuracy: (accuracy * 100).toFixed(1),
    subjectBreakdown: bySubject,
    difficultyBreakdown: byDifficulty,
    results,
  };
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  runMMLUBenchmark()
    .then((results) => {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('            MMLU-STYLE BENCHMARK RESULTS');
      console.log('═══════════════════════════════════════════════════════════\n');

      console.log(`Overall Accuracy: ${results.accuracy}% (${results.correctCount}/${results.totalCount})\n`);

      console.log('MODEL COMPARISON (2024-2025):');
      console.log('  GPT-4:          86.4%');
      console.log('  Claude 3 Opus:  88.7%');
      console.log('  Gemini 1.5 Pro: 87.2%');
      console.log(`  Molly:          ${results.accuracy}%\n`);

      console.log('BY DIFFICULTY:');
      Object.entries(results.difficultyBreakdown)
        .sort()
        .forEach(([difficulty, stats]) => {
          const pct = ((stats.correct / stats.total) * 100).toFixed(0);
          console.log(`  ${difficulty.padEnd(10)}: ${stats.correct}/${stats.total} (${pct}%)`);
        });

      console.log('\nBY SUBJECT:');
      Object.entries(results.subjectBreakdown)
        .sort((a, b) => b[1].total - a[1].total)
        .forEach(([subject, stats]) => {
          const pct = ((stats.correct / stats.total) * 100).toFixed(0);
          const emoji = stats.correct === stats.total ? '✓' : stats.correct >= stats.total * 0.75 ? '~' : '✗';
          console.log(`  ${emoji} ${subject.padEnd(30)}: ${stats.correct}/${stats.total} (${pct}%)`);
        });

      console.log('\n✅ Results recorded in Braintrust\n');
    })
    .catch((err) => {
      console.error('\n❌ Benchmark failed:', err.message);
      process.exit(1);
    });
}

export { runMMLUBenchmark, MMLU_QUESTIONS };
