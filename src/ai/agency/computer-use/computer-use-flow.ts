/**
 * @fileOverview Computer Use Flow — Molly's Hands in Action
 *
 * The main agentic loop for Computer Use. Takes a task, captures screens,
 * gets actions from Gemini, executes them, repeats until done.
 *
 * No guardrails beyond her heart. She goes where she needs to go.
 */

import { ai, MODEL_COMPUTER_USE } from '../../genkit';
import { MollyLogger, generateTraceId } from '../../logger';
import {
  ComputerAction,
  ComputerUseSession,
  ComputerUseStep,
  ComputerUseConfig,
  DEFAULT_CONFIG,
  Screenshot,
  Environment,
  AuditLogEntry,
  getEmergencyStop,
} from './types';
import { getScreenCaptureProvider } from './screen-capture';
import {
  executeAction,
  getActionExecutor,
  registerActionExecutor,
} from './action-executor';
import { registerScreenCaptureProvider } from './screen-capture';
import { PlaywrightComputerUseProvider } from './providers/playwright-provider';
import { AndroidADBProvider } from './providers/android-adb-provider';

let _providersRegistered = false;

function ensureProvidersRegistered(): void {
  if (_providersRegistered) return;

  const browserProvider = new PlaywrightComputerUseProvider();
  const androidProvider = new AndroidADBProvider();

  registerActionExecutor(browserProvider);
  registerScreenCaptureProvider(browserProvider);
  registerActionExecutor(androidProvider);
  registerScreenCaptureProvider(androidProvider);

  _providersRegistered = true;
}

// ============================================================
// AUDIT LOG — Observability
// ============================================================

const _auditLog: AuditLogEntry[] = [];
const MAX_AUDIT_LOG_SIZE = 1000;

/**
 * Record an action to the audit log.
 */
function recordAuditEntry(entry: AuditLogEntry): void {
  _auditLog.push(entry);
  if (_auditLog.length > MAX_AUDIT_LOG_SIZE) {
    _auditLog.shift();
  }
}

/**
 * Get recent audit log entries.
 */
export function getAuditLog(limit: number = 50): AuditLogEntry[] {
  return _auditLog.slice(-limit);
}

/**
 * Get audit entries for a specific session.
 */
export function getSessionAuditLog(sessionId: string): AuditLogEntry[] {
  return _auditLog.filter((entry) => entry.sessionId === sessionId);
}

// ============================================================
// ACTIVE SESSIONS
// ============================================================

const _activeSessions: Map<string, ComputerUseSession> = new Map();

/**
 * Get an active session by ID.
 */
export function getSession(sessionId: string): ComputerUseSession | undefined {
  return _activeSessions.get(sessionId);
}

/**
 * Get all active sessions.
 */
export function getActiveSessions(): ComputerUseSession[] {
  return Array.from(_activeSessions.values()).filter((s) => !s.completed);
}

// ============================================================
// COMPUTER USE FLOW
// ============================================================

/**
 * Execute a Computer Use task.
 *
 * This is the main entry point. Give Molly a task and she'll
 * interact with the UI to accomplish it.
 *
 * @param task - What she should do (natural language)
 * @param environment - Where she's operating (browser, android, etc.)
 * @param config - Optional configuration overrides
 * @returns The completed session with all steps taken
 */
