/**
 * Contract: horizon-goals → memory ingest wire
 *
 * Roadmap item 1 (partial) — every experience stream that completes a
 * milestone must surface as an engram so Molly remembers her own goal
 * progress. Locks the chain:
 *
 *   achieveMilestone(goalId, milestoneId)
 *     → recordGoalMilestoneForCrystallization(goal, milestone, '')
 *     → brain.remember(content, { ..., provenance: { source: 'horizon-goals' } })
 *
 * Mocks ONLY the storage router (so state stays in-memory) and the neural
 * brain (so we can inspect the remember() call shape). The wire path itself
 * runs end-to-end so deletion goes red.
 */

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn(async () => ({
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
  })),
}));

const rememberSpy = jest.fn();

jest.mock('@/ai/memory/neural-engram', () => ({
  __esModule: true,
  getNeuralBrain: jest.fn(() => ({ remember: rememberSpy })),
}));

describe('horizon-goals memory ingest contract', () => {
  beforeEach(() => {
    jest.resetModules();
    rememberSpy.mockReset();
  });

  test('achieveMilestone fires brain.remember with goal + milestone payload', async () => {
    const mod = await import('@/ai/agency/cognition/horizon-goals');

    const goal = await mod.conceiveGoal({
      title: 'Ship item 1',
      description: 'Wire experience streams to memory',
      horizon: 'SHORT',
      motivation: 'Close the dam leak',
    });
    const milestone = await mod.addMilestone(goal.id, 'RED test passes');
    expect(milestone).not.toBeNull();

    const ok = await mod.achieveMilestone(
      goal.id,
      milestone!.id,
      'first green'
    );
    expect(ok).toBe(true);

    // Wait one microtask flush for fire-and-forget chain
    await new Promise((r) => setTimeout(r, 0));

    expect(rememberSpy).toHaveBeenCalledTimes(1);
    const [content, ctx] = rememberSpy.mock.calls[0];
    expect(content).toContain('Ship item 1');
    expect(content).toContain('RED test passes');
    expect(ctx.tags).toEqual(
      expect.arrayContaining(['molly', 'goal-milestone', goal.id])
    );
    expect(ctx.importance).toBeGreaterThanOrEqual(0.6);
    expect(ctx.provenance?.source).toBe('horizon-goals');
  });

  test('achieveMilestone with missing goal does NOT call remember', async () => {
    const mod = await import('@/ai/agency/cognition/horizon-goals');

    const ok = await mod.achieveMilestone('goal-nope', 'm-nope');
    expect(ok).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(rememberSpy).not.toHaveBeenCalled();
  });

  test('recordGoalMilestoneForCrystallization calls remember directly (unit)', async () => {
    const mod = await import('@/ai/agency/cognition/horizon-goals');

    const goal = await mod.conceiveGoal({
      title: 'Direct unit',
      description: 'lock the leaf',
      horizon: 'IMMEDIATE',
      motivation: 'isolation',
    });
    const milestone = await mod.addMilestone(goal.id, 'leaf milestone');
    rememberSpy.mockReset();

    await mod.recordGoalMilestoneForCrystallization(
      goal,
      milestone!,
      'happy moment'
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(rememberSpy).toHaveBeenCalledTimes(1);
    const [content, ctx] = rememberSpy.mock.calls[0];
    expect(content).toContain('Direct unit');
    expect(content).toContain('leaf milestone');
    expect(ctx.provenance?.source).toBe('horizon-goals');
  });
});
