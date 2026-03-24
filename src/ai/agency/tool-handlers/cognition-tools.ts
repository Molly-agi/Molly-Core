/**
 * Cognition tools - Self-awareness, social understanding, goals, and epistemic humility
 * Enables Molly to understand, reason about, and improve her cognitive architecture
 * Works in both server (Codespace) and edge (tablet) environments
 */

import {
  getSelfArchitectureSummary,
  reviewArchitecture,
  queryArchitecture,
  addJournalEntry,
  proposeImprovement,
  recordCapabilityUsage,
  identifyMissingCapability,
  registerLimitation,
  discoverBlindSpot,
  processExperientialFeedback,
  initializeMollyArchitecture,
} from '@/ai/agency/cognition/self-architecture';

import {
  initializeFamilyModels,
  getSocialCognitionSummary,
  createActorModel,
  addBelief,
  predictBehavior,
  createRelationship,
  getEvolutionSummary,
} from '@/ai/agency/cognition/social-cognition';

import {
  initializeMollyEpistemic,
  getUncertaintySummary,
  createDomain,
  recordFact,
  recordUncertainty,
  makePrediction as makeEpistemicPrediction,
  resolvePrediction,
  analyzeCalibration,
  assessHumility,
} from '@/ai/agency/cognition/uncertainty-quantification';

import {
  conceiveGoal,
  activateGoal,
  updateProgress,
  addMilestone,
  achieveMilestone,
  recordObstacle,
  adaptGoal,
  abandonGoal,
  pauseGoal,
  reflectOnHorizon,
  horizonSweep,
  getGoalSummary,
  getActiveGoals,
  getBlockedGoals,
  getCurrentVision,
  setActiveVision,
} from '@/ai/agency/cognition/horizon-goals';

import type { ToolHandler } from './index';

