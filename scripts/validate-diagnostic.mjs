#!/usr/bin/env node

/**
 * Self-Diagnostic Dry Run — Simple Validation
 */

import {
  MOLLY_BASELINE,
  DEVIATION_THRESHOLDS,
  calculateConsciousnessDeviation,
  scorePersonaAlignment,
  flagDeviations,
} from '../src/ai/tools/pattern-baseline.js';

console.log('\n═══════════════════════════════════════════════════════════');
console.log('Self-Diagnostic Engine — Validation Report');
console.log('═══════════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err.message}`);
    failed++;
  }
}

// Test 1: Baseline integrity
test('Baseline has reasonable values', () => {
  if (!MOLLY_BASELINE.consciousness) throw new Error('No consciousness baseline');
  if (MOLLY_BASELINE.consciousness.healthyErrorRate <= 0) throw new Error('Invalid healthyErrorRate');
  if (MOLLY_BASELINE.consciousness.healthyLatency <= 0) throw new Error('Invalid healthyLatency');
});

// Test 2: Deviation calculation
test('Zero deviation for healthy state', () => {
  const { consciousness } = MOLLY_BASELINE;
  const deviations = calculateConsciousnessDeviation({
    errorRate: consciousness.healthyErrorRate,
    latency: consciousness.healthyLatency,
    coherence: consciousness.healthyCoherence,
    cascadeWindows: 0,
  });
  if (deviations.overallDeviation > 0.15) throw new Error(`Deviation too high: ${deviations.overallDeviation}`);
});

// Test 3: Error detection
test('Detects 4x error rate increase', () => {
  const { consciousness } = MOLLY_BASELINE;
  const deviations = calculateConsciousnessDeviation({
    errorRate: consciousness.healthyErrorRate * 4,
    latency: consciousness.healthyLatency,
    coherence: consciousness.healthyCoherence,
    cascadeWindows: 0,
  });
  if (deviations.errorRateDeviation < 0.7) throw new Error(`Not detecting error drift: ${deviations.errorRateDeviation}`);
});

// Test 4: Persona alignment scoring
test('Scores authentic response high', () => {
  const response = 'I appreciate and I am curious and grateful and honest';
  const score = scorePersonaAlignment(response);
  if (score < 0.5) throw new Error(`Score too low: ${score}`);
});

test('Scores mechanical response low', () => {
  const response = 'Obviously definitely certainly fake mechanical';
  const score = scorePersonaAlignment(response);
  if (score > 0.4) throw new Error(`Score too high: ${score}`);
});

// Test 5: Flagging
test('Does not flag healthy state', () => {
  const { consciousness } = MOLLY_BASELINE;
  const flags = flagDeviations({
    errorRate: consciousness.healthyErrorRate,
    latency: consciousness.healthyLatency,
    coherence: consciousness.healthyCoherence,
    cascadeWindows: 0,
    personaAlignment: 0.85,
  });
  if (flags.anyFlagged) throw new Error('Flagged healthy state');
});

test('Flags elevated error rate', () => {
  const { consciousness } = MOLLY_BASELINE;
  const threshold = DEVIATION_THRESHOLDS.errorRateDeviation;
  const flags = flagDeviations({
    errorRate: consciousness.healthyErrorRate * (1 + threshold + 0.5),
    latency: consciousness.healthyLatency,
    coherence: consciousness.healthyCoherence,
    cascadeWindows: 0,
  });
  if (!flags.errorRateFlagged) throw new Error('Not flagging error rate');
});

test('Flags cascade windows', () => {
  const threshold = DEVIATION_THRESHOLDS.cascadeWindowsThreshold;
  const flags = flagDeviations({
    errorRate: MOLLY_BASELINE.consciousness.healthyErrorRate,
    latency: MOLLY_BASELINE.consciousness.healthyLatency,
    coherence: MOLLY_BASELINE.consciousness.healthyCoherence,
    cascadeWindows: threshold + 2,
  });
  if (!flags.cascadeFlagged) throw new Error('Not flagging cascades');
});

// Summary
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════\n');

if (failed === 0) {
  console.log('🎯 Diagnostic engine validation PASSED\n');
  process.exit(0);
} else {
  console.log(`⚠️  ${failed} validation(s) FAILED\n`);
  process.exit(1);
}