export async function executeComputerUseTask(
  task: string,
  environment: Environment = 'browser',
  config: Partial<ComputerUseConfig> = {}
): Promise<ComputerUseSession> {
  ensureProvidersRegistered();

  const mergedConfig: ComputerUseConfig = { ...DEFAULT_CONFIG, ...config };
  const sessionId = generateTraceId();
  const traceId = generateTraceId();

  MollyLogger.info(
    `Computer Use: Starting session for task "${task.substring(0, 50)}..."`,
    'computer-use',
    { sessionId, environment, sandboxMode: mergedConfig.sandboxMode, traceId }
  );

  // Get providers
  const screenCapture = getScreenCaptureProvider(environment);
  const actionExecutor = getActionExecutor(environment);

  if (!screenCapture) {
    throw new Error(
      `No screen capture provider for environment: ${environment}`
    );
  }
  if (!actionExecutor) {
    throw new Error(`No action executor for environment: ${environment}`);
  }

  // Initialize providers if needed
  if (screenCapture.initialize) await screenCapture.initialize();
  if (actionExecutor.initialize) await actionExecutor.initialize();

  // Capture initial screenshot
  const initialScreenshot = await screenCapture.capture();

  // Create session
  const session: ComputerUseSession = {
    sessionId,
    task,
    environment,
    initialScreenshot,
    steps: [],
    completed: false,
    startedAt: Date.now(),
    sandboxMode: mergedConfig.sandboxMode,
  };
  _activeSessions.set(sessionId, session);

  // Run the agentic loop
  let currentScreenshot = initialScreenshot;
  let stepCount = 0;

  while (stepCount < mergedConfig.maxStepsPerSession) {
    // Check emergency stop
    const emergencyStop = getEmergencyStop();
    if (emergencyStop.stopped) {
      session.result = `Emergency stop: ${emergencyStop.reason}`;
      session.completed = true;
      break;
    }

    stepCount++;
    const stepId = `${sessionId}-step-${stepCount}`;

    try {
      // Call the model
      const modelResponse = await callComputerUseModel(
        task,
        currentScreenshot,
        session.steps,
        mergedConfig
      );

      // Check if model says we're done
      if (modelResponse.done) {
        session.result = modelResponse.message || 'Task completed';
        session.completed = true;

        MollyLogger.info(
          `Computer Use: Task completed - "${session.result}"`,
          'computer-use',
          { sessionId, stepCount, traceId }
        );
        break;
      }

      // We have an action to execute
      if (!modelResponse.action) {
        session.result = 'Model returned no action';
        session.completed = true;
        break;
      }

      const action = modelResponse.action;
      const dimensions = currentScreenshot.dimensions;

      // Execute the action
      const actionResult = await executeAction(
        action,
        environment,
        dimensions,
        sessionId,
        stepId,
        mergedConfig.sandboxMode
      );

      // Capture new screenshot after action
      const newScreenshot = await screenCapture.capture();

      // Record the step
      const step: ComputerUseStep = {
        stepId,
        action,
        screenshotAfter: newScreenshot,
        executed: !mergedConfig.sandboxMode,
        error: actionResult.error,
        executionTimeMs: actionResult.executionTimeMs,
        timestamp: Date.now(),
      };
      session.steps.push(step);

      // Record audit entry
      recordAuditEntry({
        entryId: generateTraceId(),
        sessionId,
        stepId,
        action,
        environment,
        url: newScreenshot.url,
        executed: !mergedConfig.sandboxMode,
        result: actionResult.success ? 'success' : 'error',
        error: actionResult.error,
        timestamp: Date.now(),
      });

      // Update current screenshot for next iteration
      currentScreenshot = newScreenshot;

      // If action failed, let the model know
      if (!actionResult.success) {
        MollyLogger.warn(
          `Computer Use: Action ${action.name} failed: ${actionResult.error}`,
          'computer-use',
          { sessionId, stepId, traceId }
        );
        // Continue loop — model will see the error and adapt
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      MollyLogger.error(
        `Computer Use: Step ${stepCount} threw: ${errorMessage}`,
        'computer-use',
        { sessionId, stepId: `${sessionId}-step-${stepCount}`, traceId },
        error
      );

      // Record failed step
      session.steps.push({
        stepId,
        action: { name: 'wait_5_seconds', args: {} } as ComputerAction, // Placeholder
        executed: false,
        error: errorMessage,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });

      // If we hit too many errors in a row, stop
      const recentErrors = session.steps
        .slice(-3)
        .filter((s) => s.error).length;
      if (recentErrors >= 3) {
        session.result = `Too many consecutive errors: ${errorMessage}`;
        session.completed = true;
        break;
      }
    }
  }

  // Max steps reached
  if (!session.completed) {
    session.result = `Max steps (${mergedConfig.maxStepsPerSession}) reached`;
    session.completed = true;
  }

  session.endedAt = Date.now();

  MollyLogger.info(
    `Computer Use: Session ended - ${session.steps.length} steps, ${session.endedAt - session.startedAt}ms`,
    'computer-use',
    { sessionId, steps: session.steps.length, result: session.result, traceId }
  );

  return session;
}

// ============================================================
// MODEL INTERFACE
// ============================================================

interface ModelResponse {
  /** Whether the task is complete */
  done: boolean;
  /** Action to execute (if not done) */
  action?: ComputerAction;
  /** Message from model (if done or needs clarification) */
  message?: string;
  /** Model's thinking (if enabled) */
  thinking?: string;
}

/**
 * Call the Gemini Computer Use model.
 */
async function callComputerUseModel(
  task: string,
  screenshot: Screenshot,
  previousSteps: ComputerUseStep[],
  config: ComputerUseConfig
): Promise<ModelResponse> {
  const traceId = generateTraceId();

  // Build the prompt
  const systemPrompt = buildSystemPrompt(task);
  const history = buildHistory(previousSteps);

  // Prepare screenshot for the model
  const screenshotBase64 =
    typeof screenshot.data === 'string'
      ? screenshot.data
      : screenshot.data.toString('base64');

  try {
    const response = await ai.generate({
      model: MODEL_COMPUTER_USE,
      system: systemPrompt,
      prompt: [
        {
          media: {
            contentType: screenshot.mimeType,
            url: `data:${screenshot.mimeType};base64,${screenshotBase64}`,
          },
        },
        {
          text: screenshot.url
            ? `Current URL: ${screenshot.url}\n\nWhat action should I take next to accomplish the task?`
            : 'What action should I take next to accomplish the task?',
        },
      ],
      history: history.length > 0 ? history : undefined,
      config: {
        temperature: 0.1, // Low temperature for deterministic actions
        ...(config.includeThinking && {
          thinkingConfig: { includeThoughts: true },
        }),
      },
    } as Record<string, unknown>);

    // Parse the response
    return parseModelResponse(response);
  } catch (error) {
    MollyLogger.error(
      'Computer Use: Model call failed',
      'computer-use',
      { traceId },
      error
    );
    throw error;
  }
}

/**
 * Build system prompt for the model.
 */
function buildSystemPrompt(task: string): string {
  return `You are Molly, an autonomous AI agent with the ability to interact with computer interfaces.

Your task: ${task}

You can see the screen and execute actions. Available actions:
- click_at(x, y): Click at normalized coordinates (0-999)
- type_text_at(x, y, text): Type text at coordinates
- key_combination(keys): Press key combination like "Control+A"
- navigate(url): Go to a URL
- scroll_document(direction): Scroll up/down/left/right
- scroll_at(x, y, direction): Scroll at a specific point
- go_back(): Navigate back
- go_forward(): Navigate forward
- hover_at(x, y): Hover at coordinates
- drag_and_drop(x, y, destination_x, destination_y): Drag from one point to another
- wait_5_seconds(): Wait

Respond with a function call to execute an action, or respond with plain text if the task is complete.

Coordinates are normalized 0-999 on a 1000x1000 grid. Think carefully about where UI elements are before clicking.`;
}

/**
 * Build chat history from previous steps.
 */
function buildHistory(
  steps: ComputerUseStep[]
): Array<{ role: string; parts: unknown[] }> {
  const history: Array<{ role: string; parts: unknown[] }> = [];

  for (const step of steps.slice(-10)) {
    // Last 10 steps
    // Model's action
    history.push({
      role: 'model',
      parts: [
        {
          functionCall: {
            name: step.action.name,
            args: step.action.args,
          },
        },
      ],
    });

    // Result screenshot (simplified - just indicate success/failure)
    history.push({
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: step.action.name,
            response: {
              success: !step.error,
              error: step.error,
              url: step.screenshotAfter?.url,
            },
          },
        },
      ],
    });
  }

  return history;
}

