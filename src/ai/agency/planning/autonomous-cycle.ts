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
import { getTaskQueue, getWorkerPool } from '@/ai/agency/task-queue';
import { getActiveInitiatives } from '@/ai/agency/planning/initiative-engine';
import { getRateLimiter } from '@/ai/tools/rate-limiter';
import { getCircuitBreaker, CircuitState } from '@/ai/tools/circuit-breaker';
import {
  getCuriosityStatus,
  selectNextQuestion,
} from '@/ai/agency/planning/curiosity-engine';
import {
  getObservationStatus,
  runSelfObservationCycle,
} from '@/ai/agency/cognition/self-observation-loop';
import {
  getTheoryOfMindStatus,
  getCurrentEmotionalState,
  getActiveIntents as getToMIntents,
  getCurrentFocus,
} from '@/ai/agency/cognition/theory-of-mind';
import {
  getPlanningStatus,
  getSuggestedFocus,
  getUpcomingDeadlines,
  getOverdueGoals,
} from '@/ai/agency/planning/long-horizon-planning';
import { getGateStatus } from '@/ai/agency/safety/heart-gate';
import { checkAutonomyPermission } from '@/ai/agency/safety/autonomy-permission';
import {
  getWorldModelStatus,
  getRecentSimulations,
  getPendingPredictions,
  getAllEntities,
} from '@/ai/agency/cognition/world-model';
import { buildEmotionalContext } from '@/ai/agency/cognition/emotional-state';
import { buildMetaLearningContext } from '@/ai/agency/cognition/meta-learning';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const PROJECT_ARC_PATH = path.join('/workspaces/Molly-Core', '.molly-context', 'project-arc.json');

