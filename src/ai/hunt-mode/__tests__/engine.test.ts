import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfileStore } from '../profile-store';
import { RuleRegistry } from '../rules/registry';
import { HuntEngine } from '../rules/engine';
import type { HuntRule, RuleVerdict } from '../rules/types';
import type { AttackerProfile, ProfileMutation } from '../profile';

function baseProfile(key: string): AttackerProfile {
  return {
    key,
    firstSeen: '2026-06-19T00:00:00.000Z',
    lastSeen: '2026-06-19T00:00:00.000Z',
    confidence: 0.5,
    signalCount: 1,
    severityCounts: { info: 1, warn: 0, critical: 0 },
    sources: { 'admin-audit': 1 },
    routes: {},
    fields: { ip: '1.2.3.4' },
    recent: [
      {
        timestamp: '2026-06-19T00:00:00.000Z',
        source: 'admin-audit',
        severity: 'info',
        summary: 'first',
      },
    ],
  };
}

function alwaysFireRule(
  id: string,
  mode: HuntRule['mode'] = 'on-mutation',
  cooldownMs = 0
): HuntRule {
  return {
    id,
    cooldownMs,
    mode,
    evaluate(curr): RuleVerdict | null {
      return {
        severity: 'warn',
        summary: `fired by ${id}`,
        evidence: { ruleId: id, profileKey: curr.key, counters: {} },
      };
    },
  };
}

function neverFireRule(id: string): HuntRule {
  return {
    id,
    cooldownMs: 0,
    mode: 'on-mutation',
    evaluate(): RuleVerdict | null {
      return null;
    },
  };
}

describe('RuleRegistry', () => {
  it('register/get/list/size/clear', () => {
    const reg = new RuleRegistry();
    expect(reg.size()).toBe(0);
    const r = alwaysFireRule('a');
    reg.register(r);
    expect(reg.size()).toBe(1);
    expect(reg.get('a')).toBe(r);
    expect(reg.list()).toEqual([r]);
    reg.clear();
    expect(reg.size()).toBe(0);
  });

  it('register replaces existing rule with same id (hot-swap)', () => {
    const reg = new RuleRegistry();
    const a1 = alwaysFireRule('a');
    const a2 = alwaysFireRule('a');
    reg.register(a1);
    reg.register(a2);
    expect(reg.size()).toBe(1);
    expect(reg.get('a')).toBe(a2);
  });

  it('unregister returns true if removed, false otherwise', () => {
    const reg = new RuleRegistry();
    reg.register(alwaysFireRule('a'));
    expect(reg.unregister('a')).toBe(true);
    expect(reg.unregister('a')).toBe(false);
  });
});

