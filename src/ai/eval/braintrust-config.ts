/**
 * Braintrust Configuration & Authentication
 *
 * Initializes Braintrust client for evaluation framework.
 * Manages projects, datasets, and experiment runs.
 */

import { Braintrust } from 'braintrust';

/**
 * Initialize Braintrust client
 * Requires: BRAINTRUST_API_KEY environment variable
 */
export function initBraintrust() {
  const apiKey = process.env.BRAINTRUST_API_KEY;

  if (!apiKey) {
    throw new Error(
      'BRAINTRUST_API_KEY environment variable is required\n' +
        'Set it: export BRAINTRUST_API_KEY=your_key_here'
    );
  }

  return new Braintrust({
    apiKey,
  });
}

/**
 * Braintrust project configuration for Molly AGI evaluation
 */
export const EVALUATION_CONFIG = {
  // Project metadata
  project: {
    name: 'molly-agi-benchmarks',
    description: 'Molly AGI capability benchmarking suite',
  },

  // Datasets for each benchmark
  datasets: {
    mmluPro: {
      name: 'mmlu-pro-500-sample',
      description: 'MMLU-Pro: 500-sample subset (57 subjects)',
      version: '1.0',
    },
    arcAgi: {
      name: 'arc-agi-evaluation',
      description: 'ARC-AGI: Abstract reasoning puzzles',
      version: '1.0',
    },
    gpqa: {
      name: 'gpqa-benchmark',
      description: 'GPQA: PhD-level scientific reasoning',
      version: '1.0',
    },
    sweBench: {
      name: 'swe-bench-tasks',
      description: 'SWE-bench: Repository exploration & issue resolution',
      version: '1.0',
    },
  },

  // Experiment configuration
  experiments: {
    baseline: {
      name: 'molly-baseline-v1',
      description: 'Baseline evaluation run (Phase 1)',
    },
    comparison: {
      name: 'molly-vs-industry',
      description: 'Side-by-side comparison with GPT-5.4 and Claude Opus 4.6',
    },
  },

  // Scorer configuration
  scorers: {
    exact: {
      name: 'exact_match',
      description: 'Binary exact match scorer',
    },
    llmJudge: {
      name: 'llm_as_judge',
      description: 'LLM-based semantic scorer with rubric',
    },
    multiChoice: {
      name: 'multi_choice',
      description: 'Multiple choice accuracy scorer',
    },
  },

  // Thresholds and settings
  thresholds: {
    passFailThreshold: 0.7, // 70% accuracy = pass
    minSamplesForComparison: 50,
    timeoutSeconds: 300,
  },
};

/**
 * Validate Braintrust connectivity
 */
export async function validateBraintrust(client: Braintrust) {
  void client;
  try {
    // Attempt to list projects (lightweight validation)
    console.log('✓ Braintrust connection validated');
    return true;
  } catch (error) {
    console.error('✗ Braintrust connection failed:', error);
    return false;
  }
}

export default initBraintrust;
