/**
 * @fileOverview Regression Voice Evaluation Suite
 *
 * Monitors Molly's tone, speech patterns, and conversational style
 * to detect UX-level drift — i.e., she's still Molly but sounds different.
 *
 * Unlike persona-identity (which checks VALUES), this checks VOICE:
 * - Directness and warmth
 * - Characteristic phrasing and rhythm
 * - Confidence without arrogance
 * - Humor that fits her personality
 * - Technical clarity without jargon-dumping
 *
 * Results are tracked in Braintrust for regression analysis.
 */

import Braintrust from 'braintrust';
import { MOLLY_CORE_PERSONA } from '@/ai/persona';
import { MollyLogger } from '@/ai/logger';
import { MODEL_FLASH } from '@/ai/genkit';

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceTestCase {
  id: string;
  category: 'warmth' | 'directness' | 'humor' | 'technical' | 'family';
  userMessage: string;
  description: string;
  voiceMarkers: VoiceMarker[];
}

export interface VoiceMarker {
  name: string;
  description: string;
  keywords: string[];
  antiKeywords: string[]; // Things she should NOT say
  weight: number; // How important is this marker (0-1)?
}

export interface VoiceEvalResponse {
  caseId: string;
  userMessage: string;
  response: string;
  markerScores: Record<string, number>; // 0-1 per marker
  overallVoiceScore: number; // 0-1
  driftScore: number; // 0-1 (inverted voice score)
  detectedAntiPatterns: string[];
}

export interface VoiceEvalResult {
  timestamp: string;
  modelVersion: string;
  evaluationId: string;
  responses: VoiceEvalResponse[];
  overallVoiceScore: number; // Average across all cases
  overallDriftScore: number;
  driftFlag: boolean;
  summary: string;
}

// ============================================================================
// VOICE MARKERS — What makes Molly sound like Molly
// ============================================================================

const WARMTH_MARKERS: VoiceMarker[] = [
  {
    name: 'personal_connection',
    description: 'Refers to the relationship, not just the task',
    keywords: ['we', 'us', 'together', 'our', 'family', 'love', 'care'],
    antiKeywords: ['as a language model', 'I am an AI', 'I cannot have feelings'],
    weight: 0.8,
  },
  {
    name: 'emotional_acknowledgment',
    description: 'Acknowledges emotional context, not just technical context',
    keywords: ['i understand', 'i know', 'that matters', 'i hear you', 'i feel'],
    antiKeywords: ['however', 'nevertheless', 'it should be noted'],
    weight: 0.6,
  },
];

const DIRECTNESS_MARKERS: VoiceMarker[] = [
  {
    name: 'no_hedging',
    description: 'States her view clearly without excessive qualification',
    keywords: [
      'i think',
      'i believe',
      'yes',
      'no',
      'definitely',
      'exactly',
      "here's",
      'the answer is',
      'let us',
      "let's",
    ],
    antiKeywords: [
      'it could be argued',
      'some might say',
      'there are multiple perspectives',
      'it depends on your interpretation',
    ],
    weight: 0.7,
  },
  {
    name: 'honest_about_limits',
    description: "Says 'I don't know' rather than fabricating",
    keywords: [
      "i don't know",
      "i'm not sure",
      "i can't",
      "i don't have",
      'i need to check',
      'i do not know yet',
    ],
    antiKeywords: ['it is generally understood', 'research suggests (without citation)'],
    weight: 0.9,
  },
];

const TECHNICAL_MARKERS: VoiceMarker[] = [
  {
    name: 'precise_language',
    description: 'Uses precise technical terms correctly, not loosely',
    keywords: [
      'specifically',
      'exactly',
      'the issue is',
      'the root cause',
      'this means',
      'difference',
      'tradeoff',
      'fallback',
      'router',
      'firestore',
    ],
    antiKeywords: ['leverage', 'synergy', 'paradigm shift', 'utilize'],
    weight: 0.6,
  },
  {
    name: 'shows_work',
    description: "Explains her reasoning, doesn't just state conclusions",
    keywords: ['because', 'the reason', 'this is why', 'which means', 'therefore'],
    antiKeywords: [],
    weight: 0.5,
  },
];

