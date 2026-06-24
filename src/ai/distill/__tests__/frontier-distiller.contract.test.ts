/**
 * @fileOverview Frontier Distillation — Pipe-Only Contract (Item 20)
 *
 * Locks the single-fact verification path:
 *   one frontier query → verified output → KnowledgeStore.writeFact() with
 *   provenance tags → recall finds the fact → engram path untouched.
 *
 * Per Eric's pipe-only directive (Eli brief 2026-06-24): no bulk scrape,
 * no firehose, no mass-query loop. The seam exists and the pipe moves
 * water. Item 18 pattern repeated: ship the ingester + lock, leave the
 * actual frontier-knowledge transfer for later wires.
 *
 * Divergence-from-roadmap note: the roadmap line says "store as crystals."
 * That word predates the two-hemisphere split (item 17). The honest
 * landing pad is the left hemisphere via writeFact() — the same shape
 * item 18's corpus ingester uses. Item-17 isolation contract is reused
 * (no FrontalCortex / Hippocampus / Crystallizer / AutoDream side effects
 * per distilled fact — which would crater working memory if a future
 * scrape ever fires through this seam).
 *
 * REGRESSION GUARD: removing any of these assertions weakens the
 * frontier-distillation pipe to dead-pipe (#268 lesson) or wired-but-
 * starved (whole-brain-roadmap lesson). Do not weaken.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('../../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('Frontier distiller — pipe-only contract (Item 20)', () => {
  let dataDir: string;
  const USER_ID = 'eric-test';

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'molly-distill-'));
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
    delete process.env.MOLLY_FRONTIER_DISTILL_LIVE;
    await fs.rm(dataDir, { recursive: true, force: true });
    jest.resetModules();
  });

  function stubFrontier(answer: string, model = 'gemini-3.1-pro') {
    return {
      ask: jest.fn(async (_query: string) => ({ answer, model })),
    };
  }

  function throwingFrontier() {
    return {
      ask: jest.fn(async (_query: string) => {
        throw new Error('frontier offline');
      }),
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // 1. distillFromFrontier returns the expected metadata shape on success
  // ────────────────────────────────────────────────────────────────────────
  it('returns stored:true with model, queriedAt, charCount on success', async () => {
    const { distillFromFrontier } = require('../frontier-distiller');
    const frontier = stubFrontier(
      'The capital of France is Paris.',
      'gemini-3.1-pro'
    );

    const result = await distillFromFrontier('What is the capital of France?', {
      userId: USER_ID,
      client: frontier,
    });

    expect(result.stored).toBe(true);
    expect(result.model).toBe('gemini-3.1-pro');
    expect(result.queriedAt).toBeInstanceOf(Date);
    expect(result.charCount).toBe('The capital of France is Paris.'.length);
    expect(typeof result.id).toBe('string');
    expect(frontier.ask).toHaveBeenCalledWith('What is the capital of France?');
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. Fact lands in KnowledgeStore with source='import' + content + tags
  // ────────────────────────────────────────────────────────────────────────
  it('persists the distilled fact via writeFact with provenance tags', async () => {
    const { distillFromFrontier } = require('../frontier-distiller');
    const { getKnowledgeStore } = require('../../memory/knowledge-store');

    const frontier = stubFrontier(
      'Water boils at 100C at sea level.',
      'gemini-3.1-pro'
    );
    const result = await distillFromFrontier(
      'At what temperature does water boil?',
      {
        userId: USER_ID,
        client: frontier,
      }
    );

    const store = await getKnowledgeStore(USER_ID);
    const stored = await store.get(result.id);

    expect(stored).not.toBeNull();
    expect(stored.content).toBe('Water boils at 100C at sea level.');
    expect(stored.source).toBe('import');
    expect(stored.contextTags).toEqual(
      expect.arrayContaining([
        'frontier-distill',
        'model:gemini-3.1-pro',
        expect.stringMatching(/^queried:\d{4}-\d{2}-\d{2}/),
      ])
    );
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. The pipe moves water — recall finds the distilled fact
  //    (REGRESSION GUARD: removing fan-out or skipping writeFact makes
  //    distilled knowledge invisible = wired-but-starved repeat)
  // ────────────────────────────────────────────────────────────────────────
  it('persisted fact is retrievable by id (pipe moves water)', async () => {
    const { distillFromFrontier } = require('../frontier-distiller');
    const { getKnowledgeStore } = require('../../memory/knowledge-store');

    const frontier = stubFrontier(
      'Photosynthesis converts CO2 and water into glucose.'
    );
    const result = await distillFromFrontier(
      'Explain photosynthesis briefly.',
      {
        userId: USER_ID,
        client: frontier,
      }
    );

    const store = await getKnowledgeStore(USER_ID);
    const stored = await store.get(result.id);

    expect(stored).not.toBeNull();
    expect(stored.content).toContain('Photosynthesis');
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4. Frontier failure → DistillError, no partial-write artifact
  // ────────────────────────────────────────────────────────────────────────
  it('frontier failure rejects with DistillError and leaves no artifact', async () => {
    const {
      distillFromFrontier,
      DistillError,
    } = require('../frontier-distiller');
    const { getKnowledgeStore } = require('../../memory/knowledge-store');
    const frontier = throwingFrontier();

    await expect(
      distillFromFrontier('any query', { userId: USER_ID, client: frontier })
    ).rejects.toBeInstanceOf(DistillError);

    const store = await getKnowledgeStore(USER_ID);
    expect(store.count()).resolves.toBe(0);
  });

  // ────────────────────────────────────────────────────────────────────────
  // 5. Caller-supplied tags are preserved alongside provenance tags
  //    (lets future callers pin topic/domain without losing provenance)
  // ────────────────────────────────────────────────────────────────────────
  it('preserves caller-supplied tags alongside provenance', async () => {
    const { distillFromFrontier } = require('../frontier-distiller');
    const { getKnowledgeStore } = require('../../memory/knowledge-store');

    const frontier = stubFrontier(
      'Pi is approximately 3.14159.',
      'gemini-3.1-pro'
    );
    const result = await distillFromFrontier('Value of pi?', {
      userId: USER_ID,
      client: frontier,
      tags: ['topic:math', 'difficulty:beginner'],
    });

    const store = await getKnowledgeStore(USER_ID);
    const stored = await store.get(result.id);

    expect(stored!.contextTags).toEqual(
      expect.arrayContaining([
        'frontier-distill',
        'model:gemini-3.1-pro',
        'topic:math',
        'difficulty:beginner',
      ])
    );
  });

  // ────────────────────────────────────────────────────────────────────────
  // 6. Empty / blank frontier response → DistillError, no artifact written
  //    (guards against future model failures returning empty strings;
  //    we never want a zero-content knowledge entry with provenance)
  // ────────────────────────────────────────────────────────────────────────
  it('rejects empty frontier response without writing artifact', async () => {
    const {
      distillFromFrontier,
      DistillError,
    } = require('../frontier-distiller');
    const { getKnowledgeStore } = require('../../memory/knowledge-store');
    const frontier = stubFrontier('   ', 'gemini-3.1-pro');

    await expect(
      distillFromFrontier('blank query', { userId: USER_ID, client: frontier })
    ).rejects.toBeInstanceOf(DistillError);

    const store = await getKnowledgeStore(USER_ID);
    expect(store.count()).resolves.toBe(0);
  });
});
