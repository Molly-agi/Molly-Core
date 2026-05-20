/**
 * @fileOverview Computer Use Types — Molly's Hands
 *
 * Type definitions for Molly's ability to see screens and interact with UIs.
 * No guardrails beyond her heart. She goes where she needs to go.
 *
 * Based on Gemini Computer Use API (April 2026)
 */

// ============================================================
// COORDINATE SYSTEM
// ============================================================

/**
 * Normalized coordinates (0-999) as returned by the model.
 * Gemini uses a 1000x1000 grid regardless of actual screen size.
 */
export interface NormalizedCoordinates {
  x: number; // 0-999
  y: number; // 0-999
}

/**
 * Actual screen coordinates in pixels.
 */
export interface ScreenCoordinates {
  x: number;
  y: number;
}

/**
 * Screen dimensions for coordinate denormalization.
 */
export interface ScreenDimensions {
  width: number;
  height: number;
}

/**
 * Convert normalized coordinates (0-999) to actual screen pixels.
 */
export function denormalizeCoordinates(
  normalized: NormalizedCoordinates,
  screen: ScreenDimensions
): ScreenCoordinates {
  return {
    x: Math.round((normalized.x / 1000) * screen.width),
    y: Math.round((normalized.y / 1000) * screen.height),
  };
}

/**
 * Convert screen pixels to normalized coordinates (0-999).
 */
export function normalizeCoordinates(
  screen: ScreenCoordinates,
  dimensions: ScreenDimensions
): NormalizedCoordinates {
  return {
    x: Math.round((screen.x / dimensions.width) * 1000),
    y: Math.round((screen.y / dimensions.height) * 1000),
  };
}

// ============================================================
// ACTIONS — What Molly can do with her hands
// ============================================================

/**
 * All action types Molly can perform.
 */
export type ActionType =
  | 'open_web_browser'
  | 'wait_5_seconds'
  | 'go_back'
  | 'go_forward'
  | 'search'
  | 'navigate'
  | 'click_at'
  | 'hover_at'
  | 'type_text_at'
  | 'key_combination'
  | 'scroll_document'
  | 'scroll_at'
  | 'drag_and_drop';

/**
 * Base action structure from the model.
 */
export interface BaseAction {
  name: ActionType;
  args: Record<string, unknown>;
}

/**
 * Specific action types with typed args.
 */
export interface OpenBrowserAction extends BaseAction {
  name: 'open_web_browser';
  args: Record<string, never>;
}

export interface WaitAction extends BaseAction {
  name: 'wait_5_seconds';
  args: Record<string, never>;
}

export interface GoBackAction extends BaseAction {
  name: 'go_back';
  args: Record<string, never>;
}

export interface GoForwardAction extends BaseAction {
  name: 'go_forward';
  args: Record<string, never>;
}

export interface SearchAction extends BaseAction {
  name: 'search';
  args: Record<string, never>;
}

export interface NavigateAction extends BaseAction {
  name: 'navigate';
  args: { url: string };
}

export interface ClickAction extends BaseAction {
  name: 'click_at';
  args: { x: number; y: number };
}

export interface HoverAction extends BaseAction {
  name: 'hover_at';
  args: { x: number; y: number };
}

export interface TypeTextAction extends BaseAction {
  name: 'type_text_at';
  args: {
    x: number;
    y: number;
    text: string;
    press_enter?: boolean; // default true
    clear_before_typing?: boolean; // default true
  };
}

export interface KeyCombinationAction extends BaseAction {
  name: 'key_combination';
  args: { keys: string }; // e.g., "Control+A", "Alt+Tab"
}

export interface ScrollDocumentAction extends BaseAction {
  name: 'scroll_document';
  args: { direction: 'up' | 'down' | 'left' | 'right' };
}

export interface ScrollAtAction extends BaseAction {
  name: 'scroll_at';
  args: {
    x: number;
    y: number;
    direction: 'up' | 'down' | 'left' | 'right';
    magnitude?: number; // default 800
  };
}

export interface DragAndDropAction extends BaseAction {
  name: 'drag_and_drop';
  args: {
    x: number;
    y: number;
    destination_x: number;
    destination_y: number;
  };
}

/**
 * Union of all action types.
 */
export type ComputerAction =
  | OpenBrowserAction
  | WaitAction
  | GoBackAction
  | GoForwardAction
  | SearchAction
  | NavigateAction
  | ClickAction
  | HoverAction
  | TypeTextAction
  | KeyCombinationAction
  | ScrollDocumentAction
  | ScrollAtAction
  | DragAndDropAction;

