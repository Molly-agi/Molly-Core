/**
 * Cognitive Governor
 * ------------------------------------------------------------------
 * Central admission control for flows, tools, and agents. This is the
 * spine of the agency layer: every flow/tool/agent asks the governor
 * "may I start?" and the governor answers based on concurrency caps
 * and priority, keeping the system from over-committing itself.
 *
 * Contract relationship:
 *   - The governor OWNS its tunable parameters in the ParameterRegistry
 *     (it is the sole committer). Other subsystems may propose changes;
 *     the governor decides whether to accept them.
 *   - It never *kills* work itself. It decides admission and, when
 *     pressed, RECOMMENDS which low-priority in-flight task to cancel,
 *     returning its id to the caller. Enforcement is the caller's job,
 *     because the governor can't honestly guarantee it can terminate a
 *     flow it didn't spawn. Decide here, enforce there.
 *
 * Honest scope: this tracks counts and concurrency (which are real and
 * measurable). It does NOT pretend to measure CPU or wall-clock budget
 * it has no access to — those would be added only when a real signal
 * source exists.
 */

import {
  ParameterRegistry,
  validators,
  type SubsystemId,
} from '../registry/parameter-registry';

export const GOVERNOR_ID: SubsystemId = 'cognitive-governor';

export type WorkKind = 'flow' | 'tool' | 'agent';

/** 1 = lowest, 10 = highest. Kept small and explicit. */
export type Priority = number;

export interface WorkRequest {
  kind: WorkKind;
  /** e.g. flow name, tool name, agent id — for logging and policy. */
  type: string;
  priority: Priority;
}

export interface ActiveWork extends WorkRequest {
  id: string;
  startedAt: number;
}

export type AdmissionDecision =
  | { admit: true; reason: string }
  | { admit: false; reason: string; suggestCancel?: string };

export interface GovernorParamKeys {
  maxConcurrentFlows: string;
  maxConcurrentTools: string;
  maxConcurrentAgents: string;
  /** A higher-priority request may preempt an active task whose priority
   *  is at least this much lower. Prevents thrashing on tiny differences. */
  preemptionMargin: string;
}

const KEYS: GovernorParamKeys = {
  maxConcurrentFlows: 'governor.maxConcurrentFlows',
  maxConcurrentTools: 'governor.maxConcurrentTools',
  maxConcurrentAgents: 'governor.maxConcurrentAgents',
  preemptionMargin: 'governor.preemptionMargin',
};

export interface GovernorSnapshot {
  active: Record<WorkKind, number>;
  limits: Record<WorkKind, number>;
  inFlight: ActiveWork[];
}

export type GovernorEventKind = 'start' | 'end';
export interface GovernorEvent {
  kind: GovernorEventKind;
  work: ActiveWork;
}
export type GovernorListener = (event: GovernorEvent) => void;

export class CognitiveGovernor {
  private active = new Map<string, ActiveWork>();
  private seq = 0;
  private listeners = new Set<GovernorListener>();

  constructor(private readonly registry: ParameterRegistry) {
    // Governor registers + owns its own tunables. Defaults are conservative.
    this.defineIfAbsent(
      KEYS.maxConcurrentFlows,
      8,
      validators.intInRange(1, 64),
      {
        control: 'int',
        min: 1,
        max: 64,
        step: 1,
        unit: 'flows',
      },
      'Max flows allowed to run at once before admission control kicks in.'
    );
    this.defineIfAbsent(
      KEYS.maxConcurrentTools,
      16,
      validators.intInRange(1, 128),
      {
        control: 'int',
        min: 1,
        max: 128,
        step: 1,
        unit: 'tools',
      },
      'Max concurrent tool invocations.'
    );
    this.defineIfAbsent(
      KEYS.maxConcurrentAgents,
      6,
      validators.intInRange(1, 32),
      {
        control: 'int',
        min: 1,
        max: 32,
        step: 1,
        unit: 'agents',
      },
      'Max concurrent sub-agents.'
    );
    this.defineIfAbsent(
      KEYS.preemptionMargin,
      2,
      validators.intInRange(0, 9),
      {
        control: 'slider',
        min: 0,
        max: 9,
        step: 1,
      },
      'How much higher a request must rank to preempt active lower-priority work.'
    );
  }

