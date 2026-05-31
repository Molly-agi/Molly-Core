/**
 * @fileOverview Pattern Synthesis Flow — Molly's spatial/visual reasoning engine
 *
 * This flow gives Molly the ability to solve abstract pattern reasoning problems
 * by writing and executing code. Instead of guessing the output, she:
 *
 *   1. Studies the input/output examples and describes the transformation rule
 *   2. Writes Python code that implements the rule
 *   3. Verifies the code against ALL training examples (self-check)
 *   4. If verification fails, reflects on the error and rewrites (up to 3 attempts)
 *   5. Applies the verified code to the test input
 *
 * This is the same approach used by top ARC-AGI solvers (o3, etc.).
 * The key insight: don't guess the output — derive a program that produces it.
 *
 * Usage: pattern reasoning, ARC-AGI style puzzles, grid transformations,
 * sequence completion, visual logic, any "what comes next" type problem.
 */

import { ai, molly } from '@/ai/genkit';
import { z } from 'zod';
import { sandboxExecuteCode } from '@/ai/sandbox/sandbox-engine';
import { MollyLogger, generateTraceId } from '@/ai/logger';
import { withGenerateErrorHandling } from '@/ai/error-handler';

// ── Schemas ─────────────────────────────────────────────────────────────────

const GridSchema = z.array(z.array(z.number().int().min(0).max(9)));

const PatternExample = z.object({
  input: GridSchema,
  output: GridSchema,
});

export const PatternSynthesisInputSchema = z.object({
  /** Training examples showing input → output transformation */
  examples: z
    .array(PatternExample)
    .min(1)
    .describe('Input/output pairs demonstrating the transformation rule'),

  /** The test input to apply the rule to */
  testInput: GridSchema.describe('The grid to transform'),

  /** Optional: known expected output for self-scoring */
  expectedOutput: GridSchema.optional().describe(
    'Expected output for validation (optional)'
  ),

  /** Max synthesis attempts before giving up */
  maxAttempts: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(3)
    .describe('Max code synthesis attempts if verification fails'),
});

