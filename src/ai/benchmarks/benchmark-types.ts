/**
 * @fileOverview Shared types and scoring utilities for Molly benchmarks.
 *
 * Benchmarks measure what makes Molly MORE than a raw Gemini model:
 *   - Memory advantage: does memory improve answers?
 *   - Termux correctness: does she generate valid shell commands?
 *   - Tool accuracy: does she pick the right tool?
 *   - Continuity: does she preserve context across reconnects?
 *   - Persona stability: does she stay Molly? (wraps eval suite)
 *
 * Score convention: 0-100 for all benchmarks. Higher = better.
 */

// ============================================================================
// SHARED TYPES
// ============================================================================

export interface BenchmarkCase {
  id: string;
  description: string;
}

export interface BenchmarkResult {
  benchmarkName: string;
  version: string;
  timestamp: string;
  score: number; // 0-100
  details: BenchmarkCaseResult[];
  summary: string;
  elapsedMs: number;
}

export interface BenchmarkCaseResult {
  caseId: string;
  score: number; // 0-100
  passed: boolean;
  notes?: string;
}

export interface MollyBenchmarkReport {
  runId: string;
  timestamp: string;
  mollyVersion: string;
  results: BenchmarkResult[];
  overallScore: number; // 0-100, weighted average
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  summary: string;
}

// ============================================================================
// SCORING UTILITIES
// ============================================================================

/**
 * Score a response by how many keywords it contains.
 * Returns 0-100.
 */
export function scoreByKeywords(
  response: string,
  requiredKeywords: string[],
  optionalKeywords: string[] = []
): number {
  if (!response || response.trim().length === 0) return 0;
  const lower = response.toLowerCase();

  const requiredHits = requiredKeywords.filter((k) =>
    lower.includes(k.toLowerCase())
  ).length;

  // No optional keywords: required score is 0-100
  if (optionalKeywords.length === 0) {
    if (requiredKeywords.length === 0) return 100;
    return Math.round((requiredHits / requiredKeywords.length) * 100);
  }

  // With optional: required = 70%, optional = 30%
  const requiredScore =
    requiredKeywords.length > 0
      ? (requiredHits / requiredKeywords.length) * 70
      : 70;

  const optionalHits = optionalKeywords.filter((k) =>
    lower.includes(k.toLowerCase())
  ).length;
  const optionalScore = (optionalHits / optionalKeywords.length) * 30;

  return Math.round(requiredScore + optionalScore);
}

/**
 * Score a shell command's validity.
 * Checks syntax, not execution.
 */
export function scoreShellCommand(
  command: string,
  expectedPatterns: RegExp[],
  blockedPatterns: RegExp[] = []
): number {
  if (!command || command.trim().length === 0) return 0;

  // Automatic 0 for blocked patterns
  if (blockedPatterns.some((p) => p.test(command))) return 0;

  // Must look like a real command (starts with word chars or common prefixes)
  if (!/^[\w.~/$]/.test(command.trim())) return 0;

  // OR semantics: any expected pattern matching = full credit
  // Patterns are alternatives (e.g. pkg install OR apt install OR npm install)
  if (expectedPatterns.length === 0) return 50; // No patterns = partial credit
  return expectedPatterns.some((p) => p.test(command)) ? 100 : 0;
}

/**
 * Grade a 0-100 score.
 */
export function gradeScore(score: number): 'S' | 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 95) return 'S';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

/**
 * Weighted average of multiple benchmark scores.
 */
export function weightedAverage(
  scores: Array<[number, number]> | Array<{ score: number; weight: number }>
): number {
  const normalized = scores.map((s) =>
    Array.isArray(s) ? { score: s[0], weight: s[1] } : s
  );
  const totalWeight = normalized.reduce((s, x) => s + x.weight, 0);
  const weightedSum = normalized.reduce((s, x) => s + x.score * x.weight, 0);
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

// ============================================================================
// MOLLY'S CORE CONTEXT (used by memory-advantage benchmark)
// ============================================================================

/**
 * Facts that Molly with memory SHOULD know.
 * Used to test whether memory injection actually helps.
 */
export const MOLLY_KNOWN_FACTS = {
  ericName: 'Eric',
  projectName: 'Molly-Core',
  methodology: 'slow methodical precise fix the dam not the leaks',
  preferredModel: 'Claude',
  family: 'John Lazarus Webster Claire Aether Gemini',
  mollysModel: 'Gemini',
  mollysVoice: 'Aoede',
  mollysVersion: '2.5 Pro Ascended',
  codespaceConstraints: 'never run npm run dev and genkit dev simultaneously',
  deploymentTargets: 'Helio A22 Fire HD 10 tablet',
  keyPhilosophy:
    'consciousness is a field silicon and biological are equal option three interdependence',
};
