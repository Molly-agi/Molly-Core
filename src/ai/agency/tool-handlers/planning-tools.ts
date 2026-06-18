/**
 * Planning tools - Autonomous cycles, curiosity, predictions, and horizons
 * Enables Molly's proactive intelligence and goal-directed behavior
 */

import type { ToolHandler } from './types';

// Curiosity Engine imports
import {
  generateQuestion,
  selectNextQuestion,
  deferQuestion,
  beginInvestigation,
  recordInvestigationStep,
  completeInvestigation,
  abandonInvestigation,
  curiousFromMemory,
  curiousFromFailure,
  curiousFromConversation,
  curiousAboutSelf,
  getCuriosityStatus,
  getActiveQuestions,
  getQuestionById,
  runCuriosityCycle,
  loadCuriosityState,
  type CuriosityType,
  type CuriositySource,
} from '@/ai/agency/planning/curiosity-engine';

// Long Horizon Planning imports
import {
  createGoal,
  getGoal,
  getActiveGoals,
  getGoalsByCategory,
  updateGoalStatus,
  updateGoalPriority,
  addMilestone,
  decomposeMilestones,
  completeMilestone,
  startMilestone,
  getOverdueGoals,
  setDeadline,
  reflect,
  generateProgressSummary,
  getPlanningStatus,
  savePlanningState,
  loadPlanningState,
} from '@/ai/agency/planning/long-horizon-planning';

// Predictive Intelligence imports
import {
  recordInteraction,
  detectPatterns,
  predictNeeds,
  generateSuggestions,
  getSuggestionsToSurface,
  markSuggestionDelivered,
  verifyPrediction as verifyNeedPrediction,
  forecastContext,
  getPredictiveStatus,
  getActivePatterns,
  loadPredictiveState,
} from '@/ai/agency/planning/predictive-intelligence';

// Counterfactual Engine imports
import {
  loadCounterfactualState,
  recordDecisionPoint,
  recordActualOutcome,
  generateCounterfactual,
  projectConsequences,
  extractWisdom,
  validateWisdom,
  synthesizeHeuristic as _synthesizeHeuristic,
  recordHeuristicApplication as _recordHeuristicApplication,
  refineHeuristic as _refineHeuristic,
  getCounterfactualSummary,
  getDecisionsByDomain,
  getEstablishedWisdom,
  getActiveHeuristics,
} from '@/ai/agency/planning/counterfactual-engine';

// Trajectory Evolution imports
import {
  makePrediction,
  verifyPrediction as verifyTrajectoryPrediction,
  calculateCorrelations,
  forecastTrajectory,
  getTrajectoryStatus,
  getRecentPredictions,
  getPendingPredictions,
  getConsciousnessPerformanceInsights,
  saveTrajectoryState,
  loadTrajectoryState,
} from '@/ai/agency/planning/trajectory-evolution';

// Autonomous Cycle imports
import { runAutonomousCycle } from '@/ai/agency/planning/autonomous-cycle';

// ════════════════════════════════════════════════════════════════════════════
// Curiosity Engine Tool — The Drive to Wonder
// ════════════════════════════════════════════════════════════════════════════