export const PatternSynthesisOutputSchema = z.object({
  /** The predicted output grid */
  predictedOutput: GridSchema.nullable().describe(
    'The transformed output grid, or null if synthesis failed'
  ),

  /** Whether the prediction matches expected output (if provided) */
  correct: z
    .boolean()
    .nullable()
    .describe(
      'True if prediction matches expected, null if no expected was given'
    ),

  /** The transformation rule Molly identified */
  ruleDescription: z
    .string()
    .describe('Plain-language description of the rule'),

  /** The Python code that implements the rule */
  synthesizedCode: z
    .string()
    .describe('Python function that performs the transformation'),

  /** Whether the code passed verification against all training examples */
  verified: z
    .boolean()
    .describe(
      'Did the code produce correct outputs for all training examples?'
    ),

  /** Number of synthesis attempts needed */
  attemptsUsed: z.number().int(),

  /** Any execution errors encountered */
  errors: z.array(z.string()).optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderGrid(grid: number[][]): string {
  return grid.map((row) => row.join(' ')).join('\n');
}

function gridsEqual(a: number[][], b: number[][]): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return a.every(
    (row, i) => row.length === b[i].length && row.every((v, j) => v === b[i][j])
  );
}

/** Build the prompt asking Molly to analyze pattern and write Python */
function buildSynthesisPrompt(
  examples: z.infer<typeof PatternExample>[],
  testInput: number[][],
  previousAttempt?: { code: string; error: string }
): string {
  const examplesText = examples
    .map((ex, i) => {
      const inputDims = `${ex.input.length}×${ex.input[0].length}`;
      const outputDims = `${ex.output.length}×${ex.output[0].length}`;
      return `Example ${i + 1} (input ${inputDims} → output ${outputDims}):
INPUT:
${renderGrid(ex.input)}
OUTPUT:
${renderGrid(ex.output)}`;
    })
    .join('\n\n');

  const testDims = `${testInput.length}×${testInput[0].length}`;

  const retrySection = previousAttempt
    ? `
PREVIOUS ATTEMPT FAILED:
Code:
\`\`\`python
${previousAttempt.code}
\`\`\`
Error/Mismatch: ${previousAttempt.error}

Study what went wrong and write a corrected version.
`
    : '';

  return `You are solving an abstract pattern reasoning puzzle. Study the examples carefully.

${examplesText}

${retrySection}
TEST INPUT (${testDims}):
${renderGrid(testInput)}

Your task:
1. Identify the EXACT transformation rule. Be specific — count cells, look for symmetry, tiling, rotation, color mapping, scaling patterns.
2. Write a Python function that implements the rule.

REQUIREMENTS for the Python code:
- Define a function called \`transform(grid)\` that takes a 2D list and returns a 2D list
- Pure Python only — no imports except: \`from copy import deepcopy\`
- Handle edge cases
- The function must work for ALL the examples above

ANSWER FORMAT — respond with exactly this structure:

RULE: [one sentence describing the transformation]

CODE:
\`\`\`python
from copy import deepcopy

def transform(grid):
    # your implementation here
    pass
\`\`\``;
}

/** Parse rule and code from Molly's response */
function parseRuleAndCode(
  response: string
): { rule: string; code: string } | null {
  const ruleMatch = response.match(/RULE:\s*(.+)/);
  const codeMatch = response.match(/```python\s*([\s\S]+?)```/);

  if (!codeMatch) return null;

  return {
    rule: ruleMatch?.[1]?.trim() ?? 'Pattern transformation',
    code: codeMatch[1].trim(),
  };
}

/** Build Python verification script */
function buildVerificationScript(
  synthesisCode: string,
  examples: z.infer<typeof PatternExample>[],
  testInput: number[][]
): string {
  const examplesJson = JSON.stringify(examples);
  const testJson = JSON.stringify(testInput);

  return `
import json
from copy import deepcopy

# Molly's synthesized transform function
${synthesisCode}

# Verification
examples = json.loads('''${examplesJson}''')
test_input = json.loads('''${testJson}''')

all_pass = True
errors = []

for i, ex in enumerate(examples):
    try:
        result = transform(ex['input'])
        if result != ex['output']:
            all_pass = False
            errors.append(f"Example {i+1}: expected {ex['output'][:2]}... got {result[:2] if result else 'None'}...")
    except Exception as e:
        all_pass = False
        errors.append(f"Example {i+1} crashed: {str(e)}")

# Apply to test
test_result = None
test_error = None
try:
    test_result = transform(test_input)
except Exception as e:
    test_error = str(e)

print(json.dumps({
    "all_pass": all_pass,
    "errors": errors,
    "test_result": test_result,
    "test_error": test_error
}))
`;
}

// ── Flow ─────────────────────────────────────────────────────────────────────

export const patternSynthesisFlow = ai.defineFlow(
  {
    name: 'patternSynthesisFlow',
    inputSchema: PatternSynthesisInputSchema,
    outputSchema: PatternSynthesisOutputSchema,
  },
  withGenerateErrorHandling(async (input) => {
    const traceId = generateTraceId();
    MollyLogger.info('Pattern synthesis started', 'patternSynthesisFlow', {
      traceId,
      exampleCount: input.examples.length,
      testDims: `${input.testInput.length}x${input.testInput[0]?.length}`,
    });

    const errors: string[] = [];
    let ruleDescription = 'Unknown';
    let synthesizedCode = '';
    let verified = false;
    let predictedOutput: number[][] | null = null;
    let attemptsUsed = 0;
    let previousAttempt: { code: string; error: string } | undefined;

    for (let attempt = 0; attempt < input.maxAttempts; attempt++) {
      attemptsUsed = attempt + 1;

      // Step 1: Ask Molly to reason about the pattern and write code
      const prompt = buildSynthesisPrompt(
        input.examples,
        input.testInput,
        previousAttempt
      );

      const { text: response } = await molly.generate({
        prompt,
        config: { temperature: 0.1, maxOutputTokens: 2048 },
      });

      const parsed = parseRuleAndCode(response ?? '');
      if (!parsed) {
        errors.push(
          `Attempt ${attemptsUsed}: Could not parse rule/code from response`
        );
        continue;
      }

      ruleDescription = parsed.rule;
      synthesizedCode = parsed.code;

      // Step 2: Execute verification in sandbox
      const verificationScript = buildVerificationScript(
        synthesizedCode,
        input.examples,
        input.testInput
      );

      const execResult = await sandboxExecuteCode(verificationScript, 'python');

      if (!execResult.success || execResult.stderr) {
        const errMsg = execResult.stderr || 'Execution failed';
        errors.push(`Attempt ${attemptsUsed}: ${errMsg.slice(0, 200)}`);
        previousAttempt = {
          code: synthesizedCode,
          error: errMsg.slice(0, 300),
        };
        continue;
      }

      // Step 3: Parse verification output
      try {
        const verResult = JSON.parse(execResult.stdout.trim());

        if (verResult.test_error) {
          errors.push(
            `Attempt ${attemptsUsed}: Test execution error: ${verResult.test_error}`
          );
          previousAttempt = {
            code: synthesizedCode,
            error: `Test input crashed: ${verResult.test_error}`,
          };
          continue;
        }

        if (!verResult.all_pass) {
          const errMsg = verResult.errors?.join('; ') ?? 'Verification failed';
          errors.push(`Attempt ${attemptsUsed}: ${errMsg}`);
          previousAttempt = { code: synthesizedCode, error: errMsg };
          continue;
        }

        // All training examples pass — use the test result
        verified = true;
        predictedOutput = verResult.test_result;
        break;
      } catch {
        errors.push(
          `Attempt ${attemptsUsed}: Could not parse verification output`
        );
        previousAttempt = {
          code: synthesizedCode,
          error: 'Verification output parse failed',
        };
      }
    }

    // Determine correctness if expected output was provided
    const correct = input.expectedOutput
      ? gridsEqual(predictedOutput ?? [], input.expectedOutput)
      : null;

    MollyLogger.info('Pattern synthesis complete', 'patternSynthesisFlow', {
      traceId,
      verified,
      correct,
      attemptsUsed,
      errorCount: errors.length,
    });

    return {
      predictedOutput,
      correct,
      ruleDescription,
      synthesizedCode,
      verified,
      attemptsUsed,
      errors: errors.length > 0 ? errors : undefined,
    };
  })
);