  /** Admission check. Pure decision — does not mutate active set. */
  shouldStart(req: WorkRequest): AdmissionDecision {
    const limit = this.limitFor(req.kind);
    const current = this.countOf(req.kind);
    if (current < limit) {
      return {
        admit: true,
        reason: `slot available (${current}/${limit} ${req.kind}s)`,
      };
    }
    // At capacity. Can this request preempt a lower-priority active one?
    const margin = this.registry.get<number>(KEYS.preemptionMargin);
    const victim = this.lowestPriorityOf(req.kind);
    if (victim && req.priority - victim.priority >= margin) {
      return {
        admit: false,
        reason: `at capacity (${current}/${limit}); recommend preempting lower-priority work`,
        suggestCancel: victim.id,
      };
    }
    return {
      admit: false,
      reason: `at capacity (${current}/${limit} ${req.kind}s) and nothing eligible to preempt`,
    };
  }

  /** Subscribe to flow start/end events. */
  on(listener: GovernorListener): void {
    this.listeners.add(listener);
  }

  /** Unsubscribe. */
  off(listener: GovernorListener): void {
    this.listeners.delete(listener);
  }

  /** Register that work actually started. Returns the assigned id. */
  registerStart(req: WorkRequest): ActiveWork {
    const work: ActiveWork = {
      ...req,
      id: `${req.kind}_${++this.seq}`,
      startedAt: Date.now(),
    };
    this.active.set(work.id, work);
    this.emit({ kind: 'start', work });
    return work;
  }

  /** Register that work finished (or was cancelled). Idempotent. */
  registerEnd(id: string): void {
    const work = this.active.get(id);
    this.active.delete(id);
    if (work) this.emit({ kind: 'end', work });
  }

  private emit(event: GovernorEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        /* listener errors must not crash the governor */
      }
    }
  }

  /**
   * When the system is over budget (e.g. limits were lowered live),
   * returns the ids that should be cancelled, lowest priority first,
   * to bring each kind back within its cap. Caller enforces.
   */
  reconcileOverages(): string[] {
    const toCancel: string[] = [];
    for (const kind of ['flow', 'tool', 'agent'] as WorkKind[]) {
      const limit = this.limitFor(kind);
      const items = this.ofKind(kind).sort(
        (a, b) => a.priority - b.priority || a.startedAt - b.startedAt
      );
      const overBy = items.length - limit;
      for (let i = 0; i < overBy; i++) toCancel.push(items[i].id);
    }
    return toCancel;
  }

  /** The governor's policy for resolving proposals others filed against its params. */
  drainProposals(): void {
    for (const key of Object.values(KEYS)) {
      this.registry.resolveProposals<number>(key, GOVERNOR_ID, (p, current) => {
        // Policy: accept proposals that pass bounds and don't slash capacity
        // by more than half in one step (avoid sudden starvation).
        if (key !== KEYS.preemptionMargin && p.value < current / 2)
          return false;
        return true;
      });
    }
  }

  snapshot(): GovernorSnapshot {
    return {
      active: {
        flow: this.countOf('flow'),
        tool: this.countOf('tool'),
        agent: this.countOf('agent'),
      },
      limits: {
        flow: this.limitFor('flow'),
        tool: this.limitFor('tool'),
        agent: this.limitFor('agent'),
      },
      inFlight: [...this.active.values()],
    };
  }

  // --- internals ---

  private limitFor(kind: WorkKind): number {
    switch (kind) {
      case 'flow':
        return this.registry.get<number>(KEYS.maxConcurrentFlows);
      case 'tool':
        return this.registry.get<number>(KEYS.maxConcurrentTools);
      case 'agent':
        return this.registry.get<number>(KEYS.maxConcurrentAgents);
    }
  }

  private ofKind(kind: WorkKind): ActiveWork[] {
    return [...this.active.values()].filter((w) => w.kind === kind);
  }

  private countOf(kind: WorkKind): number {
    let n = 0;
    for (const w of this.active.values()) if (w.kind === kind) n++;
    return n;
  }

  private lowestPriorityOf(kind: WorkKind): ActiveWork | null {
    let lowest: ActiveWork | null = null;
    for (const w of this.active.values()) {
      if (w.kind !== kind) continue;
      if (!lowest || w.priority < lowest.priority) lowest = w;
    }
    return lowest;
  }

  private defineIfAbsent(
    key: string,
    def: number,
    validate: (v: number) => string | null,
    ui?: import('../registry/parameter-registry').ParameterUiMeta,
    description?: string
  ): void {
    try {
      this.registry.get<number>(key);
    } catch {
      this.registry.define<number>({
        key,
        owner: GOVERNOR_ID,
        default: def,
        validate,
        ui,
        description,
      });
    }
  }
}

export { KEYS as GOVERNOR_PARAM_KEYS };
