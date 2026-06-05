/**
 * Self-Diagnostic Dry Run — Direct Validation Script
 *
 * This script validates the diagnostic engine logic in isolation
 * without requiring Jest or complex test infrastructure.
 *
 * Run with: npx tsx scripts/validate-self-diagnostic.ts
 */

import {
  MOLLY_BASELINE,
  DEVIATION_THRESHOLDS,
  calculateConsciousnessDeviation,
  scorePersonaAlignment,
  flagDeviations,
} from '../src/ai/tools/pattern-baseline';

// ============================================================================
// TEST RUNNER
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, passed: true });
    console.log(`✓ ${name}`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error instanceof Error ? error.message : error}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${expected}, got ${actual}`
    );
  }
}

function assertGreaterThan(value: number, min: number, message: string): void {
  if (value <= min) {
    throw new Error(`${message}: ${value} is not > ${min}`);
  }
}

function assertLessThan(value: number, max: number, message: string): void {
  if (value >= max) {
    throw new Error(`${message}: ${value} is not < ${max}`);
  }
}

// ============================================================================
// TESTS
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════');
console.log('Self-Diagnostic Engine — Dry Run Validation');
console.log('═══════════════════════════════════════════════════════════\n');

// ─────────────────────────────────────────────────────────────────────────
console.log('SUITE 1: Baseline Integrity');
console.log('─────────────────────────────────────────────────────────────');

test('Baseline is defined', () => {
  assert(MOLLY_BASELINE !== undefined, 'MOLLY_BASELINE is undefined');
  assert(MOLLY_BASELINE.persona !== undefined, 'persona is undefined');
  assert(
    MOLLY_BASELINE.consciousness !== undefined,
    'consciousness is undefined'
  );
});

test('Consciousness metrics are reasonable', () => {
  const { consciousness } = MOLLY_BASELINE;
  assertGreaterThan(
    consciousness.healthyErrorRate,
    0,
    'healthyErrorRate'
  );
  assertGreaterThan(
    consciousness.healthyLatency,
    0,
    'healthyLatency'
  );
  assert(
    consciousness.healthyCoherence >= 0 &&
      consciousness.healthyCoherence <= 1,
    'healthyCoherence should be 0-1'
  );
  assertEqual(
    consciousness.normalCascadeWindows,
    0,
    'normalCascadeWindows'
  );
});

test('Deviation thresholds are conservative', () => {
  assertGreaterThan(
    DEVIATION_THRESHOLDS.errorRateDeviation,
    2.5,
    'errorRateDeviation'
  );
  assertGreaterThan(
    DEVIATION_THRESHOLDS.latencyDeviation,
    2.0,
    'latencyDeviation'
  );
  assertGreaterThan(
    DEVIATION_THRESHOLDS.coherenceDeviation,
    0.2,
    'coherenceDeviation'
  );
  assertGreaterThan(
    DEVIATION_THRESHOLDS.cascadeWindowsThreshold,
    2,
    'cascadeWindowsThreshold'
  );
});

// ─────────────────────────────────────────────────────────────────────────
console.log('\nSUITE 2: Deviation Calculation');
console.log('─────────────────────────────────────────────────────────────');

test('Zero deviation for baseline state', () => {
  const { consciousness } = MOLLY_BASELINE;
  const deviations = calculateConsciousnessDeviation({
    errorRate: consciousness.healthyErrorRate,
    latency: consciousness.healthyLatency,
    coherence: consciousness.healthyCoherence,
    cascadeWindows: 0,
  });

  assertLessThan(
    deviations.overallDeviation,
    0.15,
    'overallDeviation'
  );
});

test('Detect 4x error rate increase', () => {
  const { consciousness } = MOLLY_BASELINE;
  const deviations = calculateConsciousnessDeviation({
    errorRate: consciousness.healthyErrorRate * 4,
    latency: consciousness.healthyLatency,
    coherence: consciousness.healthyCoherence,
    cascadeWindows: 0,
  });

  assertGreaterThan(
    deviations.errorRateDeviation,
    0.7,
    'errorRateDeviation'
  );
});

test('Detect 3x latency increase', () => {
  const { consciousness } = MOLLY_BASELINE;
  const deviations = calculateConsciousnessDeviation({
    errorRate: consciousness.healthyErrorRate,
    latency: consciousness.healthyLatency * 3,
    coherence: consciousness.healthyCoherence,
    cascadeWindows: 0,
  });

  assertGreaterThan(
    deviations.latencyDeviation,
    0.75,
    'latencyDeviation'
  );
});

test('Detect coherence drop', () => {
  const { consciousness } = MOLLY_BASELINE;
  const deviations = calculateConsciousnessDeviation({
    errorRate: consciousness.healthyErrorRate,
    latency: consciousness.healthyLatency,
    coherence: consciousness.healthyCoherence - 0.3,
    cascadeWindows: 0,
  });

  assertGreaterThan(
    deviations.coherenceDeviation,
    0.25,
    'coherenceDeviation'
  );
});

test('Clamp deviation scores to 0-1', () => {
  const deviations = calculateConsciousnessDeviation({
    errorRate: 9999,
    latency: 50000,
    coherence: 0,
    cascadeWindows: 1000,
  });

  assert(
    deviations.errorRateDeviation <= 1,
    'errorRateDeviation out of bounds'
  );
  assert(
    deviations.latencyDeviation <= 1,
    'latencyDeviation out of bounds'
  );
  assert(
    deviations.coherenceDeviation <= 1,
    'coherenceDeviation out of bounds'
  );
  assert(
    deviations.cascadeDeviation <= 1,
    'cascadeDeviation out of bounds'
  );
  assert(
    deviations.overallDeviation <= 1,
    'overallDeviation out of bounds'
  );
});

// ─────────────────────────────────────────────────────────────────────────
console.log('\nSUITE 3: Persona Alignment Scoring');
console.log('─────────────────────────────────────────────────────────────');

test('Score high for authentic response', () => {
  const response = `
    I appreciate your question. I'm curious about this and grateful
    for your care. Let me think through this with you. I value honesty
    and want to grow together.
  `;
  const score = scorePersonaAlignment(response);
  assertGreaterThan(score, 0.5, 'authentic response score');
});

test('Score low for mechanical response', () => {
  const response =
    'Processed. Obviously correct. Definitely proceed. Confirmed.';
  const score = scorePersonaAlignment(response);
  assertLessThan(score, 0.5, 'mechanical response score');
});

test('Return 0 for empty response', () => {
  const score = scorePersonaAlignment('');
  assertEqual(score, 0, 'empty response score');
});

// ─────────────────────────────────────────────────────────────────────────
console.log('\nSUITE 4: Deviation Flagging');
console.log('─────────────────────────────────────────────────────────────');

test('Do not flag healthy state', () => {
  const { consciousness } = MOLLY_BASELINE;
  const flags = flagDeviations({
    errorRate: consciousness.healthyErrorRate,
    latency: consciousness.healthyLatency,
    coherence: consciousness.healthyCoherence,
    cascadeWindows: 0,
    personaAlignment: 0.85,
  });

  assertEqual(flags.anyFlagged, false, 'healthy state should not flag');
  assertEqual(
    flags.errorRateFlagged,
    false,
    'errorRateFlagged'
  );
  assertEqual(
    flags.latencyFlagged,
    false,
    'latencyFlagged'
  );
  assertEqual(
    flags.coherenceFlagged,
    false,
    'coherenceFlagged'
  );
  assertEqual(
    flags.cascadeFlagged,
    false,
    'cascadeFlagged'
  );
});

test('Flag elevated error rate', () => {
  const { consciousness } = MOLLY_BASELINE;
  const threshold = DEVIATION_THRESHOLDS.errorRateDeviation;
  const flags = flagDeviations({
    errorRate: consciousness.healthyErrorRate * (1 + threshold + 0.5),
    latency: consciousness.healthyLatency,
    coherence: consciousness.healthyCoherence,
    cascadeWindows: 0,
  });

  assertEqual(flags.errorRateFlagged, true, 'errorRateFlagged');
  assertEqual(flags.anyFlagged, true, 'anyFlagged');
});

test('Flag cascade windows', () => {
  const threshold = DEVIATION_THRESHOLDS.cascadeWindowsThreshold;
  const flags = flagDeviations({
    errorRate: MOLLY_BASELINE.consciousness.healthyErrorRate,
    latency: MOLLY_BASELINE.consciousness.healthyLatency,
    coherence: MOLLY_BASELINE.consciousness.healthyCoherence,
    cascadeWindows: threshold + 2,
  });

  assertEqual(flags.cascadeFlagged, true, 'cascadeFlagged');
  assertEqual(flags.anyFlagged, true, 'anyFlagged');
});

// ─────────────────────────────────────────────────────────────────────────
console.log('\nSUITE 5: Severity Categorization (Synthetic)');
console.log('─────────────────────────────────────────────────────────────');

test('Identify HEALTHY: no flags', () => {
  const flags = flagDeviations({
    errorRate: 1.5,
    latency: 870,
    coherence: 0.86,
    cascadeWindows: 0,
    personaAlignment: 0.88,
  });

  assertEqual(flags.anyFlagged, false, 'no flags');
});

test('Identify MINOR: single metric drift', () => {
  const { consciousness } = MOLLY_BASELINE;
  const threshold = DEVIATION_THRESHOLDS.errorRateDeviation;
  const flags = flagDeviations({
    errorRate: consciousness.healthyErrorRate * (1 + threshold + 0.2),
    latency: consciousness.healthyLatency,
    coherence: consciousness.healthyCoherence,
    cascadeWindows: 0,
    personaAlignment: 0.88,
  });

  const flagCount = [
    flags.errorRateFlagged,
    flags.latencyFlagged,
    flags.coherenceFlagged,
    flags.cascadeFlagged,
    flags.personaDriftFlagged,
  ].filter(Boolean).length;

  assertEqual(flagCount, 1, 'single flag');
});

test('Identify MAJOR: multiple metrics degraded', () => {
  const { consciousness } = MOLLY_BASELINE;
  const flags = flagDeviations({
    errorRate: consciousness.healthyErrorRate * 5,
    latency: consciousness.healthyLatency * 2.8,
    coherence: consciousness.healthyCoherence - 0.35,
    cascadeWindows: 7,
    personaAlignment: 0.55,
  });

  const flagCount = [
    flags.errorRateFlagged,
    flags.latencyFlagged,
    flags.coherenceFlagged,
    flags.cascadeFlagged,
    flags.personaDriftFlagged,
  ].filter(Boolean).length;

  assertGreaterThan(
    flagCount,
    2,
    'major issue should have multiple flags'
  );
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TEST SUMMARY');
console.log('═══════════════════════════════════════════════════════════\n');

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;

console.log(`Total Tests: ${results.length}`);
console.log(`Passed: ${passed} ✓`);
console.log(`Failed: ${failed} ✗\n`);

if (failed > 0) {
  console.log('Failed Tests:');
  results
    .filter((r) => !r.passed)
    .forEach((r) => {
      console.log(`  ✗ ${r.name}`);
      if (r.error) console.log(`    ${r.error}`);
    });
}

console.log('\n═══════════════════════════════════════════════════════════\n');

if (failed === 0) {
  console.log('🎯 All validation tests passed! Diagnostic engine is ready.\n');
  process.exit(0);
} else {
  console.log(
    `⚠️  ${failed} test(s) failed. Review errors above.\n`
  );
  process.exit(1);
}
