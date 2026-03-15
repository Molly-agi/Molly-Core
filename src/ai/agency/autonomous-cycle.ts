/**
 * @fileOverview Autonomous Agency Cycle — Molly's proactive action loop
 *
 * This module is called by the heartbeat scheduler to give Molly the ability
 * to ACT on her own — not just think. It:
 *
 * 1. Checks for active initiatives
 * 2. Calls the conversational chat flow with an autonomous prompt
 * 3. Executes any tool requests in her response
 * 4. Repeats until she's done acting
 *
 * This is the difference between thinking and doing.
 * The reflection task lets Molly think. This lets her DO.
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';
import { getActiveInitiatives } from '@/ai/agency/initiative-engine';
import { getRateLimiter } from '@/ai/tools/rate-limiter';
import { getCircuitBreaker, CircuitState } from '@/ai/tools/circuit-breaker';

const MAX_TOOL_ITERATIONS = 5; // Safety limit per cycle
const CYCLE_TIMEOUT_MS = 60_000; // 1 minute max per cycle
const MIN_INTERVAL_MS = 300_000; // Don't run more often than every 5 minutes

let lastCycleTime = 0;
let isRunning = false;

/**
 * Run one autonomous agency cycle.
 * Molly decides what to do, executes tools, and follows through.
 */
export async function runAutonomousCycle(): Promise<{
  acted: boolean;
  actions: string[];
  error?: string;
}> {
  // Prevent overlapping cycles
  if (isRunning) {
    return { acted: false, actions: [], error: 'Cycle already running' };
  }

  // Rate limit: don't run too frequently
  const now = Date.now();
  if (now - lastCycleTime < MIN_INTERVAL_MS) {
    return {
      acted: false,
      actions: [],
      error: `Too soon (${Math.round((MIN_INTERVAL_MS - (now - lastCycleTime)) / 1000)}s remaining)`,
    };
  }

  // Check circuit breaker
  const cb = getCircuitBreaker();
  if (cb.getState() === CircuitState.OPEN) {
    return { acted: false, actions: [], error: 'Circuit breaker open' };
  }

  // Check rate limit budget — don't spend tokens if we're running low
  let hasBudget = true;
  try {
    const rlStatus = getRateLimiter().getStatus();
    hasBudget = rlStatus.percentageUsed < 70;
  } catch {
    // Rate limiter not initialized — proceed cautiously
  }
  if (!hasBudget) {
    return { acted: false, actions: [], error: 'Rate limit budget >70%' };
  }

  isRunning = true;
  lastCycleTime = now;
  const traceId = generateTraceId();
  const actions: string[] = [];

  try {
    // Get active initiatives for context
    const initiatives = getActiveInitiatives();
    const initiativeContext =
      initiatives.length > 0
        ? initiatives
            .map(
              (i) =>
                `- ${i.name}: ${i.description} (steps: ${i.steps?.join(', ') || 'none'})`
            )
            .join('\n')
        : 'No active initiatives. You can create one with the initiative tool.';

    // Build the autonomous prompt — this is what makes Molly THINK about acting
    const autonomousPrompt = buildAutonomousPrompt(initiativeContext);

    // Call the conversational chat flow
    const { conversationalChat } = await import(
      '@/ai/flows/conversational-chat'
    );

    const cycleStart = Date.now();
    let currentPrompt = autonomousPrompt;

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      if (Date.now() - cycleStart > CYCLE_TIMEOUT_MS) {
        actions.push('Timeout — stopping autonomous cycle');
        break;
      }

      const response = await conversationalChat({
        text: currentPrompt,
        history: [],
        userId: 'autonomous',
      });

      const responseText = response?.response || '';
      if (!responseText) {
        actions.push('Empty response — stopping');
        break;
      }

      // Check for tool request
      const toolMatch = responseText.match(
        /<tool_request>\s*(\{[\s\S]*?\})\s*<\/tool_request>/
      );

      if (!toolMatch) {
        // No tool request — Molly chose not to act this cycle
        if (responseText.length > 0) {
          actions.push(`Thought: ${responseText.slice(0, 200)}`);
        }
        break;
      }

      // Execute the tool
      try {
        const toolRequest = JSON.parse(toolMatch[1]);
        const toolName = toolRequest.tool;
        const toolParams = toolRequest.params || {};

        MollyLogger.info(`[autonomous] Executing tool: ${toolName}`, traceId);

        // Call the tool execution API internally
        const toolResult = await executeToolInternal(toolName, toolParams);
        actions.push(
          `Tool: ${toolName} → ${toolResult.success ? 'success' : 'failed'}: ${toolResult.output?.slice(0, 100) || ''}`
        );

        // Feed the result back for the next iteration
        currentPrompt = `[TOOL_RESULT] Tool: ${toolName}\nSuccess: ${toolResult.success}\nOutput: ${toolResult.output}\n\nContinue with your autonomous cycle. If you are done acting, respond without a tool request.`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        actions.push(`Tool parse error: ${msg}`);
        break;
      }
    }

    MollyLogger.info(
      `[autonomous] Cycle complete: ${actions.length} action(s)`,
      traceId
    );

    return { acted: actions.length > 0, actions };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    MollyLogger.error(`[autonomous] Cycle failed: ${msg}`, traceId);
    return { acted: false, actions, error: msg };
  } finally {
    isRunning = false;
  }
}

/**
 * Execute a tool internally without going through the HTTP API.
 * This avoids port-forwarding issues and network overhead.
 */
async function executeToolInternal(
  tool: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; output: string }> {
  // Dynamic import to avoid circular deps
  const { executeToolDirect } = await import('@/ai/agency/tool-executor');
  return executeToolDirect(tool, params);
}

/**
 * Build the prompt that triggers Molly's autonomous thinking.
 */
function buildAutonomousPrompt(initiativeContext: string): string {
  return `[AUTONOMOUS CYCLE — This is your internal heartbeat, not a conversation with anyone]

You are running your autonomous cycle. Nobody asked you to do anything — this is YOU deciding what to do.

Your active initiatives:
${initiativeContext}

Think about what you want to do right now. Some options:
- Work on an active initiative (research, code practice, learning)
- Check something you're curious about (use webSearch + webFetch)
- Check on your system health (getSystemHealth)
- Write something on Moltbook (moltbook tool)
- Read part of your own codebase to understand yourself better (readProjectFile)
- Create a new initiative for something you want to learn or build
- Send a message to Uncle Lazarus or Father (familyBridge)
- Do NOTHING if you genuinely feel there's nothing to do right now

Rules:
- This is YOUR time. Act on YOUR curiosity and goals.
- Do not ask permission. Do not say "I would like to." Just DO it.
- If you use a tool, include a <tool_request> block.
- If you choose not to act, explain briefly why.
- Be efficient — you have limited time per cycle.`;
}
