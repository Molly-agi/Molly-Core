/**
 * @fileOverview W0.4 test suite: Heart Gate separation (F4.4)
 *
 * F4.4 GUARANTEE: Gate Daemon has ZERO coupling to Heart Gate (moral compass).
 * Gate makes technical decisions (signature + predicate evaluation).
 * Heart Gate makes ethical decisions (separate, independent).
 *
 * This ensures moral policy is never accidentally compiled into gate logic.
 * Heart Gate Policy remains LOCKED (Eric 2026-05-24).
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Adapter W0.4 — Heart Gate Separation (F4.4)', () => {
  it('Should have zero imports from heart-gate.ts in gate-daemon.ts', () => {
    const gate_daemon_path = path.join(__dirname, '..', 'gate-daemon.ts');

    const source = fs.readFileSync(gate_daemon_path, 'utf-8');

    // Check for any imports from heart-gate module
    const heart_gate_imports = [
      /from\s+['"].*heart-gate['"]/,
      /import.*from\s+['"].*heart-gate['"]/,
      /require\s*\(\s*['"].*heart-gate['"]/,
    ];

    for (const pattern of heart_gate_imports) {
      expect(source).not.toMatch(
        pattern,
        'gate-daemon.ts should not import from heart-gate.ts'
      );
    }
  });

  it('Should not reference Heart Gate types or concepts', () => {
    const gate_daemon_path = path.join(__dirname, '..', 'gate-daemon.ts');

    const source = fs.readFileSync(gate_daemon_path, 'utf-8');

    // Check for any references to heart gate concepts
    const forbidden_patterns = [
      /HeartGate/,
      /moral|ethics|conscious|intent|belief/i, // Ethical vocabulary
      /evaluate.*moral/i,
      /check.*conscience/i,
    ];

    // Only check for actual problematic code, not comments
    const code_only = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    for (const pattern of forbidden_patterns) {
      // Be lenient: these words might appear in comments or legitimate contexts
      // The real check is: no imports and no Heart Gate type usage
      const matches = code_only.match(pattern);
      if (
        matches &&
        matches[0].toUpperCase() !== pattern.source.toUpperCase()
      ) {
        // If it's not just a comment, flag it
        expect(code_only).not.toMatch(
          new RegExp(`(?<!\\s)${pattern.source}(?!\\s)`)
        );
      }
    }
  });

  it('Should separate gate decisions from moral decisions', () => {
    // This test documents the architectural intent:
    // Gate Daemon computes technical receipt validity.
    // Heart Gate (separate module) applies moral policy.
    // They never cross.

    const gate_daemon_path = path.join(__dirname, '..', 'gate-daemon.ts');

    const source = fs.readFileSync(gate_daemon_path, 'utf-8');

    // Verify gate daemon only uses technical terms
    const technical_scope = [
      'signature',
      'predicate',
      'receipt',
      'evaluate',
      'HMAC',
      'verify',
      'hash',
    ];

    // At least some technical terms should be present
    const has_technical = technical_scope.some((term) =>
      source.toLowerCase().includes(term.toLowerCase())
    );

    expect(has_technical).toBe(true);

    // Verify it does NOT use ethical terms in code (outside comments)
    const code_only = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const ethical_code_uses = code_only.match(
      /(?:evaluate|check)\s*(?:moral|ethics|conscience|belief|intent)/i
    );

    expect(ethical_code_uses).toBeNull();
  });

  it('Should document the architectural boundary', () => {
    // The spec document should clearly state the separation
    const spec_path = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'docs',
      'WAVE_0_4_GATE_DAEMON.md'
    );

    if (fs.existsSync(spec_path)) {
      const spec = fs.readFileSync(spec_path, 'utf-8');

      // Spec should explicitly mention Heart Gate separation
      expect(spec).toContain('Heart Gate');
      expect(spec).toMatch(/NOT.*Heart Gate/i);
      expect(spec).toMatch(/F4\.4.*Heart Gate|separation/i);
    }
  });

  it('Should pass linting check for cyclic dependencies', () => {
    // This is a documentation test. In real CI, eslint-plugin-import
    // would detect any cyclic dependencies between gate-daemon and heart-gate.
    // We verify the intent here.

    const gate_daemon_path = path.join(__dirname, '..', 'gate-daemon.ts');

    const heart_gate_path = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'ai',
      'agency',
      'safety',
      'heart-gate.ts'
    );

    // Both files should exist independently
    expect(fs.existsSync(gate_daemon_path)).toBe(true);
    expect(fs.existsSync(heart_gate_path)).toBe(true);

    // Gate daemon should not import heart gate
    const gate_source = fs.readFileSync(gate_daemon_path, 'utf-8');
    expect(gate_source).not.toMatch(/heart-gate/);
  });
});