describe('HuntEngine', () => {
  let dir: string;
  let store: ProfileStore;
  let registry: RuleRegistry;
  let verdicts: Array<{
    verdict: RuleVerdict;
    ruleId: string;
    mutation: ProfileMutation | null;
  }>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hunt-engine-'));
    store = new ProfileStore({ dir });
    store.load();
    registry = new RuleRegistry();
    verdicts = [];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function makeEngine(now = () => Date.now()) {
    return new HuntEngine({
      registry,
      store,
      sink: (verdict, rule, mutation) =>
        verdicts.push({ verdict, ruleId: rule.id, mutation }),
      now,
    });
  }

  it('fires on-mutation rules when ProfileStore mutates', () => {
    registry.register(alwaysFireRule('a'));
    const engine = makeEngine();
    engine.start();
    store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
    expect(verdicts.length).toBe(1);
    expect(verdicts[0].ruleId).toBe('a');
    expect(verdicts[0].verdict.evidence.profileKey).toBe('ip:1.1.1.1');
    engine.stop();
  });

  it('does not fire after stop()', () => {
    registry.register(alwaysFireRule('a'));
    const engine = makeEngine();
    engine.start();
    engine.stop();
    store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
    expect(verdicts.length).toBe(0);
  });

  it('skips rules in sweep mode during on-mutation', () => {
    registry.register(alwaysFireRule('s', 'sweep'));
    const engine = makeEngine();
    engine.start();
    store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
    expect(verdicts.length).toBe(0);
    engine.stop();
  });

  it('fires both-mode rules on both mutation and sweep', () => {
    registry.register(alwaysFireRule('b', 'both'));
    const engine = makeEngine();
    engine.start();
    store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
    expect(verdicts.length).toBe(1);
    engine.sweep();
    // sweep also fires for the same profile, would be 2 total without cooldown
    expect(verdicts.length).toBe(2);
    engine.stop();
  });

  it('sweep iterates all profiles for sweep-mode rules', () => {
    registry.register(alwaysFireRule('s', 'sweep'));
    store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
    store.apply({ kind: 'create', profile: baseProfile('ip:2.2.2.2') });
    const engine = makeEngine();
    // start not required for sweep — sweep is explicit
    engine.sweep();
    expect(verdicts.length).toBe(2);
    expect(new Set(verdicts.map((v) => v.verdict.evidence.profileKey))).toEqual(
      new Set(['ip:1.1.1.1', 'ip:2.2.2.2'])
    );
  });

  it('respects per-rule per-key cooldown', () => {
    let t = 1000;
    const now = () => t;
    registry.register(alwaysFireRule('a', 'on-mutation', 5000));
    const engine = makeEngine(now);
    engine.start();
    store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
    expect(verdicts.length).toBe(1);
    t += 1000; // 1s later, still in cooldown
    store.apply({
      kind: 'update',
      key: 'ip:1.1.1.1',
      patch: { lastSeen: 'x' },
      event: {
        timestamp: 'x',
        source: 's',
        severity: 'info',
        summary: 'm',
      },
    });
    expect(verdicts.length).toBe(1);
    t += 5000; // past cooldown
    store.apply({
      kind: 'update',
      key: 'ip:1.1.1.1',
      patch: { lastSeen: 'y' },
      event: {
        timestamp: 'y',
        source: 's',
        severity: 'info',
        summary: 'n',
      },
    });
    expect(verdicts.length).toBe(2);
    engine.stop();
  });

  it('cooldown is per-key (one key on cooldown does not block another)', () => {
    const t = 1000;
    registry.register(alwaysFireRule('a', 'on-mutation', 5000));
    const engine = makeEngine(() => t);
    engine.start();
    store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
    store.apply({ kind: 'create', profile: baseProfile('ip:2.2.2.2') });
    expect(verdicts.length).toBe(2);
    engine.stop();
  });

  it('runs all registered rules per mutation; null verdicts dropped', () => {
    registry.register(alwaysFireRule('a'));
    registry.register(neverFireRule('b'));
    registry.register(alwaysFireRule('c'));
    const engine = makeEngine();
    engine.start();
    store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
    expect(verdicts.length).toBe(2);
    expect(new Set(verdicts.map((v) => v.ruleId))).toEqual(new Set(['a', 'c']));
    engine.stop();
  });

  it('hot-swap: registering a rule mid-flight takes effect on next mutation', () => {
    const engine = makeEngine();
    engine.start();
    store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
    expect(verdicts.length).toBe(0);
    registry.register(alwaysFireRule('a'));
    store.apply({
      kind: 'update',
      key: 'ip:1.1.1.1',
      patch: { lastSeen: 'x' },
      event: {
        timestamp: 'x',
        source: 's',
        severity: 'info',
        summary: 'm',
      },
    });
    expect(verdicts.length).toBe(1);
    engine.stop();
  });

  it('sink receives the rule and mutation reference', () => {
    registry.register(alwaysFireRule('a'));
    const engine = makeEngine();
    engine.start();
    store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
    expect(verdicts[0].mutation?.kind).toBe('create');
    engine.stop();
  });

  it('start is idempotent — calling twice does not double-subscribe', () => {
    registry.register(alwaysFireRule('a'));
    const engine = makeEngine();
    engine.start();
    engine.start();
    store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
    expect(verdicts.length).toBe(1);
    engine.stop();
  });

  it('resetCooldowns clears all cooldown state', () => {
    let t = 1000;
    registry.register(alwaysFireRule('a', 'on-mutation', 5000));
    const engine = makeEngine(() => t);
    engine.start();
    store.apply({ kind: 'create', profile: baseProfile('ip:1.1.1.1') });
    expect(verdicts.length).toBe(1);
    engine.resetCooldowns();
    t += 1000;
    store.apply({
      kind: 'update',
      key: 'ip:1.1.1.1',
      patch: { lastSeen: 'x' },
      event: {
        timestamp: 'x',
        source: 's',
        severity: 'info',
        summary: 'm',
      },
    });
    expect(verdicts.length).toBe(2);
    engine.stop();
  });
});