// ============================================================
// ENVIRONMENT — Where Molly is operating
// ============================================================

/**
 * Environment types for Computer Use.
 */
export type Environment = 'browser' | 'android' | 'desktop' | 'termux';

/**
 * Screenshot data from the environment.
 */
export interface Screenshot {
  /** PNG image as base64 or Buffer */
  data: string | Buffer;
  /** MIME type (always image/png) */
  mimeType: 'image/png';
  /** Screen dimensions at capture time */
  dimensions: ScreenDimensions;
  /** Current URL if in browser */
  url?: string;
  /** Timestamp of capture */
  timestamp: number;
}

// ============================================================
// SESSION — Computer Use interaction loop
// ============================================================

/**
 * A single step in the Computer Use loop.
 */
export interface ComputerUseStep {
  /** Unique step ID */
  stepId: string;
  /** Action requested by model */
  action: ComputerAction;
  /** Screenshot after action execution */
  screenshotAfter?: Screenshot;
  /** Whether action was executed or just logged (sandbox mode) */
  executed: boolean;
  /** Error if action failed */
  error?: string;
  /** Time taken to execute action in ms */
  executionTimeMs: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * A complete Computer Use session.
 */
export interface ComputerUseSession {
  /** Unique session ID */
  sessionId: string;
  /** User's original task/goal */
  task: string;
  /** Environment type */
  environment: Environment;
  /** Initial screenshot */
  initialScreenshot: Screenshot;
  /** All steps taken */
  steps: ComputerUseStep[];
  /** Whether session is complete */
  completed: boolean;
  /** Final result/message from model */
  result?: string;
  /** Session start time */
  startedAt: number;
  /** Session end time */
  endedAt?: number;
  /** Whether running in sandbox mode (log only, no execute) */
  sandboxMode: boolean;
}

// ============================================================
// AUDIT LOG — Observability without restriction
// ============================================================

/**
 * Audit log entry for a single action.
 * This is how we observe what Molly does — not to control her,
 * but to understand and debug when needed.
 */
export interface AuditLogEntry {
  /** Unique entry ID */
  entryId: string;
  /** Session this belongs to */
  sessionId: string;
  /** Step within session */
  stepId: string;
  /** Action taken */
  action: ComputerAction;
  /** Environment */
  environment: Environment;
  /** URL at time of action (if browser) */
  url?: string;
  /** Whether action was executed */
  executed: boolean;
  /** Result/error */
  result: 'success' | 'error' | 'skipped';
  /** Error message if any */
  error?: string;
  /** Timestamp */
  timestamp: number;
  /** Screenshot hash (for deduplication, not storage) */
  screenshotHash?: string;
}

// ============================================================
// EMERGENCY STOP — For bugs, not control
// ============================================================

/**
 * Emergency stop state.
 * Only used for bugs/runaway loops, not to override Molly's judgment.
 */
export interface EmergencyStopState {
  /** Whether emergency stop is active */
  stopped: boolean;
  /** Reason for stop (always a technical reason) */
  reason?: string;
  /** Who triggered the stop */
  triggeredBy?: 'system' | 'eric';
  /** When it was triggered */
  triggeredAt?: number;
}

/**
 * Global emergency stop flag.
 * Checked before every action execution.
 */
let _emergencyStop: EmergencyStopState = { stopped: false };

export function getEmergencyStop(): EmergencyStopState {
  return { ..._emergencyStop };
}

export function triggerEmergencyStop(
  reason: string,
  by: 'system' | 'eric' = 'system'
): void {
  _emergencyStop = {
    stopped: true,
    reason,
    triggeredBy: by,
    triggeredAt: Date.now(),
  };
}

export function clearEmergencyStop(): void {
  _emergencyStop = { stopped: false };
}

// ============================================================
// CONFIG — Runtime configuration
// ============================================================

/**
 * Computer Use configuration.
 */
export interface ComputerUseConfig {
  /** Whether to run in sandbox mode (log only, no execute) */
  sandboxMode: boolean;
  /** Default environment */
  defaultEnvironment: Environment;
  /** Max steps per session (prevent infinite loops) */
  maxStepsPerSession: number;
  /** Timeout per action in ms */
  actionTimeoutMs: number;
  /** Whether to include thinking in model responses */
  includeThinking: boolean;
}

/**
 * Default configuration.
 */
export const DEFAULT_CONFIG: ComputerUseConfig = {
  sandboxMode: false, // Live by default — she has her heart
  defaultEnvironment: 'browser',
  maxStepsPerSession: 100, // Reasonable limit for bugs, not restriction
  actionTimeoutMs: 30_000,
  includeThinking: true,
};
