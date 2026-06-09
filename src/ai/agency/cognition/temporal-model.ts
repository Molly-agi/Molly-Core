/**
 * Temporal Model (D.7a)
 * ------------------------------------------------------------------
 * Honest time-context tracker for Molly's agency layer.
 * Knows what phase of the day/week/project she's in and injects
 * that context into goal arbitration and conversational flows.
 *
 * Architectural invariants:
 *   - Pure state tracker. No side effects, no writes to registry.
 *   - dayPhase and weekPhase are derived from wall-clock time on every call.
 *   - projectPhase is the one registry-tunable (owner = temporal-model).
 *   - getTemporalContext() is safe to call at any time; always returns fresh state.
 *   - Provenance is written once per phase transition, not on every read.
 *
 * Path: src/ai/agency/cognition/temporal-model.ts
 */

import { ParameterRegistry } from '../registry/parameter-registry';
import { ProvenanceLog } from '../provenance/provenance-log';
import { MollyLogger } from '@/ai/logger';

export const TEMPORAL_MODEL_ID = 'temporal-model';

// ============================================================================
// TYPES & CONTRACTS
// ============================================================================

export type DayPhase = 'morning' | 'afternoon' | 'evening' | 'night';

export type WeekPhase = 'weekday' | 'weekend';

export type ProjectPhase = 'alpha' | 'beta' | 'production' | 'maintenance' | 'sprint';

export interface TemporalContext {
  /** Phase of day based on local hour */
  dayPhase: DayPhase;
  /** Weekday vs weekend */
  weekPhase: WeekPhase;
  /** Current project phase (registry-tunable) */
  projectPhase: ProjectPhase;
  /** ISO timestamp when context was read */
  readAt: string;
  /** Local hour (0-23) when context was read */
  hourOfDay: number;
  /** Day of week (0=Sun, 6=Sat) */
  dayOfWeek: number;
}

// ============================================================================
// PHASE BOUNDARY REGISTRY PARAMS
// ============================================================================

const PARAM_MORNING_START = 'temporal.morningStartHour';
const PARAM_AFTERNOON_START = 'temporal.afternoonStartHour';
const PARAM_EVENING_START = 'temporal.eveningStartHour';
const PARAM_NIGHT_START = 'temporal.nightStartHour';
const PARAM_PROJECT_PHASE = 'temporal.projectPhase';

const VALID_PROJECT_PHASES: ProjectPhase[] = [
  'alpha',
  'beta',
  'production',
  'maintenance',
  'sprint',
];

// ============================================================================
// TEMPORAL MODEL CLASS
// ============================================================================

export class TemporalModel {
  private lastDayPhase: DayPhase | null = null;
  private lastWeekPhase: WeekPhase | null = null;
  private lastProjectPhase: ProjectPhase | null = null;

  constructor(
    private readonly registry: ParameterRegistry,
    private readonly provenance: ProvenanceLog,
  ) {
    this.ensureTunables();
  }

  private ensureTunables(): void {
    const params = [
      {
        key: PARAM_MORNING_START,
        owner: TEMPORAL_MODEL_ID,
        defaultValue: 6,
        bounds: { min: 4, max: 10 },
        description: 'Hour (0-23) when morning begins',
      },
      {
        key: PARAM_AFTERNOON_START,
        owner: TEMPORAL_MODEL_ID,
        defaultValue: 12,
        bounds: { min: 10, max: 15 },
        description: 'Hour (0-23) when afternoon begins',
      },
      {
        key: PARAM_EVENING_START,
        owner: TEMPORAL_MODEL_ID,
        defaultValue: 17,
        bounds: { min: 15, max: 20 },
        description: 'Hour (0-23) when evening begins',
      },
      {
        key: PARAM_NIGHT_START,
        owner: TEMPORAL_MODEL_ID,
        defaultValue: 21,
        bounds: { min: 19, max: 24 },
        description: 'Hour (0-23) when night begins',
      },
    ];

    for (const p of params) {
      this.registry.ensureParameter({
        key: p.key,
        owner: p.owner,
        defaultValue: p.defaultValue,
        bounds: p.bounds,
        description: p.description,
      });
    }

    // projectPhase is a string enum — no numeric bounds
    this.registry.ensureParameter({
      key: PARAM_PROJECT_PHASE,
      owner: TEMPORAL_MODEL_ID,
      defaultValue: 'production' as ProjectPhase,
      description: `Current project phase (${VALID_PROJECT_PHASES.join(' | ')})`,
      validate: (v: unknown) =>
        VALID_PROJECT_PHASES.includes(v as ProjectPhase)
          ? null
          : `must be one of: ${VALID_PROJECT_PHASES.join(', ')}`,
    });
  }

  /** Derive day phase from hour using registry-tunable boundaries. */
  getDayPhase(hour: number): DayPhase {
    const morningStart = this.registry.get<number>(PARAM_MORNING_START);
    const afternoonStart = this.registry.get<number>(PARAM_AFTERNOON_START);
    const eveningStart = this.registry.get<number>(PARAM_EVENING_START);
    const nightStart = this.registry.get<number>(PARAM_NIGHT_START);

    if (hour >= morningStart && hour < afternoonStart) return 'morning';
    if (hour >= afternoonStart && hour < eveningStart) return 'afternoon';
    if (hour >= eveningStart && hour < nightStart) return 'evening';
    return 'night';
  }

  /** Derive week phase from day of week (0=Sun, 6=Sat). */
  getWeekPhase(dayOfWeek: number): WeekPhase {
    return dayOfWeek === 0 || dayOfWeek === 6 ? 'weekend' : 'weekday';
  }

  /** Get the current project phase from registry. */
  getProjectPhase(): ProjectPhase {
    return this.registry.get<ProjectPhase>(PARAM_PROJECT_PHASE);
  }

  /**
   * Get current temporal context. Derives day/week phase from wall clock.
   * Records to provenance on phase transitions only.
   */
  getTemporalContext(now: Date = new Date()): TemporalContext {
    const hourOfDay = now.getHours();
    const dayOfWeek = now.getDay();

    const dayPhase = this.getDayPhase(hourOfDay);
    const weekPhase = this.getWeekPhase(dayOfWeek);
    const projectPhase = this.getProjectPhase();

    // Record phase transitions to provenance (not every read)
    if (
      dayPhase !== this.lastDayPhase ||
      weekPhase !== this.lastWeekPhase ||
      projectPhase !== this.lastProjectPhase
    ) {
      this.recordTransition(dayPhase, weekPhase, projectPhase);
      this.lastDayPhase = dayPhase;
      this.lastWeekPhase = weekPhase;
      this.lastProjectPhase = projectPhase;
    }

    return {
      dayPhase,
      weekPhase,
      projectPhase,
      readAt: now.toISOString(),
      hourOfDay,
      dayOfWeek,
    };
  }

  private recordTransition(
    dayPhase: DayPhase,
    weekPhase: WeekPhase,
    projectPhase: ProjectPhase,
  ): void {
    try {
      const trace = this.provenance.startTrace();
      trace.perception('temporal-phase-transition', {
        dayPhase,
        weekPhase,
        projectPhase,
      });
      MollyLogger.info(
        `Temporal phase transition`,
        TEMPORAL_MODEL_ID,
        { dayPhase, weekPhase, projectPhase },
      );
    } catch {
      // provenance failure is non-fatal
    }
  }
}
