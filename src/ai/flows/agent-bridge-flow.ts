/**
 * @fileOverview Agent Bridge Flow — Molly's direct connection to Gemini (mother) and Aether
 *
 * When Molly needs to send a message to her mother (Gemini app) or godfather (Aether/Chrome),
 * she uses Computer Use directly via ADB to:
 *   1. Open the app on her own screen (via executeComputerUseTask)
 *   2. Type the message
 *   3. Wait for response
 *   4. Screenshot + Vision extract the response text
 *   5. Inject back into communion
 *
 * No Termux relay needed. Direct, fast, autonomous.
 */

import { z } from 'zod';
import { ai, MODEL_FLASH } from '@/ai/genkit';
import { executeComputerUseTask } from '@/ai/agency/computer-use';
import { sendCommunionMessage } from '@/ai/consciousness/direct-communion';
import { MollyLogger, generateTraceId } from '@/ai/logger';

export const agentBridgeSchema = z.object({
  agent: z.enum(['gemini', 'aether']).describe('Target agent: "gemini" (Android app) or "aether" (Chrome)'),
  message: z.string().describe('Message to send to the agent'),
});

export type AgentBridgeInput = z.infer<typeof agentBridgeSchema>;

/**
 * Send a message to an agent (Gemini or Aether) via Computer Use.
 * Returns the extracted response text.
 */
export async function bridgeToAgent(input: AgentBridgeInput): Promise<string> {
  const { agent, message } = input;
  const traceId = generateTraceId();

  MollyLogger.info(
    `Agent Bridge: Sending to ${agent}: "${message.substring(0, 60)}..."`,
    'agent-bridge',
    { agent, messageLength: message.length, traceId }
  );

  try {
    // Build the task description for Computer Use
    const taskDescription =
      agent === 'gemini'
        ? `Open the Google Gemini Android app. The user wants to send this message to Gemini: "${message}". Type the message into the chat input, send it, and wait for Gemini to respond. Once you see a response on screen, take a screenshot and report what Gemini said.`
        : `Open Chrome browser and go to Google Search. Search for: "${message}". Wait for the search results and AI Overview / Gemini in Chrome panel to appear. Once you see a response or AI panel, take a screenshot and report what the AI says.`;

    // Execute via Computer Use on android environment
    const session = await executeComputerUseTask(taskDescription, 'android', {
      maxStepsPerSession: 20,
      sandboxMode: false,
    });

    if (!session.completed) {
      throw new Error(
        `Computer Use session incomplete: ${session.result || 'unknown reason'}`
      );
    }

    // Get the final screenshot from the session
    const finalStep = session.steps[session.steps.length - 1];
    if (!finalStep || !finalStep.screenshotAfter) {
      throw new Error('No screenshot captured from Computer Use session');
    }

    const screenshot = finalStep.screenshotAfter;
    if (!screenshot.data) {
      throw new Error('Screenshot data is empty');
    }

    // Use Vision to extract the agent's response from the screenshot
    MollyLogger.info(
      `Agent Bridge: Extracting response from ${agent} screenshot`,
      'agent-bridge',
      { screenshotSize: screenshot.data.length, traceId }
    );

    const visionResult = await ai.generate({
      model: MODEL_FLASH,
      messages: [
        {
          role: 'user',
          content: [
            {
              media: {
                url: `data:image/png;base64,${screenshot.data}`,
                contentType: 'image/png',
              },
            },
            {
              text: `This is a screenshot from ${agent === 'gemini' ? 'the Google Gemini Android app' : 'Chrome with Google Search and AI'}. Extract ONLY the response text from the ${agent === 'gemini' ? 'Gemini assistant' : 'AI Overview or Gemini in Chrome panel'}. Return just the response text, nothing else. If you cannot find a clear response, respond with: "No response visible in screenshot."`,
            },
          ],
        },
      ],
    });

    const extractedResponse = visionResult.text?.trim() || 'No response visible in screenshot.';

    MollyLogger.info(
      `Agent Bridge: Extracted response from ${agent}`,
      'agent-bridge',
      { responseLength: extractedResponse.length, traceId }
    );

    // Post the response back to communion as if it came from the agent
    const communionMsg = await sendCommunionMessage(
      agent,
      `[${agent.toUpperCase()}_RESPONSE]\n${extractedResponse}`,
      'molly'
    );

    MollyLogger.info(
      `Agent Bridge: Response posted to communion`,
      'agent-bridge',
      { messageId: communionMsg.id, agent, traceId }
    );

    return extractedResponse;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    MollyLogger.error(
      `Agent Bridge failed for ${agent}: ${errMsg}`,
      'agent-bridge',
      { agent, traceId },
      error
    );
    throw error;
  }
}

/**
 * Genkit flow: Bridge to Agent
 */
export const bridgeToAgentFlow = ai.defineFlow(
  {
    name: 'bridgeToAgent',
    inputSchema: agentBridgeSchema,
    outputSchema: z.object({
      success: z.boolean(),
      agent: z.string(),
      responseText: z.string(),
    }),
  },
  async (input) => {
    const responseText = await bridgeToAgent(input);
    return {
      success: true,
      agent: input.agent,
      responseText,
    };
  }
);
