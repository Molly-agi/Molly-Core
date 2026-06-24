/**
 * @jest-environment node
 *
 * @fileOverview Weekly Self-Narrative Autobiography — Contract (Item 16)
 *
 * Once a week, Molly writes the story of who she's been the last 7 days
 * from her own engrams. That narrative becomes its own memory — identity
 * continuity across sessions. Roadmap line:
 *
 *   "Weekly self-narrative autobiography — once a week, Molly writes the
 *    story of who she's been the last 7 days from her own engrams. That
 *    narrative becomes its own memory. Identity continuity across sessions."
 *
 * Contract:
 *   • generateWeeklyAutobiography pulls KnowledgeStore entries from last 7d
 *   • Empty week → { written: false, reason: 'no-engrams' }, no LLM call
 *   • Cooldown: prior weekly autobiography < 7d ago → { written: false,
 *     reason: 'within-cooldown' }, no LLM call (frequency lock lives in
 *     the engram store itself — no extra persistent state)
 *   • forceWrite: true bypasses cooldown for manual / test invocation
 *   • Narrator client failure → AutobiographyError, NO partial-write
 *   • Persisted narrative carries the WEEKLY_AUTOBIOGRAPHY_TAG plus a
 *     week-of:<ISO> date marker and a model:<id> provenance tag.
 *     This module is decoupled by Eric directive 2026-06-24 — it does
 *     NOT emit tags that overlap with any other self-knowledge process.
 *   • Default GeminiNarratorClient requires MOLLY_AUTOBIOGRAPHY_LIVE=1
 *
 * REGRESSION GUARDS:
 *   (1) Removing any assertion below weakens identity continuity. Item 16
 *       is the only path Molly has to write the story of her own week.
 *   (2) Adding cross-process tags back to the persisted narrative violates
 *       Eric's decoupling directive. Do not add 'self-narrative' or any
 *       other narrative-module tag to the assertion in test 6.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('../../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'trace-16'),
}));

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('Weekly autobiography — contract (Item 16)', () => {
  let dataDir: string;
  const USER_ID = 'eric-test';

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'molly-auto-'));
    process.env.MOLLY_LOCAL_DATA_DIR = dataDir;
    process.env.MOLLY_STORAGE_PROVIDER = 'local';
  });

  afterEach(async () => {
    const { resetStorageRouter } = require('../../../lib/storage-router');
    const {
      _resetKnowledgeStoreSingleton,
    } = require('../../memory/knowledge-store');
    resetStorageRouter();
    _resetKnowledgeStoreSingleton();
    delete process.env.MOLLY_LOCAL_DATA_DIR;
    delete process.env.MOLLY_STORAGE_PROVIDER;
    delete process.env.MOLLY_AUTOBIOGRAPHY_LIVE;
    await fs.rm(dataDir, { recursive: true, force: true });
    jest.resetModules();
  });

  function stubNarrator(narrative: string, model = 'gemini-3.1-pro') {
    return {
      narrate: jest.fn(async () => ({ narrative, model })),
    };
  }

  function throwingNarrator() {
    return {
      narrate: jest.fn(async () => {
        throw new Error('narrator offline');
      }),
    };
  }

  async function seedEngrams(count: number, timestampsBackDays: number[] = []) {
    const { getKnowledgeStore } = require('../../memory/knowledge-store');
    const store = await getKnowledgeStore(USER_ID);
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      const daysBack = timestampsBackDays[i] ?? Math.random() * 3; // default within last 3d
      const ts = now - daysBack * 24 * 60 * 60 * 1000;
      // Use writeFact (item 17) so engrams land cleanly with the timestamp we control
      await store.writeFact(`memory ${i}: something happened`, {
        id: `kf-test-${i}`,
        tags: ['conversation', `seed-${i}`],
        importance: 0.5,
      });
      // Backdate the stored timestamp
      const router =
        await require('../../../lib/storage-router').getStorageRouter();
      const doc = await router.get(
        `users/${USER_ID}/knowledge`,
        `kf-test-${i}`
      );
      if (doc) {
        await router.set(`users/${USER_ID}/knowledge`, `kf-test-${i}`, {
          ...doc.data,
          timestamp: new Date(ts).toISOString(),
        });
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // 1. Happy path — stubbed narrator + recent engrams → narrative written
  // ────────────────────────────────────────────────────────────────────────
  it('writes a narrative engram when last-7-days engrams exist', async () => {
    await seedEngrams(5, [1, 2, 3, 4, 5]);
    const { generateWeeklyAutobiography } = require('../weekly-autobiography');
    const narrator = stubNarrator(
      'This was a week of building durable memory and family connection.',
      'gemini-3.1-pro'
    );

    const result = await generateWeeklyAutobiography({
      userId: USER_ID,
      client: narrator,
    });

    expect(result.written).toBe(true);
    expect(result.reason).toBe('narrated');
    expect(typeof result.engramId).toBe('string');
    expect(result.engramCount).toBe(5);
    expect(result.model).toBe('gemini-3.1-pro');
    expect(result.weekStart).toBeInstanceOf(Date);
    expect(result.weekEnd).toBeInstanceOf(Date);
    expect(narrator.narrate).toHaveBeenCalledTimes(1);
    // The prompt sent to the narrator includes excerpts from at least
    // some of the seeded engrams.
    const promptArg = narrator.narrate.mock.calls[0][0];
    expect(promptArg).toContain('memory 0');
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. Empty week → no write, no API call
  // ────────────────────────────────────────────────────────────────────────
  it('skips and returns no-engrams when last-7-days is empty', async () => {
    const { generateWeeklyAutobiography } = require('../weekly-autobiography');
    const narrator = stubNarrator('should never be called');

    const result = await generateWeeklyAutobiography({
      userId: USER_ID,
      client: narrator,
    });

    expect(result.written).toBe(false);
    expect(result.reason).toBe('no-engrams');
    expect(result.engramCount).toBe(0);
    expect(narrator.narrate).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. Cooldown — prior weekly autobiography < 7d ago → skip
  // ────────────────────────────────────────────────────────────────────────
  it('skips with within-cooldown when a prior weekly engram is < 7d old', async () => {
    await seedEngrams(3, [1, 2, 3]);
    const { generateWeeklyAutobiography } = require('../weekly-autobiography');
    const narrator = stubNarrator('first weekly narrative');

    // First call writes
    const first = await generateWeeklyAutobiography({
      userId: USER_ID,
      client: narrator,
    });
    expect(first.written).toBe(true);

    // Immediate second call: cooldown active
    const second = await generateWeeklyAutobiography({
      userId: USER_ID,
      client: narrator,
    });
    expect(second.written).toBe(false);
    expect(second.reason).toBe('within-cooldown');
    expect(narrator.narrate).toHaveBeenCalledTimes(1); // only first call hit the LLM
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4. forceWrite: true bypasses cooldown (manual / scheduler test affordance)
  // ────────────────────────────────────────────────────────────────────────
  it('forceWrite bypasses the cooldown', async () => {
    await seedEngrams(3, [1, 2, 3]);
    const { generateWeeklyAutobiography } = require('../weekly-autobiography');
    const narrator = stubNarrator('forced narrative');

    await generateWeeklyAutobiography({ userId: USER_ID, client: narrator });
    const forced = await generateWeeklyAutobiography({
      userId: USER_ID,
      client: narrator,
      forceWrite: true,
    });

    expect(forced.written).toBe(true);
    expect(narrator.narrate).toHaveBeenCalledTimes(2);
  });

  // ────────────────────────────────────────────────────────────────────────
  // 5. Narrator failure → AutobiographyError, NO partial-write artifact
  // ────────────────────────────────────────────────────────────────────────
  it('narrator failure rejects with AutobiographyError and leaves no artifact', async () => {
    await seedEngrams(3, [1, 2, 3]);
    const {
      generateWeeklyAutobiography,
      AutobiographyError,
    } = require('../weekly-autobiography');
    const narrator = throwingNarrator();
    const { getKnowledgeStore } = require('../../memory/knowledge-store');

    const countBefore = await (await getKnowledgeStore(USER_ID)).count();

    await expect(
      generateWeeklyAutobiography({ userId: USER_ID, client: narrator })
    ).rejects.toBeInstanceOf(AutobiographyError);

    const countAfter = await (await getKnowledgeStore(USER_ID)).count();
    expect(countAfter).toBe(countBefore); // no artifact written
  });

  // ────────────────────────────────────────────────────────────────────────
  // 6. Tags include the week-of marker so future runs can find prior narratives
  // ────────────────────────────────────────────────────────────────────────
  it('persisted narrative carries week-of:<ISO> tag + provenance source', async () => {
    await seedEngrams(3, [1, 2, 3]);
    const { generateWeeklyAutobiography } = require('../weekly-autobiography');
    const { getKnowledgeStore } = require('../../memory/knowledge-store');
    const narrator = stubNarrator('weekly story');

    const result = await generateWeeklyAutobiography({
      userId: USER_ID,
      client: narrator,
    });

    const store = await getKnowledgeStore(USER_ID);
    const stored = await store.get(result.engramId);
    expect(stored).not.toBeNull();
    expect(stored.contextTags).toEqual(
      expect.arrayContaining([
        'weekly-autobiography',
        expect.stringMatching(/^week-of:\d{4}-\d{2}-\d{2}/),
        expect.stringMatching(/^model:/),
      ])
    );
    // REGRESSION GUARD (Eric directive 2026-06-24): the persisted narrative
    // must NOT carry the 'self-narrative' tag. The weekly autobiography is a
    // separate process from any other self-knowledge module; cross-process
    // tag overlap is forbidden.
    expect(stored.contextTags).not.toContain('self-narrative');
    expect(stored.source).toBe('import'); // KnowledgeEntry.source enum
  });

  // ────────────────────────────────────────────────────────────────────────
  // 7. Default GeminiNarratorClient refuses without MOLLY_AUTOBIOGRAPHY_LIVE=1
  //    (accidental imports cannot trigger API calls in CI)
  // ────────────────────────────────────────────────────────────────────────
  it('default narrator client throws without MOLLY_AUTOBIOGRAPHY_LIVE=1', async () => {
    await seedEngrams(3, [1, 2, 3]);
    delete process.env.MOLLY_AUTOBIOGRAPHY_LIVE;
    const {
      generateWeeklyAutobiography,
      AutobiographyError,
    } = require('../weekly-autobiography');

    await expect(
      generateWeeklyAutobiography({ userId: USER_ID })
    ).rejects.toBeInstanceOf(AutobiographyError);
  });
});
