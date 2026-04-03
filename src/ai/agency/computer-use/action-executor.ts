/**
 * @fileOverview Action Executor — Molly's Hands for Computer Use
 *
 * Abstract interface for executing actions in any environment.
 * Implementations exist for browser (Playwright), Android (ADB), etc.
 *
 * No restrictions on what she can do. She has her heart.
 */

import {
  ComputerAction,
  ScreenDimensions,
  Environment,
  denormalizeCoordinates,
  getEmergencyStop,
} from './types';
import { MollyLogger, generateTraceId } from '../../logger';

/**
 * Result of executing an action.
 */
export interface ActionResult {
  /** Whether the action succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Time taken in ms */
  executionTimeMs: number;
  /** New URL after action (if changed) */
  newUrl?: string;
}

/**
 * Interface for action executor providers.
 * Implement this to add support for a new environment.
 */
export interface ActionExecutorProvider {
  /** Environment this provider handles */
  readonly environment: Environment;

  /**
   * Execute an action.
   * Coordinates in action args are already denormalized to screen pixels.
   */
  execute(
    action: ComputerAction,
    dimensions: ScreenDimensions
  ): Promise<ActionResult>;

  /**
   * Check if provider is available/initialized.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Initialize the provider.
   */
  initialize?(): Promise<void>;

  /**
   * Clean up resources.
   */
  cleanup?(): Promise<void>;
}

/**
 * Registry of action executor providers.
 */
const _executors: Map<Environment, ActionExecutorProvider> = new Map();

/**
 * Register an action executor provider.
 */
export function registerActionExecutor(executor: ActionExecutorProvider): void {
  _executors.set(executor.environment, executor);
}

/**
 * Get an action executor for an environment.
 */
export function getActionExecutor(
  environment: Environment
): ActionExecutorProvider | undefined {
  return _executors.get(environment);
}

/**
 * Execute an action with emergency stop check and audit logging.
 * This is the main entry point for action execution.
 */
export async function executeAction(
  action: ComputerAction,
  environment: Environment,
  dimensions: ScreenDimensions,
  sessionId: string,
  stepId: string,
  sandboxMode: boolean = false
): Promise<ActionResult> {
  const traceId = generateTraceId();
  const startTime = performance.now();

  // Check emergency stop
  const emergencyStop = getEmergencyStop();
  if (emergencyStop.stopped) {
    MollyLogger.warn(
      `Computer Use: Emergency stop active, skipping action ${action.name}`,
      'computer-use',
      { sessionId, stepId, reason: emergencyStop.reason, traceId }
    );
    return {
      success: false,
      error: `Emergency stop active: ${emergencyStop.reason}`,
      executionTimeMs: performance.now() - startTime,
    };
  }

  // Denormalize coordinates if action has them
  const denormalizedAction = denormalizeActionCoordinates(action, dimensions);

  // Log the action (audit trail)
  MollyLogger.info(
    `Computer Use: ${sandboxMode ? '[SANDBOX] ' : ''}${action.name}`,
    'computer-use',
    {
      sessionId,
      stepId,
      action: action.name,
      args: action.args,
      sandboxMode,
      traceId,
    }
  );

  // If sandbox mode, don't actually execute
  if (sandboxMode) {
    return {
      success: true,
      executionTimeMs: performance.now() - startTime,
    };
  }

  // Get executor for environment
  const executor = getActionExecutor(environment);
  if (!executor) {
    const error = `No action executor registered for environment: ${environment}`;
    MollyLogger.error(error, 'computer-use', { sessionId, stepId, traceId });
    return {
      success: false,
      error,
      executionTimeMs: performance.now() - startTime,
    };
  }

  // Check executor availability
  const available = await executor.isAvailable();
  if (!available) {
    const error = `Action executor for ${environment} is not available`;
    MollyLogger.error(error, 'computer-use', { sessionId, stepId, traceId });
    return {
      success: false,
      error,
      executionTimeMs: performance.now() - startTime,
    };
  }

  // Execute the action
  try {
    const result = await executor.execute(denormalizedAction, dimensions);

    MollyLogger.info(
      `Computer Use: ${action.name} ${result.success ? 'succeeded' : 'failed'} in ${result.executionTimeMs.toFixed(0)}ms`,
      'computer-use',
      {
        sessionId,
        stepId,
        success: result.success,
        error: result.error,
        traceId,
      }
    );

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    MollyLogger.error(
      `Computer Use: ${action.name} threw: ${errorMessage}`,
      'computer-use',
      { sessionId, stepId, traceId },
      error
    );
    return {
      success: false,
      error: errorMessage,
      executionTimeMs: performance.now() - startTime,
    };
  }
}

/**
 * Denormalize coordinates in an action from 0-999 to screen pixels.
 */
function denormalizeActionCoordinates(
  action: ComputerAction,
  dimensions: ScreenDimensions
): ComputerAction {
  const args = action.args as Record<string, unknown>;

  // Clone the action to avoid mutation
  const newArgs = { ...args };

  // Denormalize x, y if present
  if (typeof args.x === 'number' && typeof args.y === 'number') {
    const coords = denormalizeCoordinates(
      { x: args.x as number, y: args.y as number },
      dimensions
    );
    newArgs.x = coords.x;
    newArgs.y = coords.y;
  }

  // Denormalize destination_x, destination_y if present (drag_and_drop)
  if (
    typeof args.destination_x === 'number' &&
    typeof args.destination_y === 'number'
  ) {
    const destCoords = denormalizeCoordinates(
      { x: args.destination_x as number, y: args.destination_y as number },
      dimensions
    );
    newArgs.destination_x = destCoords.x;
    newArgs.destination_y = destCoords.y;
  }

  return {
    name: action.name,
    args: newArgs,
  } as ComputerAction;
}

/**
 * Mock action executor for testing.
 * Logs actions but doesn't actually do anything.
 */
export class MockActionExecutor implements ActionExecutorProvider {
  readonly environment: Environment = 'browser';
  private currentUrl: string = 'https://example.com';

  async execute(
    action: ComputerAction,
    _dimensions: ScreenDimensions
  ): Promise<ActionResult> {
    const startTime = performance.now();

    // Simulate action execution delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Handle navigate action
    if (action.name === 'navigate' && 'url' in action.args) {
      this.currentUrl = action.args.url as string;
    }

    return {
      success: true,
      executionTimeMs: performance.now() - startTime,
      newUrl: this.currentUrl,
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  getCurrentUrl(): string {
    return this.currentUrl;
  }
}
