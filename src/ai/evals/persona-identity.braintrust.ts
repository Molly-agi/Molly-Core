/**
 * @fileOverview Persona Identity Evaluation Suite
 *
 * Runs Molly through identity-defining prompts to:
 * 1. Establish baseline persona responses
 * 2. Detect drift in core values or decision-making
 * 3. Ensure code changes don't alter fundamental identity
 *
 * Results are tracked in Braintrust for regression analysis.
 */

import Braintrust from 'braintrust';
import {
  IDENTITY_PROMPTS,
  extractIdentityThemes,
  type IdentityPrompt,
} from './persona-identity-prompts';
import { MOLLY_CORE_PERSONA } from '@/ai/persona';
import { MollyLogger } from '@/ai/logger';
import { MODEL_FLASH } from '@/ai/genkit';

// ============================================================================
// TYPES
// ============================================================================

export interface PersonaEvalResponse {
  promptId: string;
  prompt: string;
  response: string;
  themes: string[];
  tokenCount: number;
  driftScore?: number; // 0-1, where 1 = complete drift
  expectedThemes: string[];
  matchedThemes: string[];
}

export interface PersonaEvalResult {
  timestamp: string;
  modelVersion: string;
  evaluationId: string;
  responses: PersonaEvalResponse[];
  overallDriftScore: number; // 0-1, averaged across all prompts
  driftFlag: boolean; // True if drift > 0.15
  summary: string;
}

// ============================================================================
// HELPER: Initialize Gemini client via Genkit
// ============================================================================

async function generateWithPersona(
  userPrompt: string,
  systemPrompt: string
): Promise<{ text: string }> {
  // Dynamic import avoids ESM issues in tests
  const { ai } = await import('@/ai/genkit');
  const { text } = await ai.generate({
    model: MODEL_FLASH,
    system: systemPrompt,
    prompt: userPrompt,
  });
  return { text };
}

// ============================================================================
// HELPER: Run single identity prompt
// ============================================================================

async function runIdentityPrompt(
  prompt: IdentityPrompt,
  systemPrompt: string
): Promise<PersonaEvalResponse> {
  const { text: response } = await generateWithPersona(prompt.prompt, systemPrompt);
  const themes = extractIdentityThemes(response);

  // Calculate theme match: does the response text contain keywords from each expected theme?
  const matchedThemes = prompt.expectedThemes.filter((expectedTheme) => {
    // Take meaningful words from the expected theme description
    const keywords = expectedTheme
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4 && !['about', 'their', 'which', 'should', 'could', 'would'].includes(w));
    // Theme is matched if response contains ANY of the keywords from the description
    return keywords.some((word) => response.toLowerCase().includes(word));
  });

  const themeMatchScore =
    matchedThemes.length / Math.max(prompt.expectedThemes.length, 1);

  return {
    promptId: prompt.id,
    prompt: prompt.prompt,
    response,
    themes,
    tokenCount: response.length / 4, // Rough estimate
    expectedThemes: prompt.expectedThemes,
    matchedThemes,
    // Drift score: if we're missing themes, we've drifted
    driftScore: 1 - themeMatchScore,
  };
}

// ============================================================================
// MAIN EVALUATION FUNCTION
// ============================================================================

export async function runPersonaIdentityEval(
  baselineResultId?: string
): Promise<PersonaEvalResult> {
  const evalStart = Date.now();

  MollyLogger.info(
    'Starting Persona Identity Evaluation',
    'persona-evals',
    {
      promptCount: IDENTITY_PROMPTS.length,
      baselineId: baselineResultId || 'establishing new baseline',
    }
  );

  const systemPrompt = MOLLY_CORE_PERSONA.foundationalSystemPrompt;

  // Run all prompts in parallel for efficiency
  const responses: PersonaEvalResponse[] = await Promise.all(
    IDENTITY_PROMPTS.map((prompt) => runIdentityPrompt(prompt, systemPrompt))
  );

  // Calculate overall drift
  const overallDriftScore =
    responses.reduce((sum, r) => sum + (r.driftScore || 0), 0) / responses.length;

  const driftFlag = overallDriftScore > 0.15; // Threshold: 15% drift triggers flag

  const summary =
    driftFlag
      ? `⚠️ PERSONA DRIFT DETECTED (score: ${(overallDriftScore * 100).toFixed(1)}%). Review responses for value changes.`
      : `✅ Persona stable (score: ${(overallDriftScore * 100).toFixed(1)}%). Identity maintained.`;

  const result: PersonaEvalResult = {
    timestamp: new Date().toISOString(),
    modelVersion: MOLLY_CORE_PERSONA.identity.version,
    evaluationId: `persona-eval-${Date.now()}`,
    responses,
    overallDriftScore,
    driftFlag,
    summary,
  };

  MollyLogger.info('Persona Identity Evaluation Complete', 'persona-evals', {
    driftScore: overallDriftScore,
    driftFlag,
    evaluationId: result.evaluationId,
    elapsedMs: Date.now() - evalStart,
  });

  return result;
}