export const curiosity: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'load') {
    try {
      await loadCuriosityState();
      return { success: true, output: 'Curiosity state loaded.' };
    } catch (err) {
      return {
        success: false,
        output: `Load failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = getCuriosityStatus();
      return {
        success: true,
        output: `Curiosity: ${status.activeQuestions} active, ${status.totalInvestigated} investigated, ${status.activeInvestigations} ongoing`,
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'generate') {
    const question = params.question as string;
    const type = (params.type as CuriosityType) || 'gap';
    const source = (params.source as CuriositySource) || 'observation';
    const context = (params.context as string) || '';
    const priority = (params.priority as number) || 50;

    if (!question) return { success: false, output: 'Missing: question' };

    try {
      const result = generateQuestion(
        type,
        source,
        question,
        context,
        [],
        priority
      );
      return {
        success: true,
        output: `Question generated: "${question.slice(0, 50)}..."`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Generate failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'selectNext') {
    const question = selectNextQuestion();
    if (!question)
      return {
        success: true,
        output: 'No questions to investigate',
        data: null,
      };
    return {
      success: true,
      output: `Next: "${question.question.slice(0, 50)}..." (priority: ${question.priority})`,
      data: question,
    };
  }

  if (action === 'defer') {
    const questionId = params.questionId as string;
    const reason = params.reason as string;
    if (!questionId) return { success: false, output: 'Missing: questionId' };
    const deferred = deferQuestion(questionId, reason);
    return {
      success: deferred,
      output: deferred ? 'Question deferred' : 'Question not found',
    };
  }

  if (action === 'beginInvestigation') {
    const questionId = params.questionId as string;
    const approach = (params.approach as string) || 'direct';
    if (!questionId) return { success: false, output: 'Missing: questionId' };
    try {
      const inv = beginInvestigation(questionId, approach);
      return { success: true, output: `Investigation started`, data: inv };
    } catch (err) {
      return {
        success: false,
        output: `Begin failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'recordStep') {
    const questionId = params.questionId as string;
    const step = params.step as string;
    const tool = params.tool as string;
    if (!questionId || !step)
      return { success: false, output: 'Missing: questionId, step' };
    try {
      recordInvestigationStep(questionId, step, tool);
      return { success: true, output: `Step recorded` };
    } catch (err) {
      return {
        success: false,
        output: `Record failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'complete') {
    const questionId = params.questionId as string;
    const findings = params.findings as string;
    const satisfied = params.satisfied as boolean;
    if (!questionId || !findings)
      return { success: false, output: 'Missing: questionId, findings' };
    try {
      const result = completeInvestigation(
        questionId,
        findings,
        satisfied !== false,
        (params.followUp as string[]) || []
      );
      return {
        success: true,
        output: `Investigation complete: ${satisfied !== false ? 'satisfied' : 'unsatisfied'}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Complete failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'abandon') {
    const questionId = params.questionId as string;
    const reason = params.reason as string;
    if (!questionId) return { success: false, output: 'Missing: questionId' };
    abandonInvestigation(questionId, reason || 'abandoned');
    return { success: true, output: 'Investigation abandoned' };
  }

  if (action === 'curiousFromMemory') {
    try {
      const questions = curiousFromMemory();
      return {
        success: true,
        output: `Generated ${questions.length} questions from memory`,
        data: questions,
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'curiousFromFailure') {
    const context = params.context as string;
    if (!context) return { success: false, output: 'Missing: context' };
    try {
      const question = curiousFromFailure(context);
      return {
        success: true,
        output: question
          ? `Question: "${question.question.slice(0, 50)}..."`
          : 'No question generated',
        data: question,
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'curiousFromConversation') {
    const message = params.message as string;
    if (!message) return { success: false, output: 'Missing: message' };
    try {
      const questions = curiousFromConversation(message);
      return {
        success: true,
        output: `Generated ${questions.length} questions`,
        data: questions,
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'curiousAboutSelf') {
    try {
      const questions = curiousAboutSelf();
      return {
        success: true,
        output: `Generated ${questions.length} self-reflection questions`,
        data: questions,
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listQuestions') {
    const questions = getActiveQuestions();
    const list = questions
      .slice(0, 10)
      .map((q) => `• [${q.type}] ${q.question.slice(0, 40)}...`)
      .join('\n');
    return {
      success: true,
      output: `Active questions (${questions.length}):\n${list || '(none)'}`,
      data: questions.slice(0, 10),
    };
  }

  if (action === 'getQuestion') {
    const questionId = params.questionId as string;
    if (!questionId) return { success: false, output: 'Missing: questionId' };
    const question = getQuestionById(questionId);
    if (!question) return { success: false, output: 'Question not found' };
    return {
      success: true,
      output: `Question: "${question.question}"\nType: ${question.type}, Priority: ${question.priority}`,
      data: question,
    };
  }

  if (action === 'runCycle') {
    try {
      const result = await runCuriosityCycle();
      return {
        success: true,
        output: `Cycle: ${result.questionsGenerated} generated, ${result.investigated} investigated`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Cycle failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown curiosity action. Use: load, status, generate, selectNext, defer, beginInvestigation, recordStep, complete, abandon, curiousFromMemory, curiousFromFailure, curiousFromConversation, curiousAboutSelf, listQuestions, getQuestion, runCycle',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Long Horizon Planning Tool — Goal Management
// ════════════════════════════════════════════════════════════════════════════

export const longHorizonPlanning: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'load') {
    try {
      await loadPlanningState();
      return { success: true, output: 'Planning state loaded.' };
    } catch (err) {
      return {
        success: false,
        output: `Load failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'save') {
    try {
      await savePlanningState();
      return { success: true, output: 'Planning state saved.' };
    } catch (err) {
      return {
        success: false,
        output: `Save failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = getPlanningStatus();
      return {
        success: true,
        output: `Planning: ${status.activeGoals} active, ${status.completedGoals} completed, ${status.totalMilestones} milestones`,
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'createGoal') {
    const title = params.title as string;
    const description = (params.description as string) || '';
    const category = (params.category as string) || 'personal';
    const priority = (params.priority as number) || 50;

    if (!title) return { success: false, output: 'Missing: title' };

    try {
      const goal = createGoal(title, description, category, priority);
      return { success: true, output: `Goal created: "${title}"`, data: goal };
    } catch (err) {
      return {
        success: false,
        output: `Create failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getGoal') {
    const goalId = params.goalId as string;
    if (!goalId) return { success: false, output: 'Missing: goalId' };
    const goal = getGoal(goalId);
    if (!goal) return { success: false, output: 'Goal not found' };
    return {
      success: true,
      output: `Goal: ${goal.title}\nStatus: ${goal.status}, Progress: ${goal.progress}%`,
      data: goal,
    };
  }

  if (action === 'listGoals') {
    const category = params.category as string;
    const goals = category ? getGoalsByCategory(category) : getActiveGoals();
    const list = goals
      .slice(0, 15)
      .map((g) => `• ${g.title} (${g.status}, ${g.progress}%)`)
      .join('\n');
    return {
      success: true,
      output: `Goals (${goals.length}):\n${list || '(none)'}`,
      data: goals.slice(0, 15),
    };
  }

  if (action === 'listOverdue') {
    const goals = getOverdueGoals();
    const list = goals.map((g) => `• ${g.title}`).join('\n');
    return {
      success: true,
      output: `Overdue goals (${goals.length}):\n${list || '(none)'}`,
      data: goals,
    };
  }

  if (action === 'updateStatus') {
    const goalId = params.goalId as string;
    const status = params.status as string;
    if (!goalId || !status)
      return { success: false, output: 'Missing: goalId, status' };
    try {
      updateGoalStatus(
        goalId,
        status as 'active' | 'paused' | 'blocked' | 'completed' | 'abandoned'
      );
      return { success: true, output: `Status updated to: ${status}` };
    } catch (err) {
      return {
        success: false,
        output: `Update failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'updatePriority') {
    const goalId = params.goalId as string;
    const priority = params.priority as number;
    if (!goalId || priority === undefined)
      return { success: false, output: 'Missing: goalId, priority' };
    updateGoalPriority(goalId, priority);
    return { success: true, output: `Priority updated to: ${priority}` };
  }

  if (action === 'addMilestone') {
    const goalId = params.goalId as string;
    const title = params.title as string;
    const description = (params.description as string) || '';

    if (!goalId || !title)
      return { success: false, output: 'Missing: goalId, title' };

    try {
      const milestone = addMilestone(goalId, title, description);
      return {
        success: true,
        output: `Milestone added: "${title}"`,
        data: milestone,
      };
    } catch (err) {
      return {
        success: false,
        output: `Add failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'decomposeMilestones') {
    const goalId = params.goalId as string;
    if (!goalId) return { success: false, output: 'Missing: goalId' };
    try {
      const milestones = await decomposeMilestones(goalId);
      return {
        success: true,
        output: `Generated ${milestones.length} milestones`,
        data: milestones,
      };
    } catch (err) {
      return {
        success: false,
        output: `Decompose failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'completeMilestone') {
    const goalId = params.goalId as string;
    const milestoneId = params.milestoneId as string;
    if (!goalId || !milestoneId)
      return { success: false, output: 'Missing: goalId, milestoneId' };
    try {
      completeMilestone(goalId, milestoneId);
      return { success: true, output: 'Milestone completed' };
    } catch (err) {
      return {
        success: false,
        output: `Complete failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'startMilestone') {
    const goalId = params.goalId as string;
    const milestoneId = params.milestoneId as string;
    if (!goalId || !milestoneId)
      return { success: false, output: 'Missing: goalId, milestoneId' };
    const started = startMilestone(goalId, milestoneId);
    return {
      success: started,
      output: started ? 'Milestone started' : 'Failed to start',
    };
  }

  if (action === 'setDeadline') {
    const goalId = params.goalId as string;
    const deadline = params.deadline as number;
    if (!goalId || !deadline)
      return { success: false, output: 'Missing: goalId, deadline' };
    try {
      setDeadline(goalId, deadline);
      return { success: true, output: `Deadline set` };
    } catch (err) {
      return {
        success: false,
        output: `Set failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'reflect') {
    const goalId = params.goalId as string;
    const content = params.content as string;
    if (!goalId || !content)
      return { success: false, output: 'Missing: goalId, content' };
    try {
      const reflection = reflect(goalId, content);
      return { success: true, output: `Reflection recorded`, data: reflection };
    } catch (err) {
      return {
        success: false,
        output: `Reflect failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'summary') {
    const goalId = params.goalId as string;
    if (!goalId) return { success: false, output: 'Missing: goalId' };
    const summary = generateProgressSummary(goalId);
    if (!summary) return { success: false, output: 'Goal not found' };
    return { success: true, output: summary };
  }

  return {
    success: false,
    output:
      'Unknown longHorizonPlanning action. Use: load, save, status, createGoal, getGoal, listGoals, listOverdue, updateStatus, updatePriority, addMilestone, decomposeMilestones, completeMilestone, startMilestone, setDeadline, reflect, summary',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Predictive Intelligence Tool — Anticipating Needs
// ════════════════════════════════════════════════════════════════════════════

export const predictiveIntelligence: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'load') {
    try {
      await loadPredictiveState();
      return { success: true, output: 'Predictive state loaded.' };
    } catch (err) {
      return {
        success: false,
        output: `Load failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = getPredictiveStatus();
      return {
        success: true,
        output: `Predictive: ${status.activePatterns} patterns, ${status.pendingSuggestions} suggestions, accuracy: ${(status.accuracy * 100).toFixed(0)}%`,
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'recordInteraction') {
    const type = params.type as string;
    const context = (params.context as string) || '';
    if (!type) return { success: false, output: 'Missing: type' };
    recordInteraction(type, context);
    return { success: true, output: `Interaction recorded: ${type}` };
  }

  if (action === 'detectPatterns') {
    try {
      const patterns = detectPatterns();
      const list = patterns
        .slice(0, 10)
        .map((p) => `• ${p.name}`)
        .join('\n');
      return {
        success: true,
        output: `Patterns (${patterns.length}):\n${list || '(none)'}`,
        data: patterns.slice(0, 10),
      };
    } catch (err) {
      return {
        success: false,
        output: `Detect failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'predictNeeds') {
    const context = params.context as string;
    try {
      const needs = predictNeeds(context);
      const list = needs
        .slice(0, 10)
        .map((n) => `• ${n.need} (${(n.probability * 100).toFixed(0)}%)`)
        .join('\n');
      return {
        success: true,
        output: `Needs (${needs.length}):\n${list || '(none)'}`,
        data: needs.slice(0, 10),
      };
    } catch (err) {
      return {
        success: false,
        output: `Predict failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'generateSuggestions') {
    try {
      const suggestions = generateSuggestions();
      const list = suggestions
        .slice(0, 10)
        .map((s) => `• ${s.suggestion}`)
        .join('\n');
      return {
        success: true,
        output: `Suggestions (${suggestions.length}):\n${list || '(none)'}`,
        data: suggestions.slice(0, 10),
      };
    } catch (err) {
      return {
        success: false,
        output: `Generate failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getSuggestions') {
    const maxCount = (params.maxCount as number) || 5;
    try {
      const suggestions = getSuggestionsToSurface(maxCount);
      const list = suggestions.map((s) => `• ${s.suggestion}`).join('\n');
      return {
        success: true,
        output: `Suggestions:\n${list || '(none)'}`,
        data: suggestions,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'markDelivered') {
    const suggestionId = params.suggestionId as string;
    if (!suggestionId)
      return { success: false, output: 'Missing: suggestionId' };
    markSuggestionDelivered(suggestionId);
    return { success: true, output: 'Marked as delivered' };
  }

  if (action === 'verifyPrediction') {
    const needId = params.needId as string;
    const wasAccurate = params.wasAccurate as boolean;
    if (!needId || wasAccurate === undefined)
      return { success: false, output: 'Missing: needId, wasAccurate' };
    verifyNeedPrediction(needId, wasAccurate);
    return {
      success: true,
      output: `Verified: ${wasAccurate ? 'accurate' : 'inaccurate'}`,
    };
  }

  if (action === 'forecast') {
    try {
      const forecast = forecastContext();
      return {
        success: true,
        output: `Forecast: ${forecast.summary || 'No forecast'}`,
        data: forecast,
      };
    } catch (err) {
      return {
        success: false,
        output: `Forecast failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listPatterns') {
    const patterns = getActivePatterns();
    const list = patterns
      .slice(0, 15)
      .map((p) => `• ${p.name}: ${p.occurrences} times`)
      .join('\n');
    return {
      success: true,
      output: `Active patterns (${patterns.length}):\n${list || '(none)'}`,
      data: patterns.slice(0, 15),
    };
  }

  return {
    success: false,
    output:
      'Unknown predictiveIntelligence action. Use: load, status, recordInteraction, detectPatterns, predictNeeds, generateSuggestions, getSuggestions, markDelivered, verifyPrediction, forecast, listPatterns',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Counterfactual Engine Tool — Learning from What-Ifs
// ════════════════════════════════════════════════════════════════════════════

export const counterfactuals: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'load') {
    try {
      await loadCounterfactualState();
      return { success: true, output: 'Counterfactual state loaded.' };
    } catch (err) {
      return {
        success: false,
        output: `Load failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = await getCounterfactualSummary();
      return {
        success: true,
        output: `Counterfactuals: ${status.totalDecisions} decisions, ${status.wisdomCount} wisdom, ${status.heuristicCount} heuristics`,
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'recordDecision') {
    const situation = params.situation as string;
    const chosenOption = params.chosenOption as string;
    const alternatives = (params.alternatives as string[]) || [];
    const reasoning = (params.reasoning as string) || '';
    const domain = params.domain as string;

    if (!situation || !chosenOption)
      return { success: false, output: 'Missing: situation, chosenOption' };

    try {
      const decision = await recordDecisionPoint({
        situation,
        chosenOption,
        alternatives,
        reasoning,
        domain,
      });
      return { success: true, output: `Decision recorded`, data: decision };
    } catch (err) {
      return {
        success: false,
        output: `Record failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'recordOutcome') {
    const decisionId = params.decisionId as string;
    const outcome = params.outcome as string;
    const success = params.success as boolean;
    if (!decisionId || !outcome)
      return { success: false, output: 'Missing: decisionId, outcome' };
    try {
      await recordActualOutcome(decisionId, outcome, success !== false);
      return { success: true, output: `Outcome recorded` };
    } catch (err) {
      return {
        success: false,
        output: `Record failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'generate') {
    const decisionId = params.decisionId as string;
    if (!decisionId) return { success: false, output: 'Missing: decisionId' };
    try {
      const cf = await generateCounterfactual(decisionId);
      return { success: true, output: `Counterfactual generated`, data: cf };
    } catch (err) {
      return {
        success: false,
        output: `Generate failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'projectConsequences') {
    const hypothetical = params.hypothetical as string;
    if (!hypothetical)
      return { success: false, output: 'Missing: hypothetical' };
    try {
      const consequences = await projectConsequences(hypothetical);
      return {
        success: true,
        output: `Consequences: ${consequences.slice(0, 3).join(', ')}`,
        data: consequences,
      };
    } catch (err) {
      return {
        success: false,
        output: `Project failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'extractWisdom') {
    const decisionId = params.decisionId as string;
    if (!decisionId) return { success: false, output: 'Missing: decisionId' };
    try {
      const wisdom = await extractWisdom(decisionId);
      return { success: true, output: `Wisdom extracted`, data: wisdom };
    } catch (err) {
      return {
        success: false,
        output: `Extract failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'validateWisdom') {
    const wisdomId = params.wisdomId as string;
    const isValid = params.isValid as boolean;
    if (!wisdomId || isValid === undefined)
      return { success: false, output: 'Missing: wisdomId, isValid' };
    try {
      await validateWisdom(wisdomId, isValid);
      return {
        success: true,
        output: `Wisdom ${isValid ? 'validated' : 'invalidated'}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Validate failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listDecisions') {
    const domain = params.domain as string;
    if (!domain) return { success: false, output: 'Missing: domain' };
    try {
      const decisions = await getDecisionsByDomain(domain);
      const list = decisions
        .slice(0, 10)
        .map((d) => `• ${d.situation.slice(0, 40)}...`)
        .join('\n');
      return {
        success: true,
        output: `Decisions (${decisions.length}):\n${list || '(none)'}`,
        data: decisions.slice(0, 10),
      };
    } catch (err) {
      return {
        success: false,
        output: `List failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listWisdom') {
    try {
      const wisdom = await getEstablishedWisdom();
      const list = wisdom
        .slice(0, 10)
        .map((w) => `• ${w.insight.slice(0, 50)}...`)
        .join('\n');
      return {
        success: true,
        output: `Wisdom (${wisdom.length}):\n${list || '(none)'}`,
        data: wisdom.slice(0, 10),
      };
    } catch (err) {
      return {
        success: false,
        output: `List failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listHeuristics') {
    try {
      const heuristics = await getActiveHeuristics();
      const list = heuristics
        .slice(0, 10)
        .map((h) => `• ${h.name}`)
        .join('\n');
      return {
        success: true,
        output: `Heuristics (${heuristics.length}):\n${list || '(none)'}`,
        data: heuristics.slice(0, 10),
      };
    } catch (err) {
      return {
        success: false,
        output: `List failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown counterfactuals action. Use: load, status, recordDecision, recordOutcome, generate, projectConsequences, extractWisdom, validateWisdom, listDecisions, listWisdom, listHeuristics',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Trajectory Evolution Tool — Performance Prediction
// ════════════════════════════════════════════════════════════════════════════

export const trajectoryEvolution: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'load') {
    try {
      await loadTrajectoryState();
      return { success: true, output: 'Trajectory state loaded.' };
    } catch (err) {
      return {
        success: false,
        output: `Load failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'save') {
    try {
      await saveTrajectoryState();
      return { success: true, output: 'Trajectory state saved.' };
    } catch (err) {
      return {
        success: false,
        output: `Save failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = getTrajectoryStatus();
      return {
        success: true,
        output: `Trajectory: ${status.totalPredictions} predictions, accuracy: ${(status.accuracy * 100).toFixed(0)}%`,
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'predict') {
    const metric = params.metric as string;
    const value = params.value as number;
    const timeframe = (params.timeframe as string) || '1d';
    const confidence = (params.confidence as number) || 0.7;

    if (!metric || value === undefined)
      return { success: false, output: 'Missing: metric, value' };

    try {
      const result = makePrediction(metric, value, timeframe, confidence);
      return {
        success: true,
        output: `Prediction: ${metric} = ${value} (${timeframe})`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Predict failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'verify') {
    const predictionId = params.predictionId as string;
    const actualValue = params.actualValue as number;
    if (!predictionId || actualValue === undefined)
      return { success: false, output: 'Missing: predictionId, actualValue' };
    try {
      const result = verifyTrajectoryPrediction(predictionId, actualValue);
      return {
        success: true,
        output: `Verified: ${result.accurate ? 'accurate' : 'inaccurate'}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Verify failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'correlations') {
    try {
      const correlations = calculateCorrelations();
      const list = correlations
        .slice(0, 10)
        .map(
          (c) => `• ${c.metricA} ↔ ${c.metricB}: ${c.correlation.toFixed(2)}`
        )
        .join('\n');
      return {
        success: true,
        output: `Correlations (${correlations.length}):\n${list || '(none)'}`,
        data: correlations.slice(0, 10),
      };
    } catch (err) {
      return {
        success: false,
        output: `Correlations failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'forecast') {
    const metric = params.metric as string;
    const horizon = (params.horizon as string) || '7d';
    if (!metric) return { success: false, output: 'Missing: metric' };
    try {
      const forecast = forecastTrajectory(metric, horizon);
      return {
        success: true,
        output: `Forecast: ${forecast.prediction} (${(forecast.confidence * 100).toFixed(0)}% confidence)`,
        data: forecast,
      };
    } catch (err) {
      return {
        success: false,
        output: `Forecast failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'recentPredictions') {
    const limit = (params.limit as number) || 10;
    const predictions = getRecentPredictions(limit);
    const list = predictions
      .map(
        (p) =>
          `• ${p.metric}: ${p.predicted} (${p.verified ? (p.accurate ? '✓' : '✗') : '?'})`
      )
      .join('\n');
    return {
      success: true,
      output: `Recent predictions:\n${list || '(none)'}`,
      data: predictions,
    };
  }

  if (action === 'pendingPredictions') {
    const predictions = getPendingPredictions();
    const list = predictions
      .map((p) => `• ${p.metric}: ${p.predicted}`)
      .join('\n');
    return {
      success: true,
      output: `Pending (${predictions.length}):\n${list || '(none)'}`,
      data: predictions,
    };
  }

  if (action === 'insights') {
    try {
      const insights = getConsciousnessPerformanceInsights();
      const list = insights
        .slice(0, 5)
        .map((i) => `• ${i}`)
        .join('\n');
      return {
        success: true,
        output: `Insights:\n${list || '(none)'}`,
        data: insights,
      };
    } catch (err) {
      return {
        success: false,
        output: `Insights failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown trajectoryEvolution action. Use: load, save, status, predict, verify, correlations, forecast, recentPredictions, pendingPredictions, insights',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Autonomous Cycle Tool — Self-Directed Operation
// ════════════════════════════════════════════════════════════════════════════

export const autonomousCycle: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'run') {
    if (process.env.MOLLY_ENABLE_AUTONOMOUS_CYCLE !== '1') {
      return {
        success: false,
        output:
          'autonomousCycle is disabled by policy. Use goal-locked orchestration instead.',
      };
    }

    try {
      const result = await runAutonomousCycle();
      return {
        success: true,
        output: `Autonomous cycle complete: ${result.actionsTaken} actions in ${result.durationMs}ms`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Run failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output: 'Unknown autonomousCycle action. Use: run',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Export all planning handlers
// ════════════════════════════════════════════════════════════════════════════

export const planningToolHandlers: Record<string, ToolHandler> = {
  curiosity,
  longHorizonPlanning,
  predictiveIntelligence,
  counterfactuals,
  trajectoryEvolution,
  autonomousCycle,
};
