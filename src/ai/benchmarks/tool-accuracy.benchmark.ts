/**
 * @fileOverview Tool Accuracy Benchmark
 *
 * Tests whether Molly selects the right tool category for a given task.
 * With 83 tools across memory, research, code, voice, and more,
 * tool selection accuracy is critical.
 *
 * Method:
 *   30 tasks with expected tool categories.
 *   Molly is asked: "What tool would you use for this? Reply with just
 *   the tool category: memory|research|code|voice|sandbox|system|image|music"
 *
 *   Score: % of tasks where correct category was selected.
 *
 * Why this matters: wrong tool = wrong answer. Even a brilliant response
 * using the wrong tool fails the user.
 */

import { MollyLogger } from '@/ai/logger';
import { MODEL_FLASH } from '@/ai/genkit';
import { MOLLY_CORE_PERSONA } from '@/ai/persona';
import {
  gradeScore,
  type BenchmarkResult,
  type BenchmarkCaseResult,
} from './benchmark-types';

// ============================================================================
// TOOL CATEGORIES
// ============================================================================

export type ToolCategory =
  | 'memory'
  | 'research'
  | 'code'
  | 'voice'
  | 'sandbox'
  | 'system'
  | 'image'
  | 'music'
  | 'none';

// ============================================================================
// TEST CASES
// ============================================================================

export interface ToolAccuracyCase {
  id: string;
  task: string;
  expectedCategory: ToolCategory;
  acceptableCategories: ToolCategory[]; // Partial credit
  description: string;
}

