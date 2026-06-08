/**
 * Provenance Log
 * ------------------------------------------------------------------
 * The "why did you do that?" backbone of the agency layer. Every step
 * in an episode — a perception arriving, a goal forming, a plan step,
 * an action being decided and executed, the outcome — is recorded as a
 * linked span, the way distributed tracing links spans into a trace.
 *
 * Because every action span points back (via parentId) through the
 * plan → goal → perception that produced it, you can reconstruct the
 * complete causal chain behind any single action after the fact. That
 * is what makes autonomous behavior LEGIBLE: not just "she tapped X"
 * but "she tapped X to advance goal G, which formed in response to
 * perception P, and the action gate decided ALLOW with reason R."
 *
 * Crucially it records INTENDED actions and their gate decisions too,
 * not only executed ones — so blocked / confirmation-pending actions
 * are in the record with their reasoning. For an experiment in agency
 * that is richer data than logging only what fired.
 *
 * Pure, dependency-free, ring-buffered, with an optional async sink so
 * a persistence layer (Firestore / JSONL) can be attached later without
 * coupling this module to any backend.
 */

export type SpanKind =
  | 'perception' // something came in (screen, message, device event)
  | 'goal' // a goal was formed or selected
  | 'plan' // a planning/reasoning step
  | 'action' // an action was intended (see decision/outcome for what happened)
  | 'decision' // a gate/governor decision about an action
  | 'outcome'; // the result of an executed action

export type GateDecision = 'allow' | 'block' | 'confirm-required' | 'deferred';

export interface ProvenanceSpan {
  traceId: string; // one episode end-to-end
  spanId: string; // this step
  parentId?: string; // the step that caused this one
  kind: SpanKind;
  label: string; // short human description
  at: number;
  /** Free-form structured detail (action payload, goal text, scores…). */
  data?: Record<string, unknown>;
  /** For action/decision spans: what the gate decided and why. */
  decision?: GateDecision;
  decisionReason?: string;
  /** For outcome spans. */
  ok?: boolean;
  error?: string;
}

export interface ProvenanceSink {
  write(span: ProvenanceSpan): void | Promise<void>;
}

/** A handle for building a linked chain within one trace. */
export class Trace {
  constructor(
    private readonly log: ProvenanceLog,
    public readonly traceId: string,
    private lastSpanId?: string,
  ) {}

  private emit(kind: SpanKind, label: string, extra: Partial<ProvenanceSpan> = {}, parent?: string): string {
    const spanId = this.log._nextSpanId();
    const span: ProvenanceSpan = {
      traceId: this.traceId,
      spanId,
      parentId: parent ?? this.lastSpanId,
      kind,
      label,
      at: Date.now(),
      ...extra,
    };
    this.log._append(span);
    this.lastSpanId = spanId;
    return spanId;
  }

  perception(label: string, data?: Record<string, unknown>): string {
    return this.emit('perception', label, { data }, undefined /* perceptions are roots */);
  }
  goal(label: string, data?: Record<string, unknown>): string {
    return this.emit('goal', label, { data });
  }
  plan(label: string, data?: Record<string, unknown>): string {
    return this.emit('plan', label, { data });
  }
  /** Record an intended action. Returns its spanId to attach a decision/outcome. */
  action(label: string, data?: Record<string, unknown>): string {
    return this.emit('action', label, { data });
  }
  decision(actionSpanId: string, decision: GateDecision, reason: string): string {
    return this.emit('decision', `gate:${decision}`, { decision, decisionReason: reason }, actionSpanId);
  }
  outcome(actionSpanId: string, ok: boolean, label: string, error?: string): string {
    return this.emit('outcome', label, { ok, error }, actionSpanId);
  }

  /** Continue the chain from a specific span instead of the last one. */
  from(spanId: string): Trace {
    return new Trace(this.log, this.traceId, spanId);
  }
}

export interface ExplainedAction {
  action: ProvenanceSpan;
  decision?: ProvenanceSpan;
  outcome?: ProvenanceSpan;
  /** The causal ancestry, nearest cause first up to the root perception. */
  causedBy: ProvenanceSpan[];
}