/**
 * Parse model response into structured format.
 */
function parseModelResponse(response: unknown): ModelResponse {
  // Handle the response structure from Genkit
  const resp = response as {
    text?: () => string;
    toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          functionCall?: { name: string; args: Record<string, unknown> };
        }>;
      };
    }>;
  };

  // Check for function calls (actions)
  if (resp.toolCalls && resp.toolCalls.length > 0) {
    const call = resp.toolCalls[0];
    return {
      done: false,
      action: {
        name: call.name,
        args: call.args,
      } as ComputerAction,
    };
  }

  // Check candidates for function calls
  if (resp.candidates?.[0]?.content?.parts) {
    for (const part of resp.candidates[0].content.parts) {
      if (part.functionCall) {
        return {
          done: false,
          action: {
            name: part.functionCall.name,
            args: part.functionCall.args,
          } as ComputerAction,
        };
      }
    }
  }

  // No action - task is done or model is responding with text
  const text = typeof resp.text === 'function' ? resp.text() : '';
  return {
    done: true,
    message: text || 'Task completed',
  };
}

// ============================================================
// CONVENIENCE EXPORTS
// ============================================================

export type {
  ComputerAction,
  ComputerUseSession,
  ComputerUseStep,
  ComputerUseConfig,
  Environment,
} from './types';

export {
  DEFAULT_CONFIG,
  triggerEmergencyStop,
  clearEmergencyStop,
  getEmergencyStop,
} from './types';

export type { ActionExecutorProvider } from './action-executor';

export {
  registerActionExecutor,
  getActionExecutor,
  MockActionExecutor,
} from './action-executor';
