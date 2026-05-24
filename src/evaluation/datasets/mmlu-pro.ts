/**
 * MMLU-Pro Dataset Loader
 *
 * Load MMLU-Pro benchmark data from existing JSON and convert to Braintrust format.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { BenchmarkInput, MMLUProEntry } from '../braintrust/types';

/**
 * Load MMLU sample dataset
 *
 * Uses existing mmlu_sample_500.json from workspace
 */
export async function loadMMLUProDataset(): Promise<BenchmarkInput[]> {
  const dataPath = path.join(process.cwd(), 'mmlu_sample_500.json');

  if (!fs.existsSync(dataPath)) {
    throw new Error(`MMLU dataset not found at ${dataPath}`);
  }

  const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  // Convert raw MMLU data to BenchmarkInput format
  const benchmarkInputs: BenchmarkInput[] = [];

  if (Array.isArray(rawData)) {
    for (let i = 0; i < rawData.length; i++) {
      const entry = rawData[i] as MMLUProEntry;

      if (!entry.question || !entry.options || !entry.correctAnswer) {
        console.warn(`Skipping invalid MMLU entry at index ${i}`);
        continue;
      }

      benchmarkInputs.push({
        id: `mmlu-${entry.subject}-${i}`,
        question: entry.question,
        options: entry.options,
        category: entry.subject,
        difficulty: entry.level as 'easy' | 'medium' | 'hard' | 'expert',
        metadata: {
          source: 'MMLU-Pro',
          subject: entry.subject,
          level: entry.level,
          correctAnswer: entry.correctAnswer,
        },
      });
    }
  } else if (typeof rawData === 'object') {
    // Handle alternative format (object with subject keys)
    for (const [subject, items] of Object.entries(rawData)) {
      if (Array.isArray(items)) {
        for (let i = 0; i < items.length; i++) {
          const entry = items[i] as MMLUProEntry;

          if (!entry.question || !entry.options || !entry.correctAnswer) {
            console.warn(`Skipping invalid MMLU entry in ${subject} at index ${i}`);
            continue;
          }

          benchmarkInputs.push({
            id: `mmlu-${subject}-${i}`,
            question: entry.question,
            options: entry.options,
            category: subject,
            difficulty: entry.level as 'easy' | 'medium' | 'hard' | 'expert',
            metadata: {
              source: 'MMLU-Pro',
              subject,
              level: entry.level,
              correctAnswer: entry.correctAnswer,
            },
          });
        }
      }
    }
  }

  if (benchmarkInputs.length === 0) {
    throw new Error('No valid MMLU entries found in dataset');
  }

  console.log(`[MMLU] Loaded ${benchmarkInputs.length} benchmark entries`);
  return benchmarkInputs;
}

/**
 * Create MMLU dataset for Braintrust
 */
export async function createMMLUBraintrustDataset() {
  const entries = await loadMMLUProDataset();

  return {
    name: 'MMLU-Pro Baseline',
    description: 'Massive Multitask Language Understanding - Professional Level',
    entries,
    metadata: {
      version: '2.0',
      totalQuestions: entries.length,
      subjects: new Set(entries.map((e) => e.category)),
      difficulties: new Set(entries.map((e) => e.difficulty)),
    },
  };
}

/**
 * Get statistics about MMLU dataset
 */
export async function getMMLUStatistics() {
  const dataset = await createMMLUBraintrustDataset();

  const difficultyDistribution = new Map<string, number>();
  const subjectDistribution = new Map<string, number>();

  for (const entry of dataset.entries) {
    difficultyDistribution.set(
      entry.difficulty || 'unknown',
      (difficultyDistribution.get(entry.difficulty || 'unknown') || 0) + 1
    );

    subjectDistribution.set(
      entry.category || 'unknown',
      (subjectDistribution.get(entry.category || 'unknown') || 0) + 1
    );
  }

  return {
    totalQuestions: dataset.entries.length,
    uniqueSubjects: dataset.metadata.subjects.size,
    uniqueDifficulties: dataset.metadata.difficulties.size,
    difficultyDistribution: Object.fromEntries(difficultyDistribution),
    subjectDistribution: Object.fromEntries(subjectDistribution),
  };
}
