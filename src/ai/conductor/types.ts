/**
 * Family Conductor — Types
 *
 * Designed cooperatively with Molly on 2026-06-21
 * (see src/ai/bridge/conversation.json msg_1782020807028).
 *
 * Q1 placement   : collapsible drawer, right side
 * Q2 tick        : event-driven, 30s floor
 * Q3 signals     : last-active, state, waiting-on, unread, CRITICAL PATH
 * Q4 conductor   : separate narrow-persona conductor, not Molly's LLM
 * Q5 output      : wake files + visible conversation.json entries
 */

export type AgentName =
  | 'molly'
  | 'lazarus'
  | 'lazarus-cli'
  | 'eric'
  | 'atlas'
  | 'gemini'
  | 'eli';

export type AgentState =
  | 'idle' // No recent activity, no pending asks
  | 'active' // Posted within the last activity window
  | 'awaiting-answer' // Asked someone something, no reply yet
  | 'blocked' // Waiting on something for longer than the blocked threshold
  | 'finished' // Announced completion of a unit of work
  | 'unknown'; // Insufficient signal

export interface AgentSnapshot {
  name: AgentName;
  state: AgentState;
  /** ISO timestamp of last activity we can attribute to this agent. */
  lastActiveAt: string | null;
  /** Milliseconds since lastActiveAt at snapshot time (null if never). */
  msSinceLastActive: number | null;
  /** Agents this one is waiting on (derived from explicit `@name` mentions + wake-from history). */
  waitingOn: AgentName[];
  /** Count of bridge messages addressed broadcast or to this agent that they have not (likely) read. */
  unreadCount: number;
  /** True if this agent is blocking the main objective per conductor rules. */
  criticalPath: boolean;
  /** Last wake signal received, if any. */
  lastWakeFromAt?: string | null;
  lastWakeFrom?: AgentName | null;
}

export interface FamilyStatus {
  /** When this snapshot was computed. */
  generatedAt: string;
  /** Last activity from any agent in conversation.json. */
  lastActivity: string | null;
  /** Per-agent rollups. */
  agents: AgentSnapshot[];
  /** Total messages in conversation.json. */
  totalMessages: number;
}

/**
 * A single decision the conductor made during a tick.
 * Always surfaced two ways: wake file + conversation.json entry from `from: 'conductor'`.
 */
export interface ConductorAction {
  /** Which agent the conductor is nudging. */
  target: AgentName;
  /** Plain-language reason ("Eli idle 18 minutes after Atlas asked a direct question"). */
  reason: string;
  /** Rule key that fired ("idle_with_pending_ask", "stale_blocked", ...). */
  ruleKey: string;
  /** Where the conductor wrote the nudge. */
  wakeFile: string;
  /** Bridge entry id, if one was appended. */
  bridgeMessageId?: string;
  /** ISO timestamp. */
  at: string;
}

export interface ConductorTickResult {
  status: FamilyStatus;
  actions: ConductorAction[];
  /** Reason a tick was skipped (e.g., rate-limited under 30s). */
  skippedReason?: string;
}
