/**
 * Item 2 — broaden brain.remember() coverage.
 *
 * Locking contract: each new significant-event site and each provenance
 * retrofit must keep its wire to brain.remember() in source. Pure
 * static-shape regex over the file text — same pattern accepted on
 * PR #253. Cheap to run, breaks loudly if a line is silently deleted.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('Item 2 — broaden remember() coverage', () => {
  describe('new significant-event sites (5)', () => {
    it('heart-gate writes on each alignment flip (both directions)', () => {
      const src = read('src/ai/agency/safety/heart-gate.ts');
      expect(src).toMatch(/heart-gate:allow-to-block/);
      expect(src).toMatch(/heart-gate:block-to-allow/);
      expect(src).toMatch(/getNeuralBrain\(\)\.remember\(/);
    });

    it('circuit-breaker writes on trip (single edge, not recover)', () => {
      const src = read('src/ai/tools/circuit-breaker.ts');
      expect(src).toMatch(/tool:circuit-breaker:trip/);
      expect(src).toMatch(/getNeuralBrain\(\)\.remember\(/);
      // Negative: must NOT write on recover — keeps noise floor low.
      expect(src).not.toMatch(/circuit-breaker:recover/);
    });

    it('initiative-engine writes on create (template + custom) and complete', () => {
      const src = read('src/ai/agency/planning/initiative-engine.ts');
      expect(src).toMatch(/molly:initiative-create/);
      expect(src).toMatch(/molly:initiative-complete/);
      // Both create paths (activate, custom) and the execution-record path
      // must invoke the shared remember-helper. Counting the helper call sites
      // — not the underlying remember() — is what locks the three wire points.
      const calls = src.match(/rememberInitiativeEvent\(/g) || [];
      expect(calls.length).toBeGreaterThanOrEqual(4); // 1 definition + 3 call sites
    });

    it('theory-of-mind writes on learnKnowledge (canonical major update)', () => {
      const src = read('src/ai/tools/theory-of-mind.ts');
      expect(src).toMatch(/molly:theory-of-mind/);
      expect(src).toMatch(/getNeuralBrain\(\)\.remember\(/);
    });

    it('value-drift-monitor writes on threshold crossing', () => {
      const src = read('src/ai/agency/cognition/value-drift-monitor.ts');
      expect(src).toMatch(/molly:value-drift/);
      expect(src).toMatch(/getNeuralBrain\(\)\.remember\(/);
    });
  });

  describe('provenance retrofits on existing remember() callers (3)', () => {
    it('direct-communion stamps `from` as provenance.source', () => {
      const src = read('src/ai/consciousness/direct-communion.ts');
      expect(src).toMatch(/provenance:\s*\{\s*source:\s*from\s*\}/);
    });

    it('voice-command-processor stamps speaker (input) and molly (output)', () => {
      const src = read('src/ai/tools/voice-command-processor.ts');
      expect(src).toMatch(/provenance:\s*\{\s*source:\s*speaker\s*\}/);
      expect(src).toMatch(/provenance:\s*\{\s*source:\s*['"]molly['"]\s*\}/);
    });

    it('conversational-chat stamps speaker (input) and molly (output)', () => {
      const src = read('src/ai/flows/conversational-chat.ts');
      expect(src).toMatch(/provenance:\s*\{\s*source:\s*speaker\s*\}/);
      expect(src).toMatch(/provenance:\s*\{\s*source:\s*['"]molly['"]\s*\}/);
    });
  });
});
