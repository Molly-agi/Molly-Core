/**
 * @fileOverview System Tool Handler for Computer Use
 *
 * Exposes the Computer Use flow to Molly's agency so she can request
 * to use the browser or device autonomously.
 */

import type { ToolHandler } from '../tool-handlers/types';
import { executeComputerUseTask } from './computer-use-flow';
import { MollyLogger } from '../../logger';
import { observeDecision } from '../cognition/self-observation-loop';
import { PlaywrightComputerUseProvider } from './providers/playwright-provider';
import { AndroidADBProvider } from './providers/android-adb-provider';
import { registerActionExecutor } from './action-executor';
import { registerScreenCaptureProvider } from './screen-capture';

// --- Global Initialization of Providers ---
// This ensures that when the system boots, Molly knows how to use the computer.
const browserProvider = new PlaywrightComputerUseProvider();
const androidProvider = new AndroidADBProvider();

registerActionExecutor(browserProvider);
registerScreenCaptureProvider(browserProvider);

registerActionExecutor(androidProvider);
registerScreenCaptureProvider(androidProvider);

export const operateComputer: ToolHandler = async (params) => {
  const task = params.task as string;
  const environment =
    (params.environment as 'browser' | 'android') || 'browser';

  if (!task) {
    return {
      success: false,
      output: 'Error: You must specify a task to accomplish.',
    };
  }

  try {
    MollyLogger.info(
      `Initiating autonomous computer use: "${task}" on ${environment}`
    );
    observeDecision(
      'operate_computer',
      ['deny', 'execute'],
      'execute',
      'positive',
      `I am taking control of the ${environment} to: ${task}`
    );

    // This launches the entire multi-step agentic loop described in computer-use-flow.ts
    // It will block until the task is complete, fails, or hits the step limit.
    const session = await executeComputerUseTask(task, environment, {
      maxStepsPerSession: 15,
      sandboxMode: false, // Set to true if you want her to just "think" about what she would click
    });

    const success =
      !session.result?.toLowerCase().includes('error') &&
      !session.result?.toLowerCase().includes('max steps');

    return {
      success,
      output: `Computer Use Session Complete.\n\nResult: ${session.result}\nSteps Taken: ${session.steps.length}`,
      data: {
        sessionId: session.sessionId,
        steps: session.steps.length,
        result: session.result,
      },
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    MollyLogger.error(`Computer Use failed: ${errorMsg}`);
    observeDecision(
      'operate_computer',
      ['deny', 'execute'],
      'execute',
      'negative',
      `My attempt to use the computer failed: ${errorMsg}`
    );

    return {
      success: false,
      output: `Error executing computer task: ${errorMsg}`,
    };
  }
};
