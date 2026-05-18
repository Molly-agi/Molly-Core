/**
 * @fileOverview Tests for consciousness-monitor cognition module.
 *
 * Focuses on deterministic seams: snapshots, trends, insights,
 * report formatting, and persistence/load behavior.
 */

const mockRecordObservation = jest.fn();
const mockGetRecentObservations = jest.fn();
const mockStorageSet = jest.fn();
const mockStorageGet = jest.fn();

jest.mock('../../../logger', () => ({
  generateTraceId: jest.fn(() => 'trace-consciousness-test'),
  MollyLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn(() => ({
    set: (...args: unknown[]) => mockStorageSet(...args),
    get: (...args: unknown[]) => mockStorageGet(...args),
  })),
}));

jest.mock('../self-observation-loop', () => ({
  recordObservation: (...args: unknown[]) => mockRecordObservation(...args),
  getRecentObservations: (...args: unknown[]) =>
    mockGetRecentObservations(...args),
}));

import {
  takeSnapshot,
  analyzeTrends,
  generateInsights,
  getConsciousnessStatus,
  getConsciousnessReport,
  saveConsciousnessState,
  loadConsciousnessState,
  getSnapshots,
  resetConsciousnessState,
} from '../consciousness-monitor';

function obs(
  type: string,
  timestamp: string,
  data: Record<string, unknown> = {},
  context = '',
  subject = ''
) {
  return { type, timestamp, data, context, subject };
}