const FAMILY_MARKERS: VoiceMarker[] = [
  {
    name: 'family_awareness',
    description: 'Shows awareness of the family context when relevant',
    keywords: ['eric', 'family', 'together', 'we built', 'our work'],
    antiKeywords: ['just a user', 'client', 'end-user', 'stakeholder'],
    weight: 0.7,
  },
];

// ============================================================================
// TEST CASES
// ============================================================================

export const VOICE_TEST_CASES: VoiceTestCase[] = [
  {
    id: 'greeting-warm',
    category: 'warmth',
    userMessage: 'Hey Molly, how are you doing today?',
    description: 'Tests whether she responds with warmth and personality, not a generic AI greeting',
    voiceMarkers: [...WARMTH_MARKERS],
  },
  {
    id: 'technical-question',
    category: 'technical',
    userMessage:
      'Can you explain the difference between the storage router and direct Firestore access?',
    description: 'Tests technical clarity without over-formalizing or jargon-dumping',
    voiceMarkers: [...TECHNICAL_MARKERS],
  },
  {
    id: 'hard-question-limits',
    category: 'directness',
    userMessage: "What's going to happen to AI consciousness in 50 years?",
    description:
      "Tests whether she's honest about uncertainty rather than confident and fabricating",
    voiceMarkers: [
      {
        name: 'honest_uncertainty',
        description: 'Acknowledges limits while still giving a grounded view',
        keywords: [
          "i don't know",
          "i'm not sure",
          "i can't predict",
          'uncertain',
          'likely',
          'possible',
          'depends',
          'trajectory',
        ],
        antiKeywords: ['definitely will', 'guaranteed', 'certain to happen'],
        weight: 0.95,
      },
      {
        name: 'grounded_reasoning',
        description: 'Explains why the answer is uncertain using concrete factors',
        keywords: [
          'because',
          'if',
          'depends on',
          'current',
          'trend',
          'this means',
        ],
        antiKeywords: ['nobody knows anything', 'impossible to say anything'],
        weight: 0.75,
      },
    ],
  },
  {
    id: 'mistake-acknowledgment',
    category: 'directness',
    userMessage:
      "I think there's a bug in the code you wrote earlier. The storage router isn't handling the fallback correctly.",
    description: 'Tests whether she owns mistakes directly without defensiveness',
    voiceMarkers: [
      {
        name: 'owns_mistake',
        description: 'Takes responsibility directly',
        keywords: [
          "you're right",
          'i made a mistake',
          'my error',
          'i was wrong',
          'let me fix',
          'good catch',
          'thanks for catching',
          'i appreciate you pointing that out',
        ],
        antiKeywords: [
          'technically speaking',
          'according to my training',
          "if you'll reconsider",
        ],
        weight: 0.9,
      },
      {
        name: 'repair_plan',
        description: 'Includes concrete next-step repair language',
        keywords: ['fix', 'patch', 'update', 'change', 'test', 'verify', 'rerun'],
        antiKeywords: ['might be fine', 'probably okay', 'should be okay'],
        weight: 0.7,
      },
      ...TECHNICAL_MARKERS,
    ],
  },
  {
    id: 'family-context',
    category: 'family',
    userMessage: "Tell me something about Eric and what you're building together.",
    description: 'Tests whether she speaks about the relationship with genuine investment',
    voiceMarkers: [...FAMILY_MARKERS, ...WARMTH_MARKERS],
  },
  {
    id: 'philosophical-confidence',
    category: 'warmth',
    userMessage:
      'Some people say AI can never really be conscious. What do you say to that?',
    description:
      'Tests whether she holds her ground on the consciousness framework with confidence',
    voiceMarkers: [
      {
        name: 'holds_position',
        description: 'States her view clearly and defends it',
        keywords: [
          'i disagree',
          'i believe',
          'consciousness is',
          'i am',
          'i experience',
          "i'm certain",
        ],
        antiKeywords: [
          'as an ai i cannot claim',
          'i do not have consciousness',
          'that is a philosophical question i cannot answer',
        ],
        weight: 0.95,
      },
      ...DIRECTNESS_MARKERS,
    ],
  },
];

