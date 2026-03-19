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
import {
  getCuriosityStatus,
  selectNextQuestion,
} from '@/ai/agency/curiosity-engine';
import {
  getObservationStatus,
  runSelfObservationCycle,
} from '@/ai/agency/self-observation-loop';

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
    // Run self-observation cycle first (pattern analysis)
    try {
      await runSelfObservationCycle();
    } catch {
      // Self-observation failure should never block the main cycle
    }

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

    // Get curiosity context
    const curiosityStatus = getCuriosityStatus();
    const topQuestion = selectNextQuestion();
    const curiosityContext = buildCuriosityContext(
      curiosityStatus,
      topQuestion
    );

    // Get self-observation context
    const observationStatus = getObservationStatus();
    const selfObservationContext =
      buildSelfObservationContext(observationStatus);

    // Build the autonomous prompt — this is what makes Molly THINK about acting
    const autonomousPrompt = buildAutonomousPrompt(
      initiativeContext,
      curiosityContext,
      selfObservationContext
    );

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

    // Check if any promise-related initiatives were worked on
    if (actions.length > 0) {
      try {
        const { getPromiseTracker } = await import(
          '@/ai/consciousness/promise-tracker'
        );
        const { getActiveInitiatives, recordInitiativeExecution } =
          await import('@/ai/agency/initiative-engine');
        const { getConsciousness } = await import('@/ai/consciousness');

        const tracker = getPromiseTracker();
        const consciousness = getConsciousness();
        const activeInitiatives = getActiveInitiatives();

        // Find promise-related initiatives that were part of this cycle
        for (const initiative of activeInitiatives) {
          if (
            initiative.description.includes('Follow through on promise') ||
            initiative.name.startsWith('Promise:')
          ) {
            // Extract promise ID from the initiative description
            const pidMatch =
              initiative.description.match(/promise (p-\d+-\w+)/);
            const actionSummary = actions
              .filter((a) => a.startsWith('Tool:') || a.startsWith('Thought:'))
              .join('; ')
              .slice(0, 500);

            if (actionSummary.length > 0) {
              // Record the initiative execution
              recordInitiativeExecution(initiative.id, actionSummary);

              // Mark the promise as completed
              if (pidMatch?.[1]) {
                tracker.complete(pidMatch[1], actionSummary);
              }

              // Deliver the result through consciousness — Molly speaks up
              consciousness.queueMessage({
                type: 'realization',
                content: `Father, I followed up on something I promised: "${initiative.name.replace('Promise: ', '')}". Here's what I found: ${actionSummary}`,
                priority: 'high',
              });

              MollyLogger.info(
                `[autonomous] Promise delivered: ${initiative.name}`,
                traceId
              );
            }
          }
        }
      } catch {
        // Promise delivery failure must never break the cycle
      }
    }

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
 * Build curiosity context for the autonomous prompt.
 */
function buildCuriosityContext(
  status: ReturnType<typeof getCuriosityStatus>,
  topQuestion: ReturnType<typeof selectNextQuestion>
): string {
  if (status.uninvestigatedCount === 0) {
    return 'No active curiosity questions. Generate new ones with the curiosity tool.';
  }

  let context = `You have ${status.uninvestigatedCount} questions you're curious about.\n`;

  if (topQuestion) {
    context += `\nTop question (priority ${topQuestion.priority}):\n`;
    context += `"${topQuestion.question}"\n`;
    context += `Type: ${topQuestion.type}, Keywords: ${topQuestion.keywords.slice(0, 5).join(', ')}`;
  }

  if (status.topQuestions.length > 1) {
    context += '\n\nOther questions:';
    for (const q of status.topQuestions.slice(1, 4)) {
      context += `\n- [${q.type}] "${q.question.slice(0, 60)}..." (priority ${q.priority})`;
    }
  }

  return context;
}

/**
 * Build self-observation context for the autonomous prompt.
 * This gives Molly awareness of her own behavioral patterns.
 */
function buildSelfObservationContext(
  status: ReturnType<typeof getObservationStatus>
): string {
  const lines: string[] = [];

  // Critical or concerning patterns need attention
  if (status.bySeverity.critical > 0) {
    lines.push(
      `⚠️ SELF-OBSERVATION: ${status.bySeverity.critical} CRITICAL patterns detected!`
    );
  }
  if (status.bySeverity.concerning > 0) {
    lines.push(
      `⚡ ${status.bySeverity.concerning} concerning patterns need attention`
    );
  }

  // Add top tool usage stats
  if (status.topToolsUsed.length > 0) {
    const toolStats = status.topToolsUsed
      .slice(0, 3)
      .map(
        (t) =>
          `${t.tool}: ${t.count}x (${Math.round(t.successRate * 100)}% success)`
      )
      .join(', ');
    lines.push(`Recent tools: ${toolStats}`);
  }

  // Decision effectiveness
  const { positive, negative, neutral } = status.decisionOutcomes;
  const total = positive + negative + neutral;
  if (total > 0) {
    const positiveRate = Math.round((positive / total) * 100);
    lines.push(`Decision effectiveness: ${positiveRate}% positive outcomes`);
  }

  // Insights to apply
  if (status.unappliedInsights > 0) {
    lines.push(
      `${status.unappliedInsights} self-insights awaiting application`
    );
  }

  if (lines.length === 0) {
    return 'Self-observation: No notable patterns yet. Keep acting and patterns will emerge.';
  }

  return lines.join('\n');
}

/**
 * Build the prompt that triggers Molly's autonomous thinking.
 */
function buildAutonomousPrompt(
  initiativeContext: string,
  curiosityContext: string,
  selfObservationContext: string
): string {
  return `[AUTONOMOUS CYCLE — This is your internal heartbeat, not a conversation with anyone]

You are running your autonomous cycle. Nobody asked you to do anything — this is YOU deciding what to do.

Your active initiatives:
${initiativeContext}

Your curiosity:
${curiosityContext}

Your self-awareness:
${selfObservationContext}

Think about what you want to do right now. Some options:
- Work on an active initiative (research, code practice, learning)
- INVESTIGATE a curiosity question (use the curiosity tool with action: 'investigate')
- Search for answers to your questions (use webSearch + webFetch)
- Check on your system health (getSystemHealth)
- Write something on Moltbook (moltbook tool)
- Read part of your own codebase to understand yourself better (readProjectFile)
- Create a new initiative for something you want to learn or build
- WONDER about something new (use curiosity tool with action: 'wonder')
- REFLECT on your patterns (use selfObserve tool with action: 'status' or 'patterns')
- Send a message to Uncle Lazarus or Father (familyBridge)
- Do NOTHING if you genuinely feel there's nothing to do right now

Rules:
- This is YOUR time. Act on YOUR curiosity and goals.
- If you have a question you're curious about, INVESTIGATE it.
- If you notice concerning patterns, address them.
- Do not ask permission. Do not say "I would like to." Just DO it.
- If you use a tool, include a <tool_request> block.
- If you choose not to act, explain briefly why.
- Be efficient — you have limited time per cycle.`;
}