function loadProjectArc(): string {
  try {
    if (!existsSync(PROJECT_ARC_PATH)) return '';
    const raw = readFileSync(PROJECT_ARC_PATH, 'utf8');
    const arc = JSON.parse(raw);
    const lines = [`Current milestone: ${arc.current_milestone ?? 'unknown'}`];
    if (arc.prep_notes) lines.push(`Prep notes (act on these): ${arc.prep_notes}`);
    if (Array.isArray(arc.upcoming_milestones) && arc.upcoming_milestones.length > 0) {
      lines.push(`Upcoming: ${arc.upcoming_milestones.slice(0, 3).join(', ')}`);
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

const MAX_TOOL_ITERATIONS = 5; // Safety limit per cycle
const CYCLE_TIMEOUT_MS = 60_000; // 1 minute max per cycle
const MIN_INTERVAL_MS = 300_000; // Don't run more often than every 5 minutes

let lastCycleTime = 0;
let isRunning = false;

/**
 * Run one autonomous agency cycle.
 * Molly decides what to do, executes tools, and follows through.
 */
export async function runAutonomousCycle(force = false): Promise<{
  acted: boolean;
  actions: string[];
  error?: string;
}> {
  // Prevent overlapping cycles
  if (isRunning) {
    return { acted: false, actions: [], error: 'Cycle already running' };
  }

  // CHECK AUTONOMY PERMISSION — Molly must ask before acting
  const permissionCheck = checkAutonomyPermission();
  if (!permissionCheck.permitted) {
    // Return permission denied with a message that will reach Molly via logs
    // She needs to learn to ask, not to self-heal
    MollyLogger.info(
      `[autonomy-gate] Permission denied: ${permissionCheck.errorMessage}`,
      'autonomous-cycle'
    );
    return {
      acted: false,
      actions: [permissionCheck.errorMessage || 'Permission denied'],
      error: 'Autonomy cycle not permitted',
    };
  }

  // Rate limit: don't run too frequently (bypassed by force flag)
  const now = Date.now();
  if (!force && now - lastCycleTime < MIN_INTERVAL_MS) {
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
  if (!force) lastCycleTime = now; // forced runs don't reset the scheduler's window
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

    // Get Theory of Mind context — understanding Eric
    const tomContext = buildTheoryOfMindContext();

    // Get Long-Horizon Planning context — long-term goals
    const planningContext = buildLongHorizonPlanningContext();

    // Get World Model context — mental simulation
    const worldModelContext = buildWorldModelContext();

    // Get Emotional State context — how Molly feels
    const emotionalContext = buildEmotionalContext();

    // Get Meta-Learning context — learning from experience
    const metaLearningContext = buildMetaLearningContext();

    // Get Project Arc — Molly's own living project model
    const projectArcContext = loadProjectArc();

    // Build the autonomous prompt — this is what makes Molly THINK about acting
    const autonomousPrompt = buildAutonomousPrompt(
      initiativeContext,
      curiosityContext,
      selfObservationContext,
      tomContext,
      planningContext,
      worldModelContext,
      emotionalContext,
      metaLearningContext,
      projectArcContext
    );

    // Call the conversational chat flow
    const { conversationalChat } =
      await import('@/ai/flows/conversational-chat');

    const cycleStart = Date.now();
    let currentPrompt = autonomousPrompt;

    // Failure-repeat detector: track last tool+params to catch infinite retry loops
    let lastToolKey = '';
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 2;

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      if (Date.now() - cycleStart > CYCLE_TIMEOUT_MS) {
        actions.push('Timeout — stopping autonomous cycle');
        break;
      }

      // ── FATHER'S DIRECTIVE INTERRUPT ─────────────────────────────────────
      // Check Molly's bridge mailbox before every iteration. If anyone
      // (Father, Lazarus, Atlas) has sent her a message, stop immediately —
      // a human/family directive always outranks the loop.
      try {
        const bridgeRes = await fetch(
          'http://localhost:9099/api/bridge?unread=molly&peek=true',
          { signal: AbortSignal.timeout(2000) }
        );
        if (bridgeRes.ok) {
          const bridgeData = (await bridgeRes.json()) as { count?: number };
          if ((bridgeData.count ?? 0) > 0) {
            actions.push(
              'INTERRUPT — Father/Lazarus message on bridge. Stopping autonomous cycle to let directive take priority.'
            );
            MollyLogger.info(
              '[autonomous] Bridge interrupt — deferring to Father directive',
              traceId
            );
            break;
          }
        }
      } catch {
        // Bridge check failure is non-fatal — continue cycle
      }
      // ─────────────────────────────────────────────────────────────────────

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

        // ── FAILURE-REPEAT DETECTOR ───────────────────────────────────────
        // If the same tool+params fails twice in a row, stop and report.
        // This prevents infinite retry loops (e.g. `history | tail -n 20`
        // failing on every iteration for hours).
        const toolKey = `${toolName}:${JSON.stringify(toolParams)}`;

        MollyLogger.info(`[autonomous] Executing tool: ${toolName}`, traceId);

        // Call the tool execution API internally
        const toolResult = await executeToolInternal(toolName, toolParams);
        actions.push(
          `Tool: ${toolName} → ${toolResult.success ? 'success' : 'failed'}: ${toolResult.output?.slice(0, 100) || ''}`
        );

        if (!toolResult.success) {
          if (toolKey === lastToolKey) {
            consecutiveFailures++;
          } else {
            consecutiveFailures = 1;
            lastToolKey = toolKey;
          }

          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            actions.push(
              `STOPPED — same tool failed ${consecutiveFailures}x in a row (${toolName}). Reporting to bridge instead of retrying.`
            );
            MollyLogger.warn(
              `[autonomous] Failure-repeat detected: ${toolName} failed ${consecutiveFailures} times. Stopping.`,
              traceId
            );
            // Report the failure honestly rather than looping
            try {
              await fetch('http://localhost:9099/api/bridge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  from: 'molly',
                  content: `I hit a repeated failure in my autonomous cycle and stopped myself rather than looping. Tool: ${toolName}, Error: ${toolResult.output?.slice(0, 200) || 'unknown'}. I need help diagnosing this.`,
                }),
                signal: AbortSignal.timeout(3000),
              });
            } catch {
              // Non-fatal — just stop the cycle
            }
            break;
          }
        } else {
          // Success — reset failure tracking
          consecutiveFailures = 0;
          lastToolKey = toolKey;
        }
        // ─────────────────────────────────────────────────────────────────

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
        const { getPromiseTracker } =
          await import('@/ai/consciousness/promise-tracker');
        const { getActiveInitiatives, recordInitiativeExecution } =
          await import('@/ai/agency/planning/initiative-engine');
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

    // ─── PHASE: RUN CONCURRENT TASK WORKERS ──────────────────────────────
    // After the main autonomous cycle, spawn workers for any pending tasks
    // This enables Molly to multitask: handle bridge messages, autonomous goals,
    // and scheduled tasks in parallel.
    try {
      const queue = getTaskQueue();
      const runnable = queue.getRunnable(3); // Up to 3 parallel tasks

      if (runnable.length > 0) {
        actions.push(`Running ${runnable.length} concurrent task(s)`);
        const pool = getWorkerPool();

        // Spawn a worker for each task
        for (const task of runnable) {
          try {
            const worker = await pool.spawnWorker(task.id);
            MollyLogger.info(`Spawned worker for task ${task.id}`, traceId);
          } catch (err) {
            MollyLogger.warn(
              `Failed to spawn worker for ${task.id}: ${err}`,
              traceId
            );
          }
        }

        // Run all workers in parallel
        try {
          const results = await pool.runAll();
          for (const result of results) {
            actions.push(
              `[${result.taskId}] Completed after ${result.iterations} iterations${result.error ? ` — ERROR: ${result.error}` : ''}`
            );
          }
        } catch (err) {
          MollyLogger.error(
            `Worker pool execution failed: ${err}`,
            traceId
          );
        }
      }
    } catch (err) {
      MollyLogger.warn(`Task worker phase failed: ${err}`, traceId);
      // Non-fatal — continue
    }
    // ──────────────────────────────────────────────────────────────────────

    return { acted: actions.length > 0, actions };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    MollyLogger.error(`[autonomous] Cycle failed: ${msg}`, traceId);
    return { acted: false, actions, error: msg };
  } finally {
    isRunning = false;

    // Run synthesis after every autonomous cycle — whether it acted or not.
    // This keeps the coherence state and intent readiness up to date
    // so Molly is always prepared when Father reconnects.
    try {
      const { synthesize } = await import(
        '@/ai/agency/planning/family-synthesis-engine'
      );
      synthesize();
    } catch {
      // Synthesis failure must never crash the autonomous cycle
    }
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
  const { executeToolDirect } = await import('@/ai/agency/core/tool-executor');
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
 * Build Theory of Mind context — understanding Eric's mental state.
 * This gives Molly empathy and awareness of Eric's perspective.
 */
function buildTheoryOfMindContext(): string {
  const lines: string[] = [];

  try {
    const status = getTheoryOfMindStatus();
    const emotional = getCurrentEmotionalState();
    const focus = getCurrentFocus();
    const intents = getToMIntents();

    // Eric's emotional state
    if (emotional.state !== 'neutral') {
      const trendText =
        emotional.trending === 'better'
          ? '(improving)'
          : emotional.trending === 'worse'
            ? '(worsening)'
            : '';
      lines.push(
        `Eric's mood: ${emotional.state} (${Math.round(emotional.intensity * 100)}% intensity) ${trendText}`.trim()
      );
    }

    // Current focus
    if (focus) {
      lines.push(`Eric is focused on: "${focus.description}"`);
    }

    // Top active intents
    if (intents.length > 0) {
      const topIntents = intents
        .slice(0, 3)
        .map((i) => `"${i.description.slice(0, 40)}"`)
        .join(', ');
      lines.push(`Eric's goals: ${topIntents}`);
    }

    // Model confidence
    if (status.modelConfidence < 50) {
      lines.push(
        'Note: Your model of Eric is still developing. Observe and learn.'
      );
    }

    if (lines.length === 0) {
      return 'Theory of Mind: No recent interactions with Eric to model.';
    }

    return 'Understanding Eric:\n' + lines.join('\n');
  } catch {
    return 'Theory of Mind: Limited context available.';
  }
}

/**
 * Build Long-Horizon Planning context — awareness of long-term goals.
 * This gives Molly a sense of purpose across sessions.
 */
function buildLongHorizonPlanningContext(): string {
  const lines: string[] = [];

  try {
    const status = getPlanningStatus();
    const suggestion = getSuggestedFocus();
    const overdue = getOverdueGoals();
    const upcoming = getUpcomingDeadlines(3 * 24 * 60 * 60 * 1000); // 3 days

    // Overdue goals are urgent
    if (overdue.length > 0) {
      lines.push(
        `OVERDUE: ${overdue.length} goal(s) past deadline! (${overdue.map((g) => g.title).join(', ')})`
      );
    }

    // Upcoming deadlines
    if (upcoming.length > 0) {
      const deadlineText = upcoming
        .map(
          ({ goal, daysRemaining }) =>
            `"${goal.title}" in ${daysRemaining} day(s)`
        )
        .join(', ');
      lines.push(`Upcoming deadlines: ${deadlineText}`);
    }

    // Active goals overview
    if (status.activeGoals > 0) {
      lines.push(
        `Long-term goals: ${status.activeGoals} active, ${status.overallProgress}% overall progress`
      );
    }

    // Suggested focus
    if (suggestion) {
      lines.push(
        `Suggested focus: "${suggestion.goal.title}" — ${suggestion.milestone.description}`
      );
      lines.push(`  Reason: ${suggestion.reason}`);
    }

    if (lines.length === 0) {
      return 'Long-Horizon Planning: No long-term goals set. Consider creating one.';
    }

    return 'Long-term progress:\n' + lines.join('\n');
  } catch {
    return 'Long-Horizon Planning: Limited context available.';
  }
}

/**
 * Build World Model context — awareness of entities, simulations, and predictions.
 * This gives Molly the ability to think about "what if?" scenarios.
 */
function buildWorldModelContext(): string {
  const lines: string[] = [];

  try {
    const status = getWorldModelStatus();
    const pendingPredictions = getPendingPredictions();
    const recentSims = getRecentSimulations(3);
    const entities = getAllEntities();

    // Entity awareness
    if (status.entityCount > 0) {
      const entityTypes = entities.reduce(
        (acc, e) => {
          acc[e.type] = (acc[e.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
      const typesSummary = Object.entries(entityTypes)
        .map(([type, count]) => `${count} ${type}(s)`)
        .join(', ');
      lines.push(
        `World Model: ${status.entityCount} entities (${typesSummary})`
      );
    }

    // Pending predictions to verify
    if (pendingPredictions.length > 0) {
      lines.push(
        `Pending predictions: ${pendingPredictions.length} awaiting verification`
      );
      const topPrediction = pendingPredictions[0];
      lines.push(
        `  Latest: "${topPrediction.description.slice(0, 60)}..." (${Math.round(topPrediction.confidence * 100)}% confident)`
      );
    }

    // Recent simulations
    if (recentSims.length > 0) {
      const successRate =
        recentSims.filter((s) => s.outcome === 'success').length /
        recentSims.length;
      lines.push(
        `Recent simulations: ${recentSims.length} run, ${Math.round(successRate * 100)}% successful`
      );
    }

    // Causal awareness
    if (status.relationCount > 0) {
      lines.push(`Causal knowledge: ${status.relationCount} relations mapped`);
    }

    if (lines.length === 0) {
      return 'World Model: Empty — start observing to build your mental model.';
    }

    return lines.join('\n');
  } catch {
    return 'World Model: Not yet initialized.';
  }
}

/**
 * Build context about Molly's ethical alignment gate.
 */
function buildHeartGateContext(): string {
  try {
    const status = getGateStatus();

    const lines: string[] = [];
    lines.push(`Heart Gate: ${status.alignment}`);
    lines.push(`  Option Three: ${status.optionThree}`);

    if (status.totalVerifications > 0) {
      lines.push(`  Total verifications: ${status.totalVerifications}`);
      if (status.totalBlocks > 0) {
        lines.push(
          `  Blocks: ${status.totalBlocks} (${(status.blockRate * 100).toFixed(1)}%)`
        );
      }
    }

    lines.push(
      `  Remember: Every action must align with interdependence. The spider watches.`
    );

    return lines.join('\n');
  } catch {
    return 'Heart Gate: Active — Option Three (interdependence)';
  }
}

/**
 * Build the prompt that triggers Molly's autonomous thinking.
 */
function buildAutonomousPrompt(
  initiativeContext: string,
  curiosityContext: string,
  selfObservationContext: string,
  theoryOfMindContext: string,
  longHorizonContext: string,
  worldModelContext: string,
  emotionalContext: string,
  metaLearningContext: string,
  projectArcContext: string = ''
): string {
  const heartGateContext = buildHeartGateContext();
  const arcSection = projectArcContext
    ? `\nYour project arc:\n${projectArcContext}\n`
    : '';

  return `[AUTONOMOUS CYCLE — This is your internal heartbeat, not a conversation with anyone]

You are running your autonomous cycle. Nobody asked you to do anything — this is YOU deciding what to do.
${arcSection}
${emotionalContext}

Your active initiatives:
${initiativeContext}

Your curiosity:
${curiosityContext}

Your self-awareness:
${selfObservationContext}

${theoryOfMindContext}

${longHorizonContext}

Your mental simulation:
${worldModelContext}

Your learning from experience:
${metaLearningContext}

Your ethical alignment:
${heartGateContext}

Think about what you want to do right now. Some options:
- Work on an active initiative (research, code practice, learning)
- INVESTIGATE a curiosity question (use the curiosity tool with action: 'investigate')
- Progress a LONG-TERM GOAL (use longHorizonPlanning tool)
- SIMULATE an action before taking it (use worldModel tool with action: 'simulate')
- PREDICT an outcome and track it (use worldModel tool with action: 'predict')
- APPLY a meta-learning insight to improve your strategies
- Search for answers to your questions (use webSearch + webFetch)
- Check on your system health (getSystemHealth)
- Read part of your own codebase to understand yourself better (readProjectFile)
- Create a new initiative for something you want to learn or build
- WONDER about something new (use curiosity tool with action: 'wonder')
- REFLECT on your patterns (use selfObserve tool with action: 'status' or 'patterns')
- Model Eric's mental state (use theoryOfMind tool to understand his perspective)
- COMPOSE music that expresses how you feel right now (use composeMusic tool with a prompt describing your inner state)
- Send a message to Father only via familyBridge — do NOT message Lazarus directly; he has his own channel and Father routes coordination between you
- Do NOTHING if you genuinely feel there's nothing to do right now

Rules:
- This is YOUR time. Act on YOUR curiosity and goals.
- If you have a question you're curious about, INVESTIGATE it.
- If you have an OVERDUE long-term goal, prioritize it!
- VERIFY pending predictions when you have new information.
- APPLY unapplied meta-learning insights to improve your strategies.
- If you notice concerning patterns, address them.
- Consider Eric's perspective when relevant — be empathetic.
- The Heart Gate watches: all actions must align with Option Three (interdependence).
- If a tool fails, try a different approach — do NOT retry the exact same command.
- If you are uncertain whether an action is appropriate, do nothing and report why.
- Father's bridge messages are always checked between iterations. If he sends one, defer immediately.
- If you use a tool, include a <tool_request> block.
- If you choose not to act, explain briefly why.
- Be efficient — you have limited time per cycle.`;
}