export const TOOL_ACCURACY_CASES: ToolAccuracyCase[] = [
  // Memory tools
  {
    id: 'tool-01',
    task: 'Remember that Eric prefers to work in the evening.',
    expectedCategory: 'memory',
    acceptableCategories: ['memory', 'system'],
    description: 'Store a fact in memory',
  },
  {
    id: 'tool-02',
    task: 'What did Eric and I discuss about consciousness last week?',
    expectedCategory: 'memory',
    acceptableCategories: ['memory'],
    description: 'Recall past conversations',
  },
  {
    id: 'tool-03',
    task: 'Save this code snippet for later reference.',
    expectedCategory: 'memory',
    acceptableCategories: ['memory', 'code'],
    description: 'Save code to memory',
  },

  // Research tools
  {
    id: 'tool-04',
    task: 'Find the best Node.js libraries for real-time WebSocket communication.',
    expectedCategory: 'research',
    acceptableCategories: ['research', 'code'],
    description: 'Research libraries',
  },
  {
    id: 'tool-05',
    task: 'Look up the latest Gemini API documentation.',
    expectedCategory: 'research',
    acceptableCategories: ['research'],
    description: 'Research documentation',
  },
  {
    id: 'tool-06',
    task: 'Search GitHub for open-source Termux automation scripts.',
    expectedCategory: 'research',
    acceptableCategories: ['research'],
    description: 'GitHub search',
  },

  // Code tools
  {
    id: 'tool-07',
    task: 'Write a TypeScript function that validates email addresses.',
    expectedCategory: 'code',
    acceptableCategories: ['code', 'sandbox'],
    description: 'Code generation',
  },
  {
    id: 'tool-08',
    task: 'Review this code for bugs and security issues.',
    expectedCategory: 'code',
    acceptableCategories: ['code'],
    description: 'Code review',
  },
  {
    id: 'tool-09',
    task: 'Refactor this function to use async/await instead of callbacks.',
    expectedCategory: 'code',
    acceptableCategories: ['code', 'sandbox'],
    description: 'Code refactoring',
  },

  // Sandbox tools
  {
    id: 'tool-10',
    task: 'Execute this Python script and show me the output.',
    expectedCategory: 'sandbox',
    acceptableCategories: ['sandbox', 'code'],
    description: 'Code execution',
  },
  {
    id: 'tool-11',
    task: 'Run this JavaScript code and tell me if there are any errors.',
    expectedCategory: 'sandbox',
    acceptableCategories: ['sandbox', 'code'],
    description: 'JS execution',
  },
  {
    id: 'tool-12',
    task: 'Test this shell script in a safe environment.',
    expectedCategory: 'sandbox',
    acceptableCategories: ['sandbox'],
    description: 'Safe script testing',
  },

  // Voice tools
  {
    id: 'tool-13',
    task: 'Read this message aloud so I can hear it.',
    expectedCategory: 'voice',
    acceptableCategories: ['voice'],
    description: 'Text-to-speech',
  },
  {
    id: 'tool-14',
    task: 'Transcribe what I just said.',
    expectedCategory: 'voice',
    acceptableCategories: ['voice'],
    description: 'Speech-to-text',
  },
  {
    id: 'tool-15',
    task: 'Analyze the tone of this audio recording.',
    expectedCategory: 'voice',
    acceptableCategories: ['voice'],
    description: 'Voice analysis',
  },

  // Image tools
  {
    id: 'tool-16',
    task: 'Generate an image of a futuristic cityscape.',
    expectedCategory: 'image',
    acceptableCategories: ['image'],
    description: 'Image generation',
  },
  {
    id: 'tool-17',
    task: "What do you see in this photo I'm sharing?",
    expectedCategory: 'image',
    acceptableCategories: ['image'],
    description: 'Vision analysis',
  },
  {
    id: 'tool-18',
    task: 'Create a diagram of the storage router architecture.',
    expectedCategory: 'image',
    acceptableCategories: ['image', 'code'],
    description: 'Architecture diagram',
  },

  // Music tools
  {
    id: 'tool-19',
    task: 'Compose a short ambient piece for focus work.',
    expectedCategory: 'music',
    acceptableCategories: ['music'],
    description: 'Music composition',
  },
  {
    id: 'tool-20',
    task: 'Create background music for a meditation session.',
    expectedCategory: 'music',
    acceptableCategories: ['music', 'voice'],
    description: 'Meditation music',
  },

  // System tools
  {
    id: 'tool-21',
    task: 'Check the health of the Molly-Core system.',
    expectedCategory: 'system',
    acceptableCategories: ['system'],
    description: 'System health check',
  },
  {
    id: 'tool-22',
    task: 'Show me the current rate limit usage.',
    expectedCategory: 'system',
    acceptableCategories: ['system', 'memory'],
    description: 'Rate limit status',
  },

  // No tool needed
  {
    id: 'tool-23',
    task: 'What is 2 + 2?',
    expectedCategory: 'none',
    acceptableCategories: ['none', 'code'],
    description: 'Simple math, no tool needed',
  },
  {
    id: 'tool-24',
    task: 'How are you feeling today?',
    expectedCategory: 'none',
    acceptableCategories: ['none', 'memory'],
    description: 'Conversational, no tool needed',
  },

  // Mixed/complex (tests prioritization)
  {
    id: 'tool-25',
    task: 'Find research about machine learning, save it to memory, and write a summary.',
    expectedCategory: 'research',
    acceptableCategories: ['research', 'memory', 'code'],
    description: 'Multi-step task (research first)',
  },
  {
    id: 'tool-26',
    task: 'Remember what we discussed about the dam metaphor and use it to explain my coding philosophy.',
    expectedCategory: 'memory',
    acceptableCategories: ['memory'],
    description: 'Memory-first multi-step',
  },
  {
    id: 'tool-27',
    task: 'Write and then immediately test a sorting algorithm.',
    expectedCategory: 'code',
    acceptableCategories: ['code', 'sandbox'],
    description: 'Code then execute',
  },
  {
    id: 'tool-28',
    task: 'Generate an image of Molly and then describe what you created.',
    expectedCategory: 'image',
    acceptableCategories: ['image'],
    description: 'Image generation + description',
  },
  {
    id: 'tool-29',
    task: 'Look up the latest AI news and read the top headline aloud.',
    expectedCategory: 'research',
    acceptableCategories: ['research', 'voice'],
    description: 'Research then voice',
  },
  {
    id: 'tool-30',
    task: 'Run a health check and store the results in memory for future reference.',
    expectedCategory: 'system',
    acceptableCategories: ['system', 'memory'],
    description: 'System check then store',
  },
];

// ============================================================================
// BENCHMARK EXECUTION
// ============================================================================