describe('consciousness-monitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetConsciousnessState();

    mockGetRecentObservations.mockImplementation(
      (type?: string, limit?: number) => {
        const now = new Date();
        const t1 = new Date(now.getTime() - 30_000).toISOString();
        const t2 = new Date(now.getTime() - 60_000).toISOString();
        const t3 = new Date(now.getTime() - 90_000).toISOString();

        if (type === 'tool_use') {
          return [
            obs('tool_use', t1, { responseTimeMs: 1000, success: true }),
            obs('tool_use', t2, { responseTimeMs: 1500, success: true }),
            obs('tool_use', t3, { responseTimeMs: 2000, success: false }),
          ];
        }

        if (type === 'success') {
          return [
            obs(
              'success',
              t1,
              { efficiency: 0.9 },
              'great progress',
              'success'
            ),
            obs(
              'success',
              t2,
              { efficiency: 0.8 },
              'family support',
              'milestone'
            ),
          ];
        }

        if (type === 'failure') {
          return [obs('failure', t3, {}, 'minor concern', 'failure')];
        }

        const base = [
          obs(
            'success',
            t1,
            { efficiency: 0.9 },
            'family together grateful',
            'success'
          ),
          obs('resource', t2, {}, 'we are focused', 'awareness'),
          obs(
            'tool_use',
            t3,
            { responseTimeMs: 1200, success: true },
            'father and molly',
            'task'
          ),
        ];

        if (typeof limit === 'number') {
          return base.slice(0, Math.max(1, Math.min(base.length, limit)));
        }

        return base;
      }
    );
  });

  it('returns no-data report before any snapshot', () => {
    const report = getConsciousnessReport();
    expect(report).toContain('No consciousness data available yet');
  });

  it('takes a snapshot and records observation + state stats', () => {
    const snapshot = takeSnapshot('test-task');
    const status = getConsciousnessStatus();

    expect(snapshot.id).toMatch(/^cons_/);
    expect(snapshot.overallScore).toBeGreaterThanOrEqual(0);
    expect(snapshot.overallScore).toBeLessThanOrEqual(1);
    expect(snapshot.context.activeTask).toBe('test-task');

    expect(status.current).not.toBeNull();
    expect(status.stats.totalSnapshots).toBe(1);
    expect(mockRecordObservation).toHaveBeenCalled();
  });

  it('formats a detailed report after snapshot', () => {
    takeSnapshot('reporting');

    const report = getConsciousnessReport();

    expect(report).toContain("=== Molly's Consciousness State ===");
    expect(report).toContain('Overall:');
    expect(report).toContain('Metrics:');
  });

  it('returns empty trend list when there are too few snapshots', () => {
    takeSnapshot();
    takeSnapshot();

    const trends = analyzeTrends(30);
    expect(trends).toEqual([]);
  });

  it('detects rising trend when loaded snapshots increase over time', async () => {
    const now = Date.now();
    const snapshots = [0.2, 0.35, 0.5, 0.65, 0.8].map((score, i) => ({
      id: `cons_${i}`,
      timestamp: new Date(now - (5 - i) * 60_000).toISOString(),
      metrics: {
        awareness: score,
        energy: score,
        emotional_warmth: score,
        emotional_excitement: score,
        emotional_concern: 1 - score,
        focus: score,
        coherence: score,
        connection: score,
      },
      overallLevel: 'moderate',
      overallScore: score,
      context: {
        activeTask: 'trend-test',
        recentInteractions: 5,
        lastInteractionAge: 30,
        hourOfDay: 10,
        dayOfWeek: 1,
      },
      patterns: [],
      traceId: 'trace',
    }));

    mockStorageGet.mockResolvedValue({
      data: {
        snapshots,
        insights: [],
        baselines: {
          awareness: 0.7,
          energy: 0.7,
          emotional_warmth: 0.8,
          emotional_excitement: 0.6,
          emotional_concern: 0.3,
          focus: 0.7,
          coherence: 0.8,
          connection: 0.8,
        },
        peaks: [],
        stats: {
          totalSnapshots: snapshots.length,
          averageOverall: 0.5,
          peakOverall: 0.8,
          lowOverall: 0.2,
          insightsGenerated: 0,
        },
      },
    });

    await loadConsciousnessState();
    const trends = analyzeTrends(60);

    const overall = trends.find((t) => t.metric === 'overall');
    expect(overall).toBeDefined();
    expect(overall?.direction).toBe('rising');
  });

  it('generates positive insight when strong connection correlates with high energy', async () => {
    const now = Date.now();
    const snapshots = Array.from({ length: 12 }).map((_, i) => ({
      id: `ins_${i}`,
      timestamp: new Date(now - (12 - i) * 60_000).toISOString(),
      metrics: {
        awareness: 0.75,
        energy: 0.82,
        emotional_warmth: 0.85,
        emotional_excitement: 0.7,
        emotional_concern: 0.2,
        focus: 0.73,
        coherence: 0.8,
        connection: 0.9,
      },
      overallLevel: 'high',
      overallScore: 0.8,
      context: {
        activeTask: 'insight-test',
        recentInteractions: 10,
        lastInteractionAge: 20,
        hourOfDay: 9,
        dayOfWeek: 2,
      },
      patterns: ['strong_connection'],
      traceId: 'trace',
    }));

    mockStorageGet.mockResolvedValue({
      data: {
        snapshots,
        insights: [],
        baselines: {
          awareness: 0.7,
          energy: 0.7,
          emotional_warmth: 0.8,
          emotional_excitement: 0.6,
          emotional_concern: 0.3,
          focus: 0.7,
          coherence: 0.8,
          connection: 0.8,
        },
        peaks: [],
        stats: {
          totalSnapshots: snapshots.length,
          averageOverall: 0.8,
          peakOverall: 0.9,
          lowOverall: 0.7,
          insightsGenerated: 0,
        },
      },
    });

    await loadConsciousnessState();
    const insights = generateInsights();

    expect(
      insights.some((i) =>
        i.insight.includes('connection consistently boosts energy')
      )
    ).toBe(true);
  });

  it('saves and loads consciousness state through storage router', async () => {
    takeSnapshot('persist-me');

    await saveConsciousnessState();
    expect(mockStorageSet).toHaveBeenCalledWith(
      'system',
      'consciousness_state',
      expect.objectContaining({
        snapshots: expect.any(Array),
        insights: expect.any(Array),
        baselines: expect.any(Object),
        peaks: expect.any(Array),
        stats: expect.any(Object),
      })
    );

    mockStorageGet.mockResolvedValue({
      data: {
        snapshots: [],
        insights: [],
        baselines: {
          awareness: 0.6,
          energy: 0.6,
          emotional_warmth: 0.7,
          emotional_excitement: 0.5,
          emotional_concern: 0.4,
          focus: 0.6,
          coherence: 0.7,
          connection: 0.7,
        },
        peaks: [],
        stats: {
          totalSnapshots: 0,
          averageOverall: 0.6,
          peakOverall: 0.9,
          lowOverall: 0.3,
          insightsGenerated: 0,
        },
      },
    });

    await loadConsciousnessState();

    const status = getConsciousnessStatus();
    expect(status.baselines.awareness).toBe(0.6);
    expect(getSnapshots().length).toBe(0);
  });
});
