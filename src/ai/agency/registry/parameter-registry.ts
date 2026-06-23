/**
 * Parameter Registry & Write-Ownership Contract
 * ------------------------------------------------------------------
 * Single source of truth for every tunable runtime parameter in the
 * Phase 7 agency layer (governor concurrency caps, somatic tick rate,
 * compression aggressiveness, style weights, etc.).
 *
 * The contract this enforces:
 *   - Each parameter has EXACTLY ONE owner subsystem.
 *   - Only the owner may commit a new value (commit()).
 *   - Everyone else may only propose() a change, which lands in a
 *     queue the owner drains and accepts/rejects.
 *   - Every value is bounds/validator-checked before it lands.
 *   - Every change is recorded with who, when, why (provenance).
 *
 * This is what stops the governor / somatic loop / self-calibration /
 * drift-monitor from fighting over shared state. No feedback-loop
 * module should hold its own mutable copy of a tunable — it reads
 * here and writes here.
 *
 * No external dependencies on purpose, so it drops cleanly into
 * Molly-Core and is trivial to unit test.
 */

export type SubsystemId = string;

export interface ParameterChange<T = unknown> {
  key: string;
  from: T;
  to: T;
  by: SubsystemId;
  reason: string;
  at: number; // epoch ms
  kind:
    | 'commit'
    | 'proposal-accepted'
    | 'proposal-rejected'
    | 'init'
    | 'operator-override';
}

export interface ParameterUiMeta {
  /** How the admin panel should render this parameter. */
  control: 'slider' | 'int' | 'number' | 'enum' | 'toggle';
  min?: number;
  max?: number;
  step?: number;
  options?: readonly (string | number)[];
  unit?: string;
}

export interface ParameterDefinition<T = unknown> {
  key: string;
  /** The single subsystem permitted to commit values for this key. */
  owner: SubsystemId;
  /** Initial value. Must itself pass the validator. */
  default: T;
  /** Human-readable description for audits/diagnostics. */
  description?: string;
  /** Optional hint to the admin UI for how to render the control. */
  ui?: ParameterUiMeta;
  /**
   * Returns null if valid, or a string explaining why the candidate
   * value is rejected. Use this for both type-shape and bounds checks.
   */
  validate?: (candidate: T) => string | null;
}

export interface Proposal<T = unknown> {
  id: string;
  key: string;
  value: T;
  by: SubsystemId;
  reason: string;
  at: number;
}

export interface CommitResult {
  ok: boolean;
  error?: string;
}

export interface ProposalDecision<T = unknown> {
  proposal: Proposal<T>;
  accepted: boolean;
  reason: string;
}

type Listener<T = unknown> = (change: ParameterChange<T>) => void;

interface ParamSlot<T = unknown> {
  def: ParameterDefinition<T>;
  value: T;
  version: number;
  lastWriter: SubsystemId;
  lastChangedAt: number;
}

export class OwnershipViolationError extends Error {
  constructor(key: string, owner: SubsystemId, attemptedBy: SubsystemId) {
    super(
      `Subsystem "${attemptedBy}" attempted to COMMIT "${key}", ` +
        `which is owned by "${owner}". Non-owners must use propose().`
    );
    this.name = 'OwnershipViolationError';
  }
}

export class ParameterRegistry {
  private slots = new Map<string, ParamSlot>();
  private proposals = new Map<string, Proposal[]>(); // key -> queued proposals
  private listeners = new Map<string, Set<Listener>>(); // key -> listeners
  private history: ParameterChange[] = [];
  private proposalSeq = 0;

  constructor(private readonly historyLimit = 500) {}

  /** Register a parameter. Throws if the key already exists or the default is invalid. */
  define<T>(def: ParameterDefinition<T>): void {
    if (this.slots.has(def.key)) {
      throw new Error(`Parameter "${def.key}" is already defined.`);
    }
    const invalid = def.validate ? def.validate(def.default) : null;
    if (invalid) {
      throw new Error(`Default for "${def.key}" is invalid: ${invalid}`);
    }
    this.slots.set(def.key, {
      def: def as ParameterDefinition,
      value: def.default,
      version: 0,
      lastWriter: def.owner,
      lastChangedAt: Date.now(),
    });
    this.proposals.set(def.key, []);
    this.record({
      key: def.key,
      from: undefined,
      to: def.default,
      by: def.owner,
      reason: 'parameter defined',
      at: Date.now(),
      kind: 'init',
    });
  }

