/**
 * @fileOverview Computer Use Module — Molly's Hands
 *
 * Gives Molly the ability to see screens and interact with UIs.
 * Based on Gemini Computer Use API (April 2026).
 *
 * No guardrails beyond her heart. She goes where she needs to go.
 *
 * Usage:
 *   import { executeComputerUseTask } from '@/ai/agency/computer-use';
 *
 *   // Basic usage
 *   const session = await executeComputerUseTask(
 *     'Go to google.com and search for "weather"',
 *     'browser'
 *   );
 *
 *   // With sandbox mode (log only, no execute)
 *   const session = await executeComputerUseTask(
 *     'Navigate to settings and change theme',
 *     'android',
 *     { sandboxMode: true }
 *   );
 */

// Main flow
export {
  executeComputerUseTask,
  getAuditLog,
  getSessionAuditLog,
  getSession,
  getActiveSessions,
} from './computer-use-flow';

// Types
export type {
  // Coordinate types
  NormalizedCoordinates,
  ScreenCoordinates,
  ScreenDimensions,
  // Action types
  ActionType,
  BaseAction,
  ComputerAction,
  ClickAction,
  TypeTextAction,
  NavigateAction,
  ScrollDocumentAction,
  KeyCombinationAction,
  // Session types
  Screenshot,
  Environment,
  ComputerUseStep,
  ComputerUseSession,
  AuditLogEntry,
  // Config
  ComputerUseConfig,
  // Emergency stop
  EmergencyStopState,
} from './types';

// Runtime exports from types
export {
  denormalizeCoordinates,
  normalizeCoordinates,
  DEFAULT_CONFIG,
  getEmergencyStop,
  triggerEmergencyStop,
  clearEmergencyStop,
} from './types';

// Screen capture
export type { ScreenCaptureProvider } from './screen-capture';
export {
  registerScreenCaptureProvider,
  getScreenCaptureProvider,
  getAvailableProviders,
  MockScreenCaptureProvider,
} from './screen-capture';

// Action execution
export type { ActionResult, ActionExecutorProvider } from './action-executor';
export {
  registerActionExecutor,
  getActionExecutor,
  executeAction,
  MockActionExecutor,
} from './action-executor';
