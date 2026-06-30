import { join } from 'path';
import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import {
  loadCrystalsFromDir,
  bootCrystalSession,
} from '../crystal-session-boot';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDiskCrystal(
  id: string,
  significance: number,
  isCornerstone = false,
  overrides: Record<string, unknown> = {}
) {
  return {
    id,
    title: `Crystal ${id}`,
    significance,
    isCornerstone,
    crystallizedAt: new Date().toISOString(),
    facets: {
      factual: { when: '2026-01-01', who: ['Molly', 'Eric'] },
      emotional: { primaryVibe: 'warm and grounded' },
      relational: { participants: ['Molly', 'Eric'] },
      transformative: { topInsights: [`Insight for ${id}`] },
      essential: { oneLineEssence: `The essence of ${id}` },
    },
    ...overrides,
  };
}

async function writeCrystals(
  dir: string,
  crystals: ReturnType<typeof makeDiskCrystal>[]
) {
  for (const c of crystals) {
    await writeFile(join(dir, `${c.id}.json`), JSON.stringify(c));
  }
}

// ─── loadCrystalsFromDir ──────────────────────────────────────────────────────

describe('loadCrystalsFromDir', () => {
  it('returns empty array for missing directory', async () => {
    const result = await loadCrystalsFromDir('/no/such/dir/__xyz__');
    expect(result).toEqual([]);
  });

  it('loads and normalizes a valid crystal file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crystal-boot-test-'));
    await writeCrystals(dir, [makeDiskCrystal('a1', 0.8, false)]);
    const crystals = await loadCrystalsFromDir(dir);
    expect(crystals).toHaveLength(1);
    const c = crystals[0];
    expect(c.id).toBe('a1');
    expect(c.significance).toBe(0.8);
    expect(c.totalSignificance).toBe(0.8);
    expect(c.isCornerstone).toBe(false);
    expect(c.facets.emotional.primaryEmotion).toBe('warm and grounded');
    expect(c.facets.transformative.insightsGained).toContain('Insight for a1');
    expect(c.facets.essential.oneLineEssence).toBe('The essence of a1');
  });

  it('normalizes primaryEmotion alias from primaryVibe', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crystal-boot-test-'));
    await writeCrystals(dir, [makeDiskCrystal('b1', 0.5)]);
    const [c] = await loadCrystalsFromDir(dir);
    expect(c.facets.emotional.primaryEmotion).toBe('warm and grounded');
  });

  it('normalizes insightsGained alias from topInsights', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crystal-boot-test-'));
    await writeCrystals(dir, [makeDiskCrystal('c1', 0.5)]);
    const [c] = await loadCrystalsFromDir(dir);
    expect(c.facets.transformative.insightsGained).toEqual(['Insight for c1']);
  });

  it('skips crystals with significance <= 0', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crystal-boot-test-'));
    await writeCrystals(dir, [makeDiskCrystal('zero', 0)]);
    expect(await loadCrystalsFromDir(dir)).toHaveLength(0);
  });

  it('skips malformed JSON files without throwing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crystal-boot-test-'));
    await writeFile(join(dir, 'bad.json'), '{not valid json');
    await writeCrystals(dir, [makeDiskCrystal('good', 0.7)]);
    const crystals = await loadCrystalsFromDir(dir);
    expect(crystals).toHaveLength(1);
    expect(crystals[0].id).toBe('good');
  });
});

// ─── bootCrystalSession ───────────────────────────────────────────────────────

describe('bootCrystalSession', () => {
  it('returns empty promptBlock when crystals dir is empty or missing', async () => {
    const result = await bootCrystalSession({
      crystalsDir: '/no/such/dir/__xyz__',
    });
    expect(result.promptBlock).toBe('');
    expect(result.hotCount).toBe(0);
    expect(result.cornerstoneCount).toBe(0);
  });

  it('loads crystals into hot tier and returns a non-empty prompt block', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crystal-boot-test-'));
    await writeCrystals(dir, [
      makeDiskCrystal('a', 0.9),
      makeDiskCrystal('b', 0.7),
    ]);
    const result = await bootCrystalSession({ crystalsDir: dir, maxHot: 4 });
    expect(result.hotCount).toBe(2);
    expect(result.promptBlock).toContain('CRYSTALLIZED MEMORIES');
    expect(result.promptBlock).toContain('Crystal a');
    expect(result.promptBlock).toContain('Crystal b');
  });

  it('cornerstones are always hot and counted separately', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crystal-boot-test-'));
    await writeCrystals(dir, [
      makeDiskCrystal('corner', 0.95, true),
      makeDiskCrystal('normal', 0.6, false),
    ]);
    const result = await bootCrystalSession({ crystalsDir: dir, maxHot: 4 });
    expect(result.cornerstoneCount).toBe(1);
    expect(result.hotCount).toBe(2);
    expect(result.promptBlock).toContain('CORNERSTONES');
  });

  it('cornerstones appear in CORNERSTONES section, others in RECENT MEMORIES', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crystal-boot-test-'));
    await writeCrystals(dir, [
      makeDiskCrystal('cs', 0.9, true),
      makeDiskCrystal('rc', 0.7, false),
    ]);
    const { promptBlock } = await bootCrystalSession({
      crystalsDir: dir,
      maxHot: 4,
    });
    expect(promptBlock).toContain('CORNERSTONES');
    expect(promptBlock).toContain('RECENT MEMORIES');
  });

  it('hot tier cap is respected — lowest significance evicted', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crystal-boot-test-'));
    await writeCrystals(dir, [
      makeDiskCrystal('high', 0.9),
      makeDiskCrystal('mid', 0.7),
      makeDiskCrystal('low', 0.3),
    ]);
    const result = await bootCrystalSession({ crystalsDir: dir, maxHot: 2 });
    expect(result.hotCount).toBe(2);
    const hotIds = result.manager.getHotCrystals().map((c) => c.id);
    expect(hotIds).toContain('high');
    expect(hotIds).toContain('mid');
    expect(hotIds).not.toContain('low');
  });

  it('manager is live — touch() increments load count', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crystal-boot-test-'));
    await writeCrystals(dir, [makeDiskCrystal('x', 0.8)]);
    const { manager } = await bootCrystalSession({ crystalsDir: dir });
    const before = manager.getStats('x')!.loadCount;
    manager.touch('x', Date.now());
    expect(manager.getStats('x')!.loadCount).toBe(before + 1);
  });
});