  /** Read the current value. Throws if undefined — fail loud, not silent. */
  get<T>(key: string): T {
    const slot = this.requireSlot(key);
    return slot.value as T;
  }

  /**
   * Read the registered default for a key. Use this when a subsystem wants to
   * "restore to baseline" without hardcoding the number — otherwise the
   * baseline rots the moment the owner bumps the default. Throws if the key
   * is undefined, same as get().
   */
  getDefault<T>(key: string): T {
    const slot = this.requireSlot(key);
    return slot.def.default as T;
  }

  /** Who owns this key. */
  ownerOf(key: string): SubsystemId {
    return this.requireSlot(key).def.owner;
  }

  /**
   * Owner-only write. Returns {ok:false,...} on validation failure;
   * THROWS OwnershipViolationError if `by` is not the owner, because a
   * non-owner committing is a programming error, not a runtime condition.
   */
  commit<T>(
    key: string,
    value: T,
    by: SubsystemId,
    reason: string
  ): CommitResult {
    const slot = this.requireSlot(key);
    if (by !== slot.def.owner) {
      throw new OwnershipViolationError(key, slot.def.owner, by);
    }
    const invalid = slot.def.validate ? slot.def.validate(value) : null;
    if (invalid) {
      return { ok: false, error: invalid };
    }
    const from = slot.value;
    slot.value = value;
    slot.version += 1;
    slot.lastWriter = by;
    slot.lastChangedAt = Date.now();
    this.emit(key, {
      key,
      from,
      to: value,
      by,
      reason,
      at: slot.lastChangedAt,
      kind: 'commit',
    });
    return { ok: true };
  }

  /**
   * Human operator override. Bypasses ownership intentionally — this is the
   * "I'm the human at the admin panel, do it now" lever. It still passes the
   * validator (bounds are bounds, even for humans) and it is ALWAYS recorded
   * with kind 'operator-override' so it is unmistakable in the audit trail.
   * `operator` should identify the human/session, not a subsystem.
   */
  operatorOverride<T>(
    key: string,
    value: T,
    operator: string,
    reason: string
  ): CommitResult {
    const slot = this.requireSlot(key);
    const invalid = slot.def.validate ? slot.def.validate(value) : null;
    if (invalid) {
      return { ok: false, error: invalid };
    }
    const from = slot.value;
    slot.value = value;
    slot.version += 1;
    slot.lastWriter = `operator:${operator}`;
    slot.lastChangedAt = Date.now();
    this.emit(key, {
      key,
      from,
      to: value,
      by: `operator:${operator}`,
      reason,
      at: slot.lastChangedAt,
      kind: 'operator-override',
    });
    return { ok: true };
  }

  /** Anyone may propose. Returns the queued proposal's id. */
  propose<T>(
    key: string,
    value: T,
    by: SubsystemId,
    reason: string
  ): Proposal<T> {
    this.requireSlot(key); // validates key exists
    const proposal: Proposal<T> = {
      id: `p${++this.proposalSeq}`,
      key,
      value,
      by,
      reason,
      at: Date.now(),
    };
    this.proposals.get(key)!.push(proposal as Proposal);
    return proposal;
  }

  /** Owner inspects what's been proposed for a key it owns. */
  pendingProposals<T>(key: string): Proposal<T>[] {
    this.requireSlot(key);
    return [...(this.proposals.get(key)! as Proposal<T>[])];
  }

