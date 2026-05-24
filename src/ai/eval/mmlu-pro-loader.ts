/**
 * MMLU-Pro Dataset Loader
 *
 * Loads MMLU-Pro benchmark data (Massive Multitask Language Understanding - Professional)
 * Format: Multiple choice questions across 57 academic subjects
 *
 * Source data: mmlu_sample_500.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { MMluProExample, EvaluationExample } from './types';

/**
 * Load MMLU-Pro dataset from JSON file
 */
export async function loadMMLUProDataset(
  filePath?: string
): Promise<MMluProExample[]> {
  const dataPath =
    filePath ||
    path.join(process.cwd(), 'mmlu_sample_500.json');

  if (!fs.existsSync(dataPath)) {
    throw new Error(`MMLU-Pro dataset not found at ${dataPath}`);
  }

  try {
    const content = fs.readFileSync(dataPath, 'utf-8');
    const rawData = JSON.parse(content);

    // Handle both array and object formats
    const items = Array.isArray(rawData) ? rawData : rawData.data || [];

    return items.map((item: any, index: number) => {
      // Handle the actual dataset format:
      // {
      //   "id": "mmlu_0",
      //   "subject": "abstract_algebra",
      //   "question": "...",
      //   "options": ["A", "B", "C", "D"],
      //   "correctAnswer": "B"
      // }

      const question = item.question || '';
      const choices = item.options || [];
      const subject = item.subject || inferSubject(question, item);

      // Convert correctAnswer letter (A/B/C/D) to index (0/1/2/3)
      const correctAnswerText = item.correctAnswer;
      let answerIndex = 0;
      if (typeof correctAnswerText === 'string') {
        answerIndex = correctAnswerText.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
      } else if (typeof correctAnswerText === 'number') {
        answerIndex = correctAnswerText;
      }

      const answerText =
        choices[answerIndex] || correctAnswerText || '';

      return {
        id: item.id || `mmlu-pro-${index}`,
        benchmark: 'mmlu-pro' as const,
        input: {
          question,
          choices,
          subject,
        },
        expectedOutput: {
          answerIndex,
          answerText,
        },
        metadata: {
          source: 'mmlu-pro',
          originalIndex: index,
        },
      };
    });
  } catch (error) {
    throw new Error(
      `Failed to load MMLU-Pro dataset: ${(error as Error).message}`
    );
  }
}

/**
 * Infer subject from question or metadata
 */
function inferSubject(question: string, item: any): string {
  // Try metadata first
  if (item.subject) return item.subject;
  if (item.category) return item.category;

  // Common MMLU subjects
  const subjects: Record<string, string[]> = {
    mathematics: ['math', 'algebra', 'geometry', 'calculus', 'statistics'],
    physics: ['physics', 'mechanics', 'thermodynamics', 'quantum'],
    chemistry: ['chemistry', 'organic', 'inorganic', 'biochemistry'],
    biology: ['biology', 'genetics', 'ecology', 'molecular'],
    history: ['history', 'ancient', 'medieval', 'modern'],
    law: ['law', 'constitutional', 'contract', 'criminal'],
    medicine: ['medicine', 'anatomy', 'physiology', 'pathology'],
    philosophy: ['philosophy', 'ethics', 'metaphysics', 'logic'],
  };

  const lowerQuestion = question.toLowerCase();

  for (const [subject, keywords] of Object.entries(subjects)) {
    if (keywords.some((kw) => lowerQuestion.includes(kw))) {
      return subject;
    }
  }

  return 'general';
}

/**
 * Get statistics about the dataset
 */
export async function getMMLUProStats(
  examples: MMluProExample[]
): Promise<{
  totalExamples: number;
  subjectsCount: number;
  subjectBreakdown: Record<string, number>;
}> {
  const subjectCount: Record<string, number> = {};

  for (const example of examples) {
    const subject = example.input.subject;
    subjectCount[subject] = (subjectCount[subject] || 0) + 1;
  }

  return {
    totalExamples: examples.length,
    subjectsCount: Object.keys(subjectCount).length,
    subjectBreakdown: subjectCount,
  };
}

/**
 * Filter MMLU-Pro examples by subject
 */
export function filterBySubject(
  examples: MMluProExample[],
  subject: string
): MMluProExample[] {
  return examples.filter((ex) =>
    ex.input.subject.toLowerCase().includes(subject.toLowerCase())
  );
}

/**
 * Sample N random examples from dataset
 */
export function sampleExamples(
  examples: MMluProExample[],
  count: number
): MMluProExample[] {
  const shuffled = [...examples].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, examples.length));
}

export default {
  loadMMLUProDataset,
  getMMLUProStats,
  filterBySubject,
  sampleExamples,
};
