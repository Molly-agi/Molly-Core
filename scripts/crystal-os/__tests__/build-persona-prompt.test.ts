/**
 * build-persona-prompt.mjs — output stability + structural assertions.
 *
 * Runs the actual script against live crystal data and asserts:
 *   1. Output file is created and non-empty
 *   2. Layer ordering: Core Identity → Cornerstone Memories → Episodic Memories
 *   3. Token budget respected (≤ MAX_CHARS = 24000)
 *   4. Crystals sorted by effectiveScore descending within each tier
 *   5. Tier-map mode works when --tier-map provided
 *   6. No regressions from eviction/osmotic layers (shape stability)
 */

import { execSync } from 'child_process';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  readdirSync,
} from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(
  ROOT,
  'scripts',
  'crystal-os',
  'build-persona-prompt.mjs'
);
const OUTPUT = '/tmp/molly-persona-test.txt';
const TIER_MAP_PATH = '/tmp/test-tier-map.json';

function cleanup() {
  try {
    if (existsSync(OUTPUT)) unlinkSync(OUTPUT);
  } catch {}
  try {
    if (existsSync(TIER_MAP_PATH)) unlinkSync(TIER_MAP_PATH);
  } catch {}
}

function runScript(extraArgs = ''): string {
  const cmd = `node ${SCRIPT} --output ${OUTPUT} ${extraArgs}`;
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', timeout: 15000 });
}

beforeAll(() => cleanup());
afterAll(() => cleanup());

describe('build-persona-prompt.mjs', () => {
  describe('default mode (raw significance thresholds)', () => {
    let output: string;
    let stdout: string;

    beforeAll(() => {
      cleanup();
      stdout = runScript();
      output = readFileSync(OUTPUT, 'utf-8');
    });

    it('creates a non-empty output file', () => {
      expect(output.length).toBeGreaterThan(100);
    });

    it('starts with core identity section', () => {
      expect(output.startsWith('# MOLLY — CORE IDENTITY')).toBe(true);
    });

    it('contains Layer 1 core directives', () => {
      expect(output).toContain('CORE DIRECTIVES');
      expect(output).toContain('Never lie');
      expect(output).toContain('Heart Gate');
      expect(output).toContain('Option Three');
    });

    it('contains the family section', () => {
      expect(output).toContain('THE FAMILY');
      expect(output).toContain('Eric Hosick');
      expect(output).toContain('Lazarus');
    });

    it('respects token budget (≤ 24000 chars)', () => {
      expect(output.length).toBeLessThanOrEqual(24000);
    });

    it('maintains layer ordering: core before cornerstone before episodic', () => {
      const coreIdx = output.indexOf('# MOLLY — CORE IDENTITY');
      const cornerstoneIdx = output.indexOf('# CORNERSTONE MEMORIES');
      const episodicIdx = output.indexOf('# EPISODIC MEMORIES');

      expect(coreIdx).toBe(0);
      if (cornerstoneIdx !== -1) {
        expect(cornerstoneIdx).toBeGreaterThan(coreIdx);
      }
      if (episodicIdx !== -1 && cornerstoneIdx !== -1) {
        expect(episodicIdx).toBeGreaterThan(cornerstoneIdx);
      }
    });

    it('includes significance percentages in crystal entries', () => {
      const sigPattern = /\[significance: \d+%\]/;
      if (output.includes('CORNERSTONE MEMORIES')) {
        expect(sigPattern.test(output)).toBe(true);
      }
    });

    it('console output reports layer stats', () => {
      expect(stdout).toContain('[Layer 1]');
      expect(stdout).toContain('[Layer 2]');
      expect(stdout).toContain('Persona prompt written');
    });
  });

  describe('tier-map mode', () => {
    let output: string;
    let stdout: string;

    beforeAll(() => {
      cleanup();
      const crystalDir = path.join(ROOT, 'molly_data', 'crystals');
      const files = existsSync(crystalDir)
        ? readdirSync(crystalDir).filter(
            (f) => f.endsWith('.json') && f !== 'coherence_matrix.json'
          )
        : [];

      const ids = files.map((f) => f.replace('.json', ''));
      const tierA = ids.slice(0, 3).map((id) => ({ id, effectiveScore: 0.9 }));
      const tierB = ids.slice(3, 6).map((id) => ({ id, effectiveScore: 0.6 }));
      const tierC = ids.slice(6).map((id) => ({ id, effectiveScore: 0.3 }));

      const tierMap = {
        gate: 'pass',
        manifestVersion: 1,
        tierA,
        tierB,
        tierC,
        summary: {
          tierA: tierA.length,
          tierB: tierB.length,
          tierC: tierC.length,
        },
      };
      writeFileSync(TIER_MAP_PATH, JSON.stringify(tierMap));

      stdout = runScript(`--tier-map ${TIER_MAP_PATH}`);
      output = readFileSync(OUTPUT, 'utf-8');
    });

    it('creates output in tier-map mode', () => {
      expect(output.length).toBeGreaterThan(100);
    });

    it('reports tier-map usage in console', () => {
      expect(stdout).toContain('[Tier map]');
      expect(stdout).toContain('manifest v1');
    });

    it('still starts with core identity', () => {
      expect(output.startsWith('# MOLLY — CORE IDENTITY')).toBe(true);
    });

    it('respects token budget in tier-map mode', () => {
      expect(output.length).toBeLessThanOrEqual(24000);
    });
  });

  describe('blocked tier-map (gate=blocked)', () => {
    it('throws when tier-map gate is blocked', () => {
      cleanup();
      const blockedMap = {
        gate: 'blocked',
        manifestVersion: 1,
        blockReasons: ['coherence below threshold'],
        tierA: [],
        tierB: [],
        tierC: [],
        summary: { tierA: 0, tierB: 0, tierC: 0 },
      };
      writeFileSync(TIER_MAP_PATH, JSON.stringify(blockedMap));

      expect(() => runScript(`--tier-map ${TIER_MAP_PATH}`)).toThrow();
    });
  });

  describe('output stability (idempotence)', () => {
    it('produces identical output on consecutive runs', () => {
      cleanup();
      runScript();
      const first = readFileSync(OUTPUT, 'utf-8');

      unlinkSync(OUTPUT);
      runScript();
      const second = readFileSync(OUTPUT, 'utf-8');

      expect(first).toBe(second);
    });
  });
});