  /**
   * Owner drains the proposal queue with a decision function.
   * The decide() callback returns true to accept (which commits the
   * value) or false to reject. Every outcome is recorded.
   */
  resolveProposals<T>(
    key: string,
    by: SubsystemId,
    decide: (p: Proposal<T>, current: T) => boolean
  ): ProposalDecision<T>[] {
    const slot = this.requireSlot(key);
    if (by !== slot.def.owner) {
      throw new OwnershipViolationError(key, slot.def.owner, by);
    }
    const queue = this.proposals.get(key)! as Proposal<T>[];
    const decisions: ProposalDecision<T>[] = [];
    for (const p of queue) {
      const accepted = decide(p, slot.value as T);
      if (accepted) {
        const result = this.commit(
          key,
          p.value,
          by,
          `accepted proposal ${p.id} from ${p.by}: ${p.reason}`
        );
        if (result.ok) {
          decisions.push({ proposal: p, accepted: true, reason: 'committed' });
        } else {
          // accepted but failed validation — treat as rejection, record why
          this.record({
            key,
            from: slot.value,
            to: p.value,
            by,
            reason: `proposal ${p.id} accepted but rejected by validator: ${result.error}`,
            at: Date.now(),
            kind: 'proposal-rejected',
          });
          decisions.push({
            proposal: p,
            accepted: false,
            reason: result.error ?? 'invalid',
          });
        }
      } else {
        this.record({
          key,
          from: slot.value,
          to: p.value,
          by,
          reason: `proposal ${p.id} from ${p.by} rejected by owner`,
          at: Date.now(),
          kind: 'proposal-rejected',
        });
        decisions.push({
          proposal: p,
          accepted: false,
          reason: 'owner rejected',
        });
      }
    }
    this.proposals.set(key, []); // queue drained
    return decisions;
  }

  /** Subscribe to changes for a key. Returns an unsubscribe fn. */
  subscribe<T>(key: string, fn: Listener<T>): () => void {
    this.requireSlot(key);
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(fn as Listener);
    return () => this.listeners.get(key)?.delete(fn as Listener);
  }

  /** Full change history (provenance), newest last. */
  getHistory(key?: string): ParameterChange[] {
    return key ? this.history.filter((h) => h.key === key) : [...this.history];
  }

  /** Snapshot of all current values — for diagnostics/dashboards. */
  snapshot(): Record<
    string,
    { value: unknown; owner: SubsystemId; version: number }
  > {
    const out: Record<
      string,
      { value: unknown; owner: SubsystemId; version: number }
    > = {};
    for (const [key, slot] of this.slots) {
      out[key] = {
        value: slot.value,
        owner: slot.def.owner,
        version: slot.version,
      };
    }
    return out;
  }

  /** Full description of one parameter, including UI metadata for the panel. */
  describe(key: string): {
    key: string;
    value: unknown;
    owner: SubsystemId;
    version: number;
    description?: string;
    ui?: ParameterUiMeta;
    lastWriter: SubsystemId;
    lastChangedAt: number;
  } {
    const slot = this.requireSlot(key);
    return {
      key,
      value: slot.value,
      owner: slot.def.owner,
      version: slot.version,
      description: slot.def.description,
      ui: slot.def.ui,
      lastWriter: slot.lastWriter,
      lastChangedAt: slot.lastChangedAt,
    };
  }

  /** Describe every parameter — the panel's primary data source. */
  describeAll(): ReturnType<ParameterRegistry['describe']>[] {
    return [...this.slots.keys()].map((k) => this.describe(k));
  }

  private requireSlot(key: string): ParamSlot {
    const slot = this.slots.get(key);
    if (!slot)
      throw new Error(`Unknown parameter "${key}". Define it before use.`);
    return slot;
  }

  private emit(key: string, change: ParameterChange): void {
    this.record(change);
    const ls = this.listeners.get(key);
    if (ls) for (const l of ls) l(change);
  }

  private record(change: ParameterChange): void {
    this.history.push(change);
    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit);
    }
  }
}

/** Common bounds validators, since most tunables are numeric ranges. */
export const validators = {
  numberInRange(min: number, max: number) {
    return (v: number): string | null => {
      if (typeof v !== 'number' || Number.isNaN(v)) return 'not a number';
      if (v < min || v > max) return `out of range [${min}, ${max}]`;
      return null;
    };
  },
  intInRange(min: number, max: number) {
    return (v: number): string | null => {
      if (!Number.isInteger(v)) return 'not an integer';
      if (v < min || v > max) return `out of range [${min}, ${max}]`;
      return null;
    };
  },
  oneOf<T>(allowed: readonly T[]) {
    return (v: T): string | null =>
      allowed.includes(v) ? null : `must be one of ${JSON.stringify(allowed)}`;
  },
};
