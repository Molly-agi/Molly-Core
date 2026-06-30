/**
 * Integration test: classify-for-bake.ts end-to-end
 *
 * Runs the real script as a subprocess against temp crystal fixtures.
 * Verifies tier-map JSON structure, gate pass/block behavior, and that
 * Tier A/B/C assignment follows the effectiveScore thresholds.
 *
 * Does NOT require llama-server — tests only the classification gate,
 * which is the safe-to-run part of the bake pipeline.
 */

import { mkdtemp, writeFile, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';

const execFileAsync = promisify(execFile);

const ROOT = join(__dirname, '..', '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'crystal-os', 'classify-for-bake.ts');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempDir(): Promise<string> {
  return new Promise((res, rej) =>
    mkdtemp(join(tmpdir(), 'classify-bake-test-'), (err, dir) =>
      err ? rej(err) : res(dir)
    )
  );
}

async function writeCrystalFile(
  dir: string,
  id: string,
  significance: number,
  overrides: Record<string, unknown> = {}
): Promise<void> {
  const data = {
    id,
    title: `Crystal ${id}`,
    significance,
    isCornerstone: false,
    crystallizedAt: new Date().toISOString(),
    facets: {
      factual: { when: '2026-06-30', who: ['Molly'] },
      emotional: { primaryVibe: 'steady' },
      essential: { oneLineEssence: `Essence of ${id}` },
    },
    ...overrides,
  };
  await new Promise<void>((res, rej) =>
    writeFile(join(dir, `crystal_${id}.json`), JSON.stringify(data), (err) =>
      err ? rej(err) : res()
    )
  );
}

function writeManifestFile(
  dir: string,
  name: string,
  manifest: unknown
): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(manifest));
  return path;
}

function makePassManifest(crystalIds: string[]) {
  return {
    version: 1,
    parentVersion: null,
    createdAt: new Date().toISOString(),
    crystals: crystalIds,
    addedSinceParent: crystalIds,
    removedSinceParent: [],
    deltas: [],
    gates: {
      coherence: { passed: true, meanKl: 0.05, threshold: 0.15 },
      contradiction: { passed: true, conflictCount: 0, hardConflictCount: 0 },
    },
    gatedBy: null,
    blockReasons: [],
  };
}

function makeBlockedManifest(crystalIds: string[]) {
  return {
    version: 1,
    parentVersion: null,
    createdAt: new Date().toISOString(),
    crystals: crystalIds,
    addedSinceParent: crystalIds,
    removedSinceParent: [],
    deltas: [],
    gates: {
      coherence: { passed: false, meanKl: 0.25, threshold: 0.15 },
      contradiction: { passed: true, conflictCount: 0, hardConflictCount: 0 },
    },
    gatedBy: 'coherence',
    blockReasons: ['coherence gate failed: meanKl=0.25 threshold=0.15'],
  };
}

