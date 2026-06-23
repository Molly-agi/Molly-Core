/**
 * Somatic Loop — Baseline-Sourcing Contract
 * ------------------------------------------------------------------
 * Bug class this prevents: somatic-loop "restore to default" heuristics
 * carrying hardcoded numeric baselines that go stale the moment a governor
 * owner bumps the registered default. Same drift family as PRs #213 → #239
 * → #242 → #243 — except those were tests, this is the production fire-path.
 *
 * Contract: every "restore to default" proposal MUST equal the *registered*
 * default returned by registry.getDefault(), not a copy frozen at the time
 * the heuristic was written.
 */
import { ParameterRegistry } from '../../registry/parameter-registry';
import {
  CognitiveGovernor,
  GOVERNOR_ID,
} from '../../governor/cognitive-governor';
import { SomaticLoop } from '../somatic-loop';

describe('SomaticLoop baseline sourcing', () => {
  function makeRuntime() {
    const registry = new ParameterRegistry();
    const governor = new CognitiveGovernor(registry);
    return { registry, governor };
  }

  it('idle-flow + low-intensity tick proposes the registered maxConcurrentFlows default', () => {
    const { registry, governor } = makeRuntime();
    const loop = new SomaticLoop(registry, governor, () => 0.2);
    const flowsDefault = registry.getDefault<number>(
      'governor.maxConcurrentFlows'
    );

    registry.commit(
      'governor.maxConcurrentFlows',
      Math.max(1, flowsDefault - 2),
      GOVERNOR_ID,
      'simulated dip'
    );

    (loop as unknown as { tick(): void }).tick();

    const pending = registry.pendingProposals('governor.maxConcurrentFlows');
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[pending.length - 1].value).toBe(flowsDefault);

    loop.destroy();
  });

  it('flow-end after dip proposes the registered maxConcurrentTools default', () => {
    const { registry, governor } = makeRuntime();
    const loop = new SomaticLoop(registry, governor);
    const toolsDefault = registry.getDefault<number>(
      'governor.maxConcurrentTools'
    );

    registry.commit(
      'governor.maxConcurrentTools',
      Math.max(1, toolsDefault - 2),
      GOVERNOR_ID,
      'simulated dip'
    );

    const work = governor.registerStart({
      kind: 'flow',
      type: 'probe',
      priority: 5,
    });
    governor.registerEnd(work.id);

    const pending = registry.pendingProposals('governor.maxConcurrentTools');
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[pending.length - 1].value).toBe(toolsDefault);

    loop.destroy();
  });
});