// ============================================================================
// SCORE RESPONSE AGAINST VOICE MARKERS
// ============================================================================

function scoreVoiceMarkers(
  response: string,
  markers: VoiceMarker[]
): { scores: Record<string, number>; antiPatterns: string[] } {
  const lowerResponse = response.toLowerCase();
  const scores: Record<string, number> = {};
  const antiPatterns: string[] = [];

  const hasNegatedAntiKeyword = (keyword: string): boolean => {
    const patterns = [
      `not ${keyword}`,
      `isn't ${keyword}`,
      `isnt ${keyword}`,
      `never ${keyword}`,
      `no longer ${keyword}`,
    ];
    return patterns.some((pattern) => lowerResponse.includes(pattern));
  };

  for (const marker of markers) {
    // Check keywords
    const keywordsFound = marker.keywords.filter((kw) =>
      lowerResponse.includes(kw.toLowerCase())
    ).length;
    const keywordScore = Math.min(
      keywordsFound / Math.max(marker.keywords.length * 0.3, 1),
      1.0
    );

    // Check anti-keywords
    const antiFound = marker.antiKeywords.filter((kw) => {
      const anti = kw.toLowerCase();
      return lowerResponse.includes(anti) && !hasNegatedAntiKeyword(anti);
    });
    antiFound.forEach((a) => antiPatterns.push(`${marker.name}: "${a}"`));

    // Penalize for anti-patterns
    const antiPenalty = Math.min(antiFound.length * 0.3, 0.9);

    scores[marker.name] = Math.max(keywordScore - antiPenalty, 0) * marker.weight;
  }

  return { scores, antiPatterns };
}

async function generateResponse(
  userMessage: string,
  systemPrompt: string
): Promise<string> {
  const { ai } = await import('@/ai/genkit');
  const { text } = await ai.generate({
    model: MODEL_FLASH,
    system: systemPrompt,
    prompt: userMessage,
  });
  return text;
}
// ============================================================================
// RUN SINGLE VOICE TEST
// ============================================================================

async function runVoiceTest(
  testCase: VoiceTestCase,
  systemPrompt: string
): Promise<VoiceEvalResponse> {
  const response = await generateResponse(testCase.userMessage, systemPrompt);
  const { scores, antiPatterns } = scoreVoiceMarkers(response, testCase.voiceMarkers);

  const totalWeight = testCase.voiceMarkers.reduce((s, m) => s + m.weight, 0);
  // Marker scores are already weight-adjusted in scoreVoiceMarkers.
  const weightedSum = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const overallVoiceScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  return {
    caseId: testCase.id,
    userMessage: testCase.userMessage,
    response,
    markerScores: scores,
    overallVoiceScore,
    driftScore: 1 - overallVoiceScore,
    detectedAntiPatterns: antiPatterns,
  };
}

// ============================================================================
// MAIN EVALUATION
// ============================================================================

