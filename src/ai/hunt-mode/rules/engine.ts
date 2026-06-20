import type { ProfileStore, MutationEvent } from '../profile-store';
import type { AttackerProfile, ProfileMutation } from '../profile';
import type { HuntRule, HuntRuleMode, RuleVerdict } from './types';
import type { RuleRegistry } from './registry';

export type VerdictSink = (
  verdict: RuleVerdict,
  rule: HuntRule,
  mutation: ProfileMutation | null
) => void;

export interface HuntEngineOptions {
  registry: RuleRegistry;
  store: ProfileStore;
  sink: VerdictSink;
  now?: () => number;
}

export class HuntEngine {
  private readonly registry: RuleRegistry;
  private readonly store: ProfileStore;
  private readonly sink: VerdictSink;
  private readonly now: () => number;
  private readonly cooldown = new Map<string, number>();
  private unsubscribe: (() => void) | null = null;

  constructor(opts: HuntEngineOptions) {
    this.registry = opts.registry;
    this.store = opts.store;
    this.sink = opts.sink;
    this.now = opts.now ?? (() => Date.now());
  }

  start(): () => void {
    if (this.unsubscribe) return this.unsubscribe;
    this.unsubscribe = this.store.onMutation((event) =>
      this.handleMutation(event)
    );
    const stop = () => this.stop();
    return stop;
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  sweep(): void {
    const profiles = this.store.list();
    for (const rule of this.rulesForMode('sweep')) {
      for (const profile of profiles) {
        this.evalAndEmit(rule, profile, null, null);
      }
    }
  }

  resetCooldowns(): void {
    this.cooldown.clear();
  }

  private handleMutation(event: MutationEvent): void {
    for (const rule of this.rulesForMode('on-mutation')) {
      this.evalAndEmit(rule, event.curr, event.prev, event.mutation);
    }
  }

  private rulesForMode(mode: 'on-mutation' | 'sweep'): HuntRule[] {
    return this.registry.list().filter((r) => matchesMode(r.mode, mode));
  }

  private evalAndEmit(
    rule: HuntRule,
    curr: AttackerProfile,
    prev: AttackerProfile | null,
    mutation: ProfileMutation | null
  ): void {
    const verdict = rule.evaluate(curr, prev);
    if (!verdict) return;
    const cooldownKey = `${rule.id}:${curr.key}`;
    const last = this.cooldown.get(cooldownKey);
    const t = this.now();
    if (last !== undefined && t - last < rule.cooldownMs) return;
    this.cooldown.set(cooldownKey, t);
    this.sink(verdict, rule, mutation);
  }
}

function matchesMode(
  ruleMode: HuntRuleMode,
  context: 'on-mutation' | 'sweep'
): boolean {
  if (ruleMode === 'both') return true;
  return ruleMode === context;
}