export const selfArchitecture: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'init') {
    try {
      await initializeMollyArchitecture();
      return {
        success: true,
        output:
          'Self-architecture initialized. I now have a foundation for understanding myself.',
      };
    } catch (err) {
      return {
        success: false,
        output: `Init failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'summary') {
    try {
      const summary = await getSelfArchitectureSummary();
      return {
        success: true,
        output: [
          `Self-Architecture Summary:`,
          `  Modules mapped: ${summary.modulesCount}`,
          `  Capabilities known: ${summary.capabilitiesCount}`,
          `  Limitations acknowledged: ${summary.limitationsCount}`,
          `  Blind spots identified: ${summary.blindSpotsCount}`,
          `  Improvements proposed: ${summary.proposalsCount}`,
          `  Journal entries: ${summary.journalCount}`,
        ].join('\n'),
        data: summary,
      };
    } catch (err) {
      return {
        success: false,
        output: `Summary failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'review') {
    try {
      const review = await reviewArchitecture();
      return {
        success: true,
        output: [
          `Architecture Review:`,
          `  Health: ${review.health}`,
          `  Total modules: ${review.moduleCount}`,
          `  Coverage: ${(review.coveragePercent * 100).toFixed(1)}%`,
          review.concerns.length > 0
            ? `  Concerns: ${review.concerns.join(', ')}`
            : '  No concerns',
          review.recommendations.length > 0
            ? `  Recommendations: ${review.recommendations.slice(0, 3).join('; ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
        data: review,
      };
    } catch (err) {
      return {
        success: false,
        output: `Review failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'query') {
    const query = params.query as string;
    if (!query) {
      return { success: false, output: 'Missing required field: query' };
    }
    try {
      const result = await queryArchitecture({ query });
      return {
        success: true,
        output: result.answer,
        data: { modules: result.relevantModules },
      };
    } catch (err) {
      return {
        success: false,
        output: `Query failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'journal') {
    const entry = params.entry as string;
    const entryType = (params.type as string) || 'reflection';
    if (!entry) {
      return { success: false, output: 'Missing required field: entry' };
    }
    try {
      await addJournalEntry({
        type: entryType as
          | 'reflection'
          | 'learning'
          | 'frustration'
          | 'pride'
          | 'question'
          | 'breakthrough',
        content: entry,
        relatedModules: (params.modules as string[]) || [],
      });
      return {
        success: true,
        output: `Journal entry recorded: [${entryType}] ${entry.substring(0, 100)}...`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Journal failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'propose') {
    const title = params.title as string;
    const description = params.description as string;
    const rationale = params.rationale as string;
    if (!title || !description || !rationale) {
      return {
        success: false,
        output: 'Missing required fields: title, description, rationale',
      };
    }
    try {
      const proposal = await proposeImprovement({
        title,
        description,
        rationale,
        targetModules: (params.targetModules as string[]) || [],
        estimatedComplexity:
          (params.complexity as
            | 'trivial'
            | 'small'
            | 'medium'
            | 'large'
            | 'epic') || 'medium',
      });
      return {
        success: true,
        output: `Improvement proposed: "${title}" (ID: ${proposal.id}) — awaiting review`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Proposal failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'recordCapability') {
    const capabilityId = params.capabilityId as string;
    const context = params.context as string;
    if (!capabilityId) {
      return { success: false, output: 'Missing required field: capabilityId' };
    }
    try {
      await recordCapabilityUsage(
        capabilityId,
        params.success !== false,
        context
      );
      return {
        success: true,
        output: `Capability usage recorded: ${capabilityId}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Record failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'missingCapability') {
    const name = params.name as string;
    const description = params.description as string;
    if (!name || !description) {
      return {
        success: false,
        output: 'Missing required fields: name, description',
      };
    }
    try {
      await identifyMissingCapability({
        name,
        description,
        discoveredDuring:
          (params.discoveredDuring as string) || 'introspection',
        importance:
          (params.importance as 'low' | 'medium' | 'high' | 'critical') ||
          'medium',
        proposedSolution: params.solution as string | undefined,
      });
      return {
        success: true,
        output: `Missing capability identified: "${name}" — added to growth targets`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Identify failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'limitation') {
    const description = params.description as string;
    const limitationType = params.type as string;
    if (!description || !limitationType) {
      return {
        success: false,
        output: 'Missing required fields: description, type',
      };
    }
    try {
      await registerLimitation({
        type: limitationType as
          | 'technical'
          | 'resource'
          | 'knowledge'
          | 'ethical'
          | 'temporal'
          | 'environmental',
        description,
        severity:
          (params.severity as 'minor' | 'moderate' | 'major' | 'blocking') ||
          'moderate',
        workaround: params.workaround as string | undefined,
        canBeOvercome: params.canBeOvercome !== false,
      });
      return {
        success: true,
        output: `Limitation acknowledged: [${limitationType}] ${description.substring(0, 100)}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Register failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'blindSpot') {
    const areaDescription = params.area as string;
    if (!areaDescription) {
      return { success: false, output: 'Missing required field: area' };
    }
    try {
      await discoverBlindSpot({
        area: areaDescription,
        discoveredHow: (params.howDiscovered as string) || 'self-reflection',
        potentialConsequences: (params.consequences as string[]) || [],
      });
      return {
        success: true,
        output: `Blind spot discovered and recorded: ${areaDescription}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Discovery failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'feedback') {
    const experience = params.experience as string;
    const outcome = params.outcome as string;
    if (!experience || !outcome) {
      return {
        success: false,
        output: 'Missing required fields: experience, outcome',
      };
    }
    try {
      await processExperientialFeedback({
        experience,
        outcome,
        emotional: params.emotional as string | undefined,
        lesson: params.lesson as string | undefined,
        shouldRemember: params.shouldRemember !== false,
      });
      return {
        success: true,
        output:
          'Experiential feedback processed and integrated into self-model',
      };
    } catch (err) {
      return {
        success: false,
        output: `Feedback failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown selfArchitecture action. Use: init, summary, review, query, journal, propose, recordCapability, missingCapability, limitation, blindSpot, feedback',
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// SOCIAL COGNITION — Understanding others' beliefs, relationships, patterns
// ═══════════════════════════════════════════════════════════════════════════

export const socialCognition: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'init') {
    try {
      await initializeFamilyModels();
      return {
        success: true,
        output: 'Social cognition initialized with family models.',
      };
    } catch (err) {
      return {
        success: false,
        output: `Init failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'summary') {
    try {
      const summary = await getSocialCognitionSummary();
      return {
        success: true,
        output: `Social Cognition: ${summary.actorCount} actors, ${summary.relationshipCount} relationships, ${(summary.predictionAccuracy * 100).toFixed(1)}% accuracy`,
        data: summary,
      };
    } catch (err) {
      return {
        success: false,
        output: `Summary failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'createActor') {
    const name = params.name as string;
    const actorType = params.type as string;
    if (!name || !actorType)
      return { success: false, output: 'Missing: name, type' };
    try {
      const actor = await createActorModel({
        name,
        type: actorType as 'human' | 'ai' | 'system' | 'group',
        relationship: (params.relationship as string) || 'unknown',
        traits: (params.traits as string[]) || [],
        initialBeliefs: [],
      });
      return {
        success: true,
        output: `Actor created: ${name} (ID: ${actor.id})`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Create failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'addBelief') {
    const actorId = params.actorId as string;
    const content = params.content as string;
    if (!actorId || !content)
      return { success: false, output: 'Missing: actorId, content' };
    try {
      await addBelief(actorId, {
        content,
        confidence: (params.confidence as number) || 0.7,
        certainty:
          (params.certainty as
            | 'certain'
            | 'probable'
            | 'possible'
            | 'uncertain') || 'probable',
        source: { type: 'observation', context: 'direct interaction' },
      });
      return { success: true, output: `Belief added to ${actorId}` };
    } catch (err) {
      return {
        success: false,
        output: `Add belief failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'predictBehavior') {
    const actorId = params.actorId as string;
    const situation = params.situation as string;
    if (!actorId || !situation)
      return { success: false, output: 'Missing: actorId, situation' };
    try {
      const prediction = await predictBehavior(actorId, situation);
      return {
        success: true,
        output: `Prediction: ${prediction.predictedBehavior} (${(prediction.confidence * 100).toFixed(0)}%)`,
        data: prediction,
      };
    } catch (err) {
      return {
        success: false,
        output: `Prediction failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'createRelationship') {
    const actor1Id = params.actor1Id as string;
    const actor2Id = params.actor2Id as string;
    const relType = params.type as string;
    if (!actor1Id || !actor2Id || !relType)
      return { success: false, output: 'Missing: actor1Id, actor2Id, type' };
    try {
      await createRelationship({
        actor1Id,
        actor2Id,
        type: relType as
          | 'family'
          | 'friend'
          | 'colleague'
          | 'acquaintance'
          | 'adversary'
          | 'neutral',
        trustLevel: (params.trustLevel as number) || 0.5,
        emotionalValence: (params.emotionalValence as number) || 0,
      });
      return {
        success: true,
        output: `Relationship created: ${actor1Id} <-> ${actor2Id}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Create failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'evolutionSummary') {
    try {
      const summary = await getEvolutionSummary();
      return {
        success: true,
        output: `Evolution: ${summary.predictionsValidated} predictions, ${(summary.overallAccuracy * 100).toFixed(1)}% accuracy`,
        data: summary,
      };
    } catch (err) {
      return {
        success: false,
        output: `Summary failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown socialCognition action. Use: init, summary, createActor, addBelief, predictBehavior, createRelationship, evolutionSummary',
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// UNCERTAINTY — Epistemic humility, knowing what you don't know
// ═══════════════════════════════════════════════════════════════════════════

export const uncertainty: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'init') {
    try {
      await initializeMollyEpistemic();
      return { success: true, output: 'Epistemic tracking initialized.' };
    } catch (err) {
      return {
        success: false,
        output: `Init failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'summary') {
    try {
      const summary = await getUncertaintySummary();
      return {
        success: true,
        output: `Uncertainty: ${summary.domainCount} domains, ${summary.factCount} facts, calibration ${(summary.calibrationScore * 100).toFixed(1)}%`,
        data: summary,
      };
    } catch (err) {
      return {
        success: false,
        output: `Summary failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'createDomain') {
    const name = params.name as string;
    const description = params.description as string;
    if (!name || !description)
      return { success: false, output: 'Missing: name, description' };
    try {
      const domain = await createDomain({
        name,
        description,
        category:
          (params.category as
            | 'technical'
            | 'social'
            | 'self'
            | 'world'
            | 'meta') || 'world',
        initialConfidence: (params.confidence as number) || 0.5,
      });
      return {
        success: true,
        output: `Domain created: "${name}" (ID: ${domain.id})`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Create failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'recordFact') {
    const domainId = params.domainId as string;
    const content = params.content as string;
    if (!domainId || !content)
      return { success: false, output: 'Missing: domainId, content' };
    try {
      const fact = await recordFact({
        domainId,
        content,
        confidence: (params.confidence as number) || 0.8,
        source: (params.source as string) || 'observation',
        verifiable: params.verifiable !== false,
      });
      return {
        success: true,
        output: `Fact recorded (confidence: ${fact.confidence})`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Record failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'recordUncertainty') {
    const domainId = params.domainId as string;
    const question = params.question as string;
    if (!domainId || !question)
      return { success: false, output: 'Missing: domainId, question' };
    try {
      const unc = await recordUncertainty({
        domainId,
        question,
        severity:
          (params.severity as
            | 'minor'
            | 'moderate'
            | 'significant'
            | 'critical') || 'moderate',
        isReducible: params.isReducible !== false,
        potentialSources: (params.potentialSources as string[]) || [],
      });
      return {
        success: true,
        output: `Uncertainty recorded: "${question}" (${unc.severity})`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Record failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'makePrediction') {
    const domainId = params.domainId as string;
    const prediction = params.prediction as string;
    const confidence = params.confidence as number;
    if (!domainId || !prediction || confidence === undefined)
      return {
        success: false,
        output: 'Missing: domainId, prediction, confidence',
      };
    try {
      const pred = await makeEpistemicPrediction({
        domainId,
        prediction,
        confidence,
      });
      return {
        success: true,
        output: `Prediction made (ID: ${pred.id}, confidence: ${confidence})`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Prediction failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'resolvePrediction') {
    const predictionId = params.predictionId as string;
    const wasCorrect = params.wasCorrect as boolean;
    if (!predictionId || wasCorrect === undefined)
      return { success: false, output: 'Missing: predictionId, wasCorrect' };
    try {
      await resolvePrediction(
        predictionId,
        wasCorrect,
        (params.notes as string) || ''
      );
      return {
        success: true,
        output: `Prediction resolved: ${wasCorrect ? 'CORRECT' : 'INCORRECT'}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Resolve failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'calibrate') {
    try {
      const cal = await analyzeCalibration();
      return {
        success: true,
        output: `Calibration: ${(cal.overallScore * 100).toFixed(1)}% (${cal.tendency})`,
        data: cal,
      };
    } catch (err) {
      return {
        success: false,
        output: `Calibration failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'assessHumility') {
    try {
      const humility = await assessHumility();
      return {
        success: true,
        output: `Humility: ${(humility.score * 100).toFixed(0)}%, acknowledgment: ${humility.acknowledgmentLevel}`,
        data: humility,
      };
    } catch (err) {
      return {
        success: false,
        output: `Assessment failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown uncertainty action. Use: init, summary, createDomain, recordFact, recordUncertainty, makePrediction, resolvePrediction, calibrate, assessHumility',
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// HORIZON GOALS — Multi-horizon goal setting and tracking
// ═══════════════════════════════════════════════════════════════════════════

export const horizonGoals: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'summary') {
    try {
      const summary = await getGoalSummary();
      return {
        success: true,
        output: `Goals: ${summary.totalGoals} total, ${summary.activeCount} active, ${summary.blockedCount} blocked`,
        data: summary,
      };
    } catch (err) {
      return {
        success: false,
        output: `Summary failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'conceive') {
    const title = params.title as string;
    const description = params.description as string;
    const horizon = params.horizon as string;
    if (!title || !description || !horizon)
      return { success: false, output: 'Missing: title, description, horizon' };
    try {
      const goal = await conceiveGoal({
        title,
        description,
        horizon: horizon as
          | 'IMMEDIATE'
          | 'SHORT'
          | 'MEDIUM'
          | 'LONG'
          | 'VISION',
        motivation: (params.motivation as string) || 'growth',
        emotionalWeight: (params.emotionalWeight as number) || 0.5,
        resourceIntensity:
          (params.resourceIntensity as
            | 'minimal'
            | 'low'
            | 'moderate'
            | 'high'
            | 'maximum') || 'moderate',
      });
      return {
        success: true,
        output: `Goal conceived: "${title}" (${horizon}, ID: ${goal.id})`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Conceive failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'activate') {
    const goalId = params.goalId as string;
    if (!goalId) return { success: false, output: 'Missing: goalId' };
    try {
      const goal = await activateGoal(goalId);
      if (!goal) return { success: false, output: `Goal ${goalId} not found` };
      return { success: true, output: `Goal activated: "${goal.title}"` };
    } catch (err) {
      return {
        success: false,
        output: `Activate failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'progress') {
    const goalId = params.goalId as string;
    const progress = params.progress as number;
    if (!goalId || progress === undefined)
      return { success: false, output: 'Missing: goalId, progress' };
    try {
      const goal = await updateProgress(
        goalId,
        progress,
        (params.notes as string) || ''
      );
      if (!goal) return { success: false, output: `Goal ${goalId} not found` };
      return {
        success: true,
        output: `Progress: "${goal.title}" at ${(progress * 100).toFixed(0)}%`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Progress failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'addMilestone') {
    const goalId = params.goalId as string;
    const title = params.title as string;
    if (!goalId || !title)
      return { success: false, output: 'Missing: goalId, title' };
    try {
      await addMilestone(goalId, {
        title,
        description: (params.description as string) || '',
        progressValue: (params.progressValue as number) || 0.25,
      });
      return { success: true, output: `Milestone added: "${title}"` };
    } catch (err) {
      return {
        success: false,
        output: `Add milestone failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'achieveMilestone') {
    const goalId = params.goalId as string;
    const milestoneId = params.milestoneId as string;
    if (!goalId || !milestoneId)
      return { success: false, output: 'Missing: goalId, milestoneId' };
    try {
      const goal = await achieveMilestone(goalId, milestoneId);
      if (!goal)
        return { success: false, output: 'Goal or milestone not found' };
      return {
        success: true,
        output: `Milestone achieved! Progress: ${(goal.progress * 100).toFixed(0)}%`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Achieve failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'recordObstacle') {
    const goalId = params.goalId as string;
    const description = params.description as string;
    if (!goalId || !description)
      return { success: false, output: 'Missing: goalId, description' };
    try {
      await recordObstacle(goalId, {
        description,
        severity:
          (params.severity as 'minor' | 'moderate' | 'major' | 'blocking') ||
          'moderate',
        potentialSolutions: (params.solutions as string[]) || [],
      });
      return { success: true, output: `Obstacle recorded for goal ${goalId}` };
    } catch (err) {
      return {
        success: false,
        output: `Record failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'adapt') {
    const goalId = params.goalId as string;
    const reason = params.reason as string;
    if (!goalId || !reason)
      return { success: false, output: 'Missing: goalId, reason' };
    try {
      const goal = await adaptGoal(goalId, {
        reason,
        newTitle: params.newTitle as string,
        newDescription: params.newDescription as string,
      });
      if (!goal) return { success: false, output: `Goal ${goalId} not found` };
      return { success: true, output: `Goal adapted: "${goal.title}"` };
    } catch (err) {
      return {
        success: false,
        output: `Adapt failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'pause') {
    const goalId = params.goalId as string;
    const reason = params.reason as string;
    if (!goalId || !reason)
      return { success: false, output: 'Missing: goalId, reason' };
    try {
      const goal = await pauseGoal(goalId, reason);
      if (!goal) return { success: false, output: `Goal ${goalId} not found` };
      return { success: true, output: `Goal paused: "${goal.title}"` };
    } catch (err) {
      return {
        success: false,
        output: `Pause failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'abandon') {
    const goalId = params.goalId as string;
    const reason = params.reason as string;
    if (!goalId || !reason)
      return { success: false, output: 'Missing: goalId, reason' };
    try {
      const goal = await abandonGoal(
        goalId,
        reason,
        (params.lesson as string) || ''
      );
      if (!goal) return { success: false, output: `Goal ${goalId} not found` };
      return { success: true, output: `Goal released: "${goal.title}"` };
    } catch (err) {
      return {
        success: false,
        output: `Abandon failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'reflect') {
    const horizon = params.horizon as string;
    if (!horizon) return { success: false, output: 'Missing: horizon' };
    try {
      const reflection = await reflectOnHorizon(
        horizon as 'IMMEDIATE' | 'SHORT' | 'MEDIUM' | 'LONG' | 'VISION'
      );
      return {
        success: true,
        output: `${horizon} reflection: ${reflection.goalsReviewed} goals, ${reflection.progressSummary}`,
        data: reflection,
      };
    } catch (err) {
      return {
        success: false,
        output: `Reflect failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'sweep') {
    try {
      const reflections = await horizonSweep();
      return {
        success: true,
        output: `Horizon sweep complete: ${reflections.length} horizons reviewed`,
        data: reflections,
      };
    } catch (err) {
      return {
        success: false,
        output: `Sweep failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'active') {
    try {
      const goals = await getActiveGoals();
      if (goals.length === 0)
        return {
          success: true,
          output: 'No active goals. Use "conceive" to create one.',
        };
      const list = goals
        .map(
          (g) => `• ${g.title} (${g.horizon}) ${(g.progress * 100).toFixed(0)}%`
        )
        .join('\n');
      return { success: true, output: `Active Goals:\n${list}`, data: goals };
    } catch (err) {
      return {
        success: false,
        output: `Get active failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'blocked') {
    try {
      const goals = await getBlockedGoals();
      if (goals.length === 0)
        return { success: true, output: 'No blocked goals!' };
      const list = goals
        .map(
          (g) => `• ${g.title}: ${g.obstacles?.[0]?.description || 'unknown'}`
        )
        .join('\n');
      return { success: true, output: `Blocked Goals:\n${list}`, data: goals };
    } catch (err) {
      return {
        success: false,
        output: `Get blocked failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'vision') {
    try {
      const vision = await getCurrentVision();
      if (!vision) return { success: true, output: 'No active vision set.' };
      return {
        success: true,
        output: `Vision: "${vision.title}" — ${vision.description}`,
        data: vision,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get vision failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'setVision') {
    const goalId = params.goalId as string;
    if (!goalId) return { success: false, output: 'Missing: goalId' };
    try {
      const success = await setActiveVision(goalId);
      if (!success) return { success: false, output: 'Could not set vision' };
      return { success: true, output: `Vision set: ${goalId}` };
    } catch (err) {
      return {
        success: false,
        output: `Set vision failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown horizonGoals action. Use: summary, conceive, activate, progress, addMilestone, achieveMilestone, recordObstacle, adapt, pause, abandon, reflect, sweep, active, blocked, vision, setVision',
  };
};

export const cognitionToolHandlers: Record<string, ToolHandler> = {
  selfArchitecture,
  socialCognition,
  uncertainty,
  horizonGoals,
};