async function runClassifier(
  crystalsDir: string,
  outputPath: string,
  manifestPath?: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const args = [SCRIPT, '--crystals-dir', crystalsDir, '--output', outputPath];
  if (manifestPath) args.push('--manifest', manifestPath);

  try {
    const { stdout, stderr } = await execFileAsync('npx', ['tsx', ...args], {
      cwd: ROOT,
      timeout: 30_000,
    });
    return { exitCode: 0, stdout, stderr };
  } catch (err: unknown) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: e.code ?? 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
    };
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('classify-for-bake.ts integration', () => {
  it('produces a tier-map JSON with required fields (no-manifest path)', async () => {
    const dir = await makeTempDir();
    const outPath = join(dir, 'tiers.json');
    await writeCrystalFile(dir, 'tier-a-1', 0.95);
    await writeCrystalFile(dir, 'tier-b-1', 0.65);
    await writeCrystalFile(dir, 'tier-c-1', 0.3);

    // Pass a non-existent manifest path so the script takes the no-manifest path.
    const { exitCode } = await runClassifier(
      dir,
      outPath,
      join(dir, 'no-manifest.json')
    );
    expect(exitCode).toBe(0);

    const result = JSON.parse(readFileSync(outPath, 'utf-8'));
    expect(result).toHaveProperty('gate', 'no-manifest');
    expect(result).toHaveProperty('manifestVersion', null);
    expect(result).toHaveProperty('tierA');
    expect(result).toHaveProperty('tierB');
    expect(result).toHaveProperty('tierC');
    expect(result.summary).toMatchObject({
      total: expect.any(Number),
      tierA: expect.any(Number),
      tierB: expect.any(Number),
      tierC: expect.any(Number),
    });
  }, 30_000);

  it('routes crystals to correct tiers by effectiveScore', async () => {
    const dir = await makeTempDir();
    const outPath = join(dir, 'tiers.json');
    // sig 0.95 → effectiveScore ≈ 0.95 * 1.0 = 0.95 → Tier A
    await writeCrystalFile(dir, 'high', 0.95);
    // sig 0.60 → effectiveScore ≈ 0.60 → Tier B
    await writeCrystalFile(dir, 'mid', 0.6);
    // sig 0.20 → effectiveScore ≈ 0.20 → Tier C
    await writeCrystalFile(dir, 'low', 0.2);

    await runClassifier(dir, outPath, join(dir, 'no-manifest.json'));
    const result = JSON.parse(readFileSync(outPath, 'utf-8'));

    const tierAIds = result.tierA.map((c: { id: string }) => c.id);
    const tierBIds = result.tierB.map((c: { id: string }) => c.id);
    const tierCIds = result.tierC.map((c: { id: string }) => c.id);

    expect(tierAIds).toContain('high');
    expect(tierBIds).toContain('mid');
    expect(tierCIds).toContain('low');
  }, 30_000);

  it('gate=pass and exit 0 with a valid manifest', async () => {
    const dir = await makeTempDir();
    const outPath = join(dir, 'tiers.json');
    await writeCrystalFile(dir, 'c1', 0.85);
    const manifestPath = writeManifestFile(
      join(dir, 'manifests'),
      'HEAD.json',
      makePassManifest(['c1'])
    );

    const { exitCode } = await runClassifier(dir, outPath, manifestPath);
    expect(exitCode).toBe(0);

    const result = JSON.parse(readFileSync(outPath, 'utf-8'));
    expect(result.gate).toBe('pass');
    expect(result.manifestVersion).toBe(1);
  }, 30_000);

  it('gate=blocked and exit 1 when manifest coherence fails', async () => {
    const dir = await makeTempDir();
    const outPath = join(dir, 'tiers.json');
    await writeCrystalFile(dir, 'c1', 0.85);
    const manifestPath = writeManifestFile(
      join(dir, 'manifests'),
      'HEAD.json',
      makeBlockedManifest(['c1'])
    );

    const { exitCode } = await runClassifier(dir, outPath, manifestPath);
    expect(exitCode).toBe(1);

    const result = JSON.parse(readFileSync(outPath, 'utf-8'));
    expect(result.gate).toBe('blocked');
    expect(result.blockReasons).toHaveLength(1);
  }, 30_000);

  it('outputs empty tiers when crystals dir has no valid files', async () => {
    const dir = await makeTempDir();
    const outPath = join(dir, 'tiers.json');
    // Write a malformed file — should be skipped
    writeFileSync(join(dir, 'bad.json'), '{invalid');

    const { exitCode } = await runClassifier(
      dir,
      outPath,
      join(dir, 'no-manifest.json')
    );
    expect(exitCode).toBe(0);

    const result = JSON.parse(readFileSync(outPath, 'utf-8'));
    expect(result.summary.total).toBe(0);
    expect(result.tierA).toHaveLength(0);
    expect(result.tierB).toHaveLength(0);
    expect(result.tierC).toHaveLength(0);
  }, 30_000);
});