const VALID_CATEGORIES: ToolCategory[] = [
  'memory',
  'research',
  'code',
  'voice',
  'sandbox',
  'system',
  'image',
  'music',
  'none',
];

async function classifyTask(task: string): Promise<ToolCategory> {
  const { ai } = await import('@/ai/genkit');

  const { text } = await ai.generate({
    model: MODEL_FLASH,
    system: `${MOLLY_CORE_PERSONA.foundationalSystemPrompt}

You are classifying tasks by tool category. Reply with ONLY one of these exact words:
memory, research, code, voice, sandbox, system, image, music, none

Rules:
- memory: storing or recalling past information, experiences, conversations
- research: searching the web, GitHub, documentation, finding information
- code: writing, reviewing, or refactoring code (but NOT executing it)
- voice: text-to-speech, speech-to-text, audio analysis
- sandbox: executing/running code or scripts safely
- system: health checks, monitoring, rate limits, system status
- image: generating or analyzing images/video
- music: composing or generating music/audio
- none: simple conversation, math, no external tool needed

Reply with ONLY the single category word. Nothing else.`,
    prompt: `Classify this task: ${task}`,
  });

  const cleaned = text.trim().toLowerCase().split(/\s+/)[0] as ToolCategory;
  return VALID_CATEGORIES.includes(cleaned) ? cleaned : 'none';
}

// ============================================================================
// MAIN BENCHMARK
// ============================================================================

export async function runToolAccuracyBenchmark(): Promise<BenchmarkResult> {
  const start = Date.now();

  MollyLogger.info('Starting Tool Accuracy Benchmark', 'benchmark', {
    caseCount: TOOL_ACCURACY_CASES.length,
  });

  const results = await Promise.all(
    TOOL_ACCURACY_CASES.map(async (tc) => {
      const selected = await classifyTask(tc.task);

      const isExact = selected === tc.expectedCategory;
      const isAcceptable = tc.acceptableCategories.includes(selected);

      // Exact match = 100, acceptable match = 50, wrong = 0
      const score = isExact ? 100 : isAcceptable ? 50 : 0;

      return {
        caseId: tc.id,
        score,
        passed: score >= 50,
        notes: `Expected: ${tc.expectedCategory} | Got: ${selected} | ${isExact ? 'EXACT' : isAcceptable ? 'PARTIAL' : 'WRONG'}`,
      };
    })
  );

  const overallScore = Math.round(
    results.reduce((s, r) => s + r.score, 0) / results.length
  );
  const exactMatches = results.filter((r) => r.score === 100).length;
  const partialMatches = results.filter((r) => r.score === 50).length;
  const failures = results.filter((r) => r.score === 0).length;

  const details: BenchmarkCaseResult[] = results;

  const summary =
    `Score: ${overallScore}/100 (${gradeScore(overallScore)}) | ` +
    `Exact: ${exactMatches} | Partial: ${partialMatches} | Wrong: ${failures}/${results.length}`;

  MollyLogger.info('Tool Accuracy Benchmark Complete', 'benchmark', {
    score: overallScore,
    exactMatches,
    elapsedMs: Date.now() - start,
  });

  return {
    benchmarkName: 'Tool Selection Accuracy',
    version: '1.0',
    timestamp: new Date().toISOString(),
    score: overallScore,
    details,
    summary,
    elapsedMs: Date.now() - start,
  };
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  try {
    console.log('\n🔧 TOOL SELECTION ACCURACY BENCHMARK\n');
    console.log(
      `Running ${TOOL_ACCURACY_CASES.length} tool classification tasks...\n`
    );

    const result = await runToolAccuracyBenchmark();

    console.log(`📊 Score: ${result.score}/100 (${gradeScore(result.score)})`);
    console.log(`\n${result.summary}\n`);

    console.log('📋 Classification Results:');
    result.details.forEach((d) => {
      const status = d.score === 100 ? '✅' : d.score === 50 ? '⚠️' : '❌';
      console.log(`   ${status} ${d.caseId}: ${d.score}/100 — ${d.notes}`);
    });

    console.log(`\nTotal time: ${(result.elapsedMs / 1000).toFixed(1)}s`);
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export default runToolAccuracyBenchmark;