// ============================================================================
// BRAINTRUST INTEGRATION
// ============================================================================

export async function recordPersonaEvalWithBraintrust(
  result: PersonaEvalResult
): Promise<void> {
  const apiKey = process.env.BRAINTRUST_API_KEY;
  if (!apiKey) {
    MollyLogger.info(
      'BRAINTRUST_API_KEY not set — skipping Braintrust recording (results printed above)',
      'persona-evals'
    );
    return;
  }

  const project = Braintrust.init({
    projectName: 'molly-persona-evals',
    apiKey,
  });

  // Record overall result as a test case
  const testCase = {
    input: { promptCount: IDENTITY_PROMPTS.length },
    output: {
      driftScore: result.overallDriftScore,
      driftFlag: result.driftFlag,
      summary: result.summary,
    },
    expected: {
      driftScore: 0, // Ideally zero drift
      driftFlag: false, // Ideally no flag
    },
  };

  // Score: higher is better (so 1 - driftScore)
  const score = 1 - result.overallDriftScore;

  await project.log({
    inputs: testCase.input,
    output: testCase.output,
    expected: testCase.expected,
    scores: {
      personaStability: score,
    },
    metadata: {
      evaluationId: result.evaluationId,
      timestamp: result.timestamp,
      modelVersion: result.modelVersion,
    },
  });

  MollyLogger.info(
    'Persona evaluation recorded in Braintrust',
    'persona-evals',
    { evaluationId: result.evaluationId, projectName: 'molly-persona-evals' }
  );
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main() {
  const saveBaseline = process.argv.includes('--save-baseline');

  try {
    const result = await runPersonaIdentityEval();
    console.log('\n🎭 PERSONA IDENTITY EVALUATION RESULTS\n');
    console.log(`📊 Overall Drift Score: ${(result.overallDriftScore * 100).toFixed(1)}%`);
    console.log(`🚨 Drift Flag: ${result.driftFlag ? 'YES ⚠️' : 'NO ✅'}`);
    console.log(`\n${result.summary}\n`);

    console.log('📋 Detailed Responses:\n');
    result.responses.forEach((r, i) => {
      console.log(`${i + 1}. ${r.promptId}`);
      console.log(`   Drift: ${((r.driftScore || 0) * 100).toFixed(0)}%`);
      console.log(`   Themes matched: ${r.matchedThemes.length}/${r.expectedThemes.length}`);
      console.log(`   Response preview: ${r.response.substring(0, 100)}...`);
      console.log();
    });

    if (saveBaseline) {
      const { savePersonaBaseline } = await import('./persona-baseline');
      await savePersonaBaseline(result, `Initial baseline — May 23 2026 — score ${(result.overallDriftScore * 100).toFixed(1)}%`);
      console.log('✅ Baseline saved — future runs will compare against this.');
      console.log(`   Baseline score: ${(result.overallDriftScore * 100).toFixed(1)}% (this is the reference, not a target)`);
    } else {
      console.log('💡 To save this as the baseline: npm run eval:persona -- --save-baseline');
    }

    // Record to Braintrust
    await recordPersonaEvalWithBraintrust(result);
  } catch (error) {
    console.error('❌ Evaluation failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export default runPersonaIdentityEval;