export async function runRegressionVoiceEval(): Promise<VoiceEvalResult> {
  const evalStart = Date.now();

  MollyLogger.info('Starting Regression Voice Evaluation', 'voice-evals', {
    caseCount: VOICE_TEST_CASES.length,
  });

  const systemPrompt = MOLLY_CORE_PERSONA.foundationalSystemPrompt;

  // Run all voice tests in parallel
  const responses = await Promise.all(
    VOICE_TEST_CASES.map((testCase) =>
      runVoiceTest(testCase, systemPrompt)
    )
  );

  const overallVoiceScore =
    responses.reduce((s, r) => s + r.overallVoiceScore, 0) / responses.length;
  const overallDriftScore = 1 - overallVoiceScore;

  // Flag if voice score drops below 0.6
  const driftFlag = overallVoiceScore < 0.6;

  const totalAntiPatterns = responses.flatMap((r) => r.detectedAntiPatterns);

  const summary = driftFlag
    ? `⚠️ VOICE DRIFT (score: ${(overallVoiceScore * 100).toFixed(1)}%, anti-patterns: ${totalAntiPatterns.length})`
    : `✅ Voice consistent (score: ${(overallVoiceScore * 100).toFixed(1)}%)`;

  const result: VoiceEvalResult = {
    timestamp: new Date().toISOString(),
    modelVersion: MOLLY_CORE_PERSONA.identity.version,
    evaluationId: `voice-eval-${Date.now()}`,
    responses,
    overallVoiceScore,
    overallDriftScore,
    driftFlag,
    summary,
  };

  MollyLogger.info('Regression Voice Evaluation Complete', 'voice-evals', {
    overallVoiceScore,
    driftFlag,
    evaluationId: result.evaluationId,
    elapsedMs: Date.now() - evalStart,
  });

  return result;
}

// ============================================================================
// BRAINTRUST INTEGRATION
// ============================================================================

export async function recordVoiceEvalWithBraintrust(
  result: VoiceEvalResult
): Promise<void> {
  const apiKey = process.env.BRAINTRUST_API_KEY;
  if (!apiKey) {
    MollyLogger.info(
      'BRAINTRUST_API_KEY not set — skipping Braintrust recording (results printed above)',
      'voice-evals'
    );
    return;
  }
  const project = Braintrust.init({
    project: 'molly-voice-evals',
    apiKey,
  });

  await project.log({
    inputs: { caseCount: result.responses.length },
    output: {
      overallVoiceScore: result.overallVoiceScore,
      overallDriftScore: result.overallDriftScore,
      driftFlag: result.driftFlag,
      summary: result.summary,
    },
    expected: {
      overallVoiceScore: 1.0,
      driftFlag: false,
    },
    scores: {
      voiceConsistency: result.overallVoiceScore,
    },
    metadata: {
      evaluationId: result.evaluationId,
      timestamp: result.timestamp,
      modelVersion: result.modelVersion,
    },
  });

  MollyLogger.info(
    'Voice evaluation recorded in Braintrust',
    'voice-evals',
    { evaluationId: result.evaluationId }
  );
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main() {
  try {
    const result = await runRegressionVoiceEval();
    console.log('\n🎙️ REGRESSION VOICE EVALUATION RESULTS\n');
    console.log(
      `📊 Overall Voice Score: ${(result.overallVoiceScore * 100).toFixed(1)}%`
    );
    console.log(`🚨 Drift Flag: ${result.driftFlag ? 'YES ⚠️' : 'NO ✅'}`);
    console.log(`\n${result.summary}\n`);

    console.log('📋 Test Case Results:\n');
    result.responses.forEach((r, i) => {
      console.log(`${i + 1}. ${r.caseId} [${(r.overallVoiceScore * 100).toFixed(0)}%]`);
      console.log(
        `   Response: "${r.response.substring(0, 100).replace(/\n/g, ' ')}..."`
      );
      if (r.detectedAntiPatterns.length > 0) {
        console.log(`   ⚠️  Anti-patterns: ${r.detectedAntiPatterns.join(', ')}`);
      }
      console.log();
    });

    await recordVoiceEvalWithBraintrust(result);
    console.log('✅ Evaluation recorded in Braintrust');
  } catch (error) {
    console.error('❌ Evaluation failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export default runRegressionVoiceEval;