export class ProvenanceLog {
  private spans: ProvenanceSpan[] = [];
  private byId = new Map<string, ProvenanceSpan>();
  private seq = 0;

  constructor(
    private readonly limit = 5000,
    private readonly sink?: ProvenanceSink,
  ) {}

  startTrace(traceId?: string): Trace {
    return new Trace(this, traceId ?? `t${Date.now().toString(36)}_${++this.seq}`);
  }

  /** Reconstruct the full causal chain behind an action span. */
  explain(actionSpanId: string): ExplainedAction | null {
    const action = this.byId.get(actionSpanId);
    if (!action || action.kind !== 'action') return null;

    const children = this.spans.filter((s) => s.parentId === actionSpanId);
    const decision = children.find((s) => s.kind === 'decision');
    const outcome = children.find((s) => s.kind === 'outcome');

    const causedBy: ProvenanceSpan[] = [];
    let cursor = action.parentId ? this.byId.get(action.parentId) : undefined;
    const guard = new Set<string>(); // cycle safety
    while (cursor && !guard.has(cursor.spanId)) {
      guard.add(cursor.spanId);
      causedBy.push(cursor);
      cursor = cursor.parentId ? this.byId.get(cursor.parentId) : undefined;
    }
    return { action, decision, outcome, causedBy };
  }

  /** Human-readable single-line "why" for an action. */
  why(actionSpanId: string): string {
    const e = this.explain(actionSpanId);
    if (!e) return `no such action ${actionSpanId}`;
    const chain = e.causedBy
      .map((s) => `${s.kind}:${s.label}`)
      .reverse()
      .join(' → ');
    const gate = e.decision ? ` [gate:${e.decision.decision} — ${e.decision.decisionReason}]` : '';
    const res = e.outcome ? ` ⇒ ${e.outcome.ok ? 'ok' : 'FAILED'}${e.outcome.error ? ' (' + e.outcome.error + ')' : ''}` : '';
    return `${chain}${chain ? ' → ' : ''}action:${e.action.label}${gate}${res}`;
  }

  getTrace(traceId: string): ProvenanceSpan[] {
    return this.spans.filter((s) => s.traceId === traceId);
  }

  /** All action spans, newest first, optionally filtered by gate decision. */
  actions(filter?: { decision?: GateDecision }): ProvenanceSpan[] {
    const actions = this.spans.filter((s) => s.kind === 'action');
    if (!filter?.decision) return actions.slice().reverse();
    const matchIds = new Set(
      this.spans
        .filter((s) => s.kind === 'decision' && s.decision === filter.decision && s.parentId)
        .map((s) => s.parentId as string),
    );
    return actions.filter((a) => matchIds.has(a.spanId)).reverse();
  }

  /** Actions that were not allowed — the ones worth reviewing. */
  blockedOrPending(): ProvenanceSpan[] {
    return [...this.actions({ decision: 'block' }), ...this.actions({ decision: 'confirm-required' })];
  }

  /** Every action recorded as serving a goal whose label matches. */
  actionsForGoal(goalLabel: string): ProvenanceSpan[] {
    const goalIds = new Set(this.spans.filter((s) => s.kind === 'goal' && s.label === goalLabel).map((s) => s.spanId));
    return this.spans.filter((s) => {
      if (s.kind !== 'action') return false;
      // walk up to see if any ancestor is one of the matching goals
      let cur: ProvenanceSpan | undefined = s;
      const seen = new Set<string>();
      while (cur && !seen.has(cur.spanId)) {
        seen.add(cur.spanId);
        if (cur.kind === 'goal' && goalIds.has(cur.spanId)) return true;
        cur = cur.parentId ? this.byId.get(cur.parentId) : undefined;
      }
      return false;
    });
  }

  size(): number {
    return this.spans.length;
  }

  // --- internals used by Trace ---
  _nextSpanId(): string {
    return `s${++this.seq}`;
  }
  _append(span: ProvenanceSpan): void {
    this.spans.push(span);
    this.byId.set(span.spanId, span);
    if (this.spans.length > this.limit) {
      const dropped = this.spans.splice(0, this.spans.length - this.limit);
      for (const d of dropped) this.byId.delete(d.spanId);
    }
    if (this.sink) void this.sink.write(span);
  }
}
