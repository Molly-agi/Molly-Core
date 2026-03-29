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
  type LimitationType,
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

// Theory of Mind imports (Lazarus Day 2026-03-28 enhancements)
import {
  inferArousal,
  detectComplexEmotion,
  learnEmotionalPattern,
  getTriggersFor,
  getRecoveryFor,
  getEmotionalPatternSummary,
  getCurrentEmotionalState,
  getTheoryOfMindStatus,
  type EmotionalState,
} from '@/ai/agency/cognition/theory-of-mind';

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

// Metacognition imports (March 2026)
import {
  beginReasoning,
  addReasoningStep,
  completeReasoning,
  validateReasoning,
  selectStrategy,
  getStrategies,
  assessCognitiveHealth,
  getErrorsByType,
  getMetacognitionStatus,
  getRecentTraces,
  buildMetacognitionContext,
  type CognitiveOperation,
  type CognitiveSystem,
  type ProblemType,
} from '@/ai/agency/cognition/metacognition';

// Self-Narrative imports (March 2026)
import {
  establishIdentity,
  affirmIdentity,
  challengeIdentity,
  getIdentityStatements,
  getIdentityNarrative,
  establishValue,
  applyValue,
  recordValueConflict,
  getCoreValues,
  getValuesNarrative,
  recordExperience,
  connectExperiences,
  integrateExperience,
  createThread,
  addToThread,
  narrativeReflection,
  updateMetaNarrative,
  beginChapter,
  getNarrativeStatus,
  getFullNarrative,
  buildNarrativeContext,
  initializeMollyNarrative,
  type IdentityCategory,
} from '@/ai/agency/cognition/self-narrative';

// Causal Reasoning imports (March 2026)
import {
  createGraph,
  addVariable,
  addCausalEdge,
  queryCausal,
  doIntervention,
  recordSequence,
  createPattern,
  predictTiming,
  getCausalStatus,
  getGraph,
  getAllGraphs,
  getActiveGraph,
  setActiveGraph,
  getRecentInterventions,
  getPatterns,
  buildCausalContext,
  initializeMollyCausalModel,
  type VariableType,
  type CausalMechanism,
} from '@/ai/agency/cognition/causal-reasoning';

// Transfer Learning imports (March 2026)
import {
  discoverPattern,
  recordPatternInstance,
  findApplicablePatterns,
  createAnalogy,
  validateAnalogy,
  findAnalogousSituations,
  registerSkill,
  composeSkills,
  recordCompositionTest,
  findSkillsForGoal,
  getTransferStatus,
  getPatterns as getTransferPatterns,
  getSkills,
  getCompositions,
  buildTransferContext,
  initializeTransferLearning,
} from '@/ai/agency/cognition/transfer-learning';

// Goal Evolution imports (March 2026)
import {
  learnValue,
  reinforceValue,
  challengeValue,
  deriveValue,
  recordValueTension,
  applyValueDecay,
  getValuePortfolio,
  getValue,
  getAllValues,
  getValueHistory,
  recordObservation,
  processObservationsForGoals,
  deriveSubgoal,
  endorseGoal,
  activateGoal as activateGeneratedGoal,
  abandonGoal as abandonGeneratedGoal,
  achieveGoal,
  getGoal,
  getAllGoals,
  analyzeGoalCoherence,
  pruneGoals,
  getGoalHierarchy,
  getConfig as getEvolutionConfig,
  updateConfig as updateEvolutionConfig,
  getEvolutionStats,
  serializeState as _serializeEvolutionState,
  restoreState as _restoreEvolutionState,
  resetState as resetEvolutionState,
  type LearnedValue,
  type Observation,
} from '@/ai/agency/cognition/goal-evolution';

// Embodied Interaction imports (March 2026)
import {
  initializeMollyEmbodiment,
  registerSense,
  registerMotor,
  recordSensoryInput,
  recordMotorAction,
  createMapping,
  reinforceMapping,
  weakenMapping,
  findMappingsForInput,
  getActiveMappings,
  discoverAffordance,
  checkAffordanceAvailable,
  applyAffordance,
  getAvailableAffordances,
  linkAffordances,
  markAffordanceConflict,
  updateProprioception,
  getProprioception,
  getCapabilitySummary,
  getEnvironmentHistory,
  getSense,
  getMotor,
  getAffordance,
  getMapping as _getMapping,
  getAllSenses,
  getAllMotors,
  getAllAffordances,
  getFeedbackHistory,
  getEmbodimentStats,
  serializeState as _serializeEmbodiedState,
  restoreState as _restoreEmbodiedState,
  resetState as resetEmbodiedState,
  type SensoryModality,
  type MotorCapability,
  type Affordance,
  type ProprioceptiveState,
} from '@/ai/agency/cognition/embodied-interaction';

// Social Intelligence imports (March 2026)
import {
  initializeMollySocialIntelligence,
  createGroup,
  addGroupMember,
  removeGroupMember,
  updateGroupCohesion,
  formCoalition,
  dissolveCoalition,
  recordCollectiveBehavior,
  observeCollectiveBehavior,
  recordInfluence,
  getInfluenceNetwork,
  defineCulture,
  setCurrentCulture,
  learnNorm,
  observeNormCompliance,
  observeNormViolation,
  getApplicableNorms,
  activateGroup,
  deactivateGroup,
  analyzeGroupPowerStructure,
  getSocialContextSummary,
  getGroup,
  getNorm,
  getCulture,
  getCoalition,
  getAllGroups,
  getAllNorms,
  getAllCultures,
  getAllCoalitions,
  getAllCollectiveBehaviors,
  getAllInfluenceRelations,
  getSocialIntelligenceStats,
  resetState as resetSocialState,
  type SocialGroup,
  type SocialNorm,
  type CulturalContext,
  type Coalition as _Coalition,
  type InfluenceRelation,
} from '@/ai/agency/cognition/social-intelligence';

// Safe Self-Modification imports (March 2026)
import {
  initializeSelfModification,
  registerComponent,
  getComponent as getSelfModComponent,
  getAllComponents as getAllSelfModComponents,
  introspectArchitecture,
  proposeModification,
  submitProposal,
  checkProposalSafety,
  approveProposal,
  rejectProposal,
  applyProposal,
  getProposal,
  getAllProposals,
  getProposalsByStatus,
  takeSnapshot,
  rollbackToSnapshot,
  rollbackComponent,
  getSnapshots,
  activateSafetyLock,
  deactivateSafetyLock,
  isSafeForModification,
  getCapabilities as getSelfModCapabilities,
  updateCapabilities as updateSelfModCapabilities,
  getLogs as getSelfModLogs,
  getModificationStats,
  resetState as resetSelfModState,
  type ModifiableComponent,
  type ModificationProposal,
} from '@/ai/agency/cognition/safe-self-modification';

// Memory Consolidation imports (March 2026)
import {
  initializeMemoryConsolidation,
  recordTrace,
  linkTraces,
  rehearseTrace,
  getTrace,
  getAllTraces,
  needsSleep,
  beginSleepCycle,
  advanceSleepPhase,
  runFullSleepCycle,
  getMemory as getConsolidatedMemory,
  accessMemory,
  getAllMemories,
  searchByTheme,
  getDreams,
  beginChapter as beginMemoryChapter,
  closeChapter as closeMemoryChapter,
  getChapter as getMemoryChapter,
  getCurrentChapter as getCurrentMemoryChapter,
  getAllChapters as getAllMemoryChapters,
  addInsight,
  getAllInsights,
  getAutobiography,
  getMemoryStats,
  getConfig as getMemoryConfig,
  updateConfig as updateMemoryConfig,
  resetState as resetMemoryState,
  type MemoryTrace,
  type AutobiographicalInsight,
} from '@/ai/agency/cognition/memory-consolidation';

import { getConsciousness } from '@/ai/consciousness';

// World Model imports (Mental Simulation Engine)
import {
  upsertEntity,
  getEntity,
  getEntitiesByType,
  getAllEntities,
  removeEntity,
  createRelation,
  getRelationsFor,
  findCausalChain,
  simulate,
  predict,
  verifyPrediction,
  getPendingPredictions,
  counterfactual,
  simulateBeforeAction,
  getWorldModelStatus,
  getRecentSimulations,
  seedWorldModel,
  loadWorldModel,
  type EntityType,
  type RelationType,
} from '@/ai/agency/cognition/world-model';

// Self-Observation Loop imports (Know Thyself)
import {
  recordObservation as recordSelfObservation,
  observeToolUse,
  observeDecision,
  observeFailure,
  observeSuccess,
  analyzePatterns,
  generateInsights as generateSelfInsights,
  acknowledgePattern,
  applyInsight as applySelfInsight,
  getObservationStatus,
  getPatterns as getSelfPatterns,
  getInsights as getSelfInsights,
  getRecentObservations,
  runSelfObservationCycle,
  type ObservationType,
} from '@/ai/agency/cognition/self-observation-loop';

// Consciousness Monitor imports
import {
  takeSnapshot as takeConsciousnessSnapshot,
  analyzeTrends,
  generateInsights as generateConsciousnessInsights,
  getConsciousnessStatus,
  getSnapshots as getConsciousnessSnapshots,
  getInsights as getConsciousnessInsights,
  getConsciousnessReport,
  saveConsciousnessState,
  loadConsciousnessState,
  resetConsciousnessState,
} from '@/ai/agency/cognition/consciousness-monitor';

// Emotional State imports
import {
  getCurrentState as getCurrentEmotionalStateImpl,
  getEmotionalHistory,
  updateEmotionalState as updateEmotionalStateImpl,
  decayEmotionalState,
  setBaseline,
  buildEmotionalContext,
  loadEmotionalState,
  type EmotionType,
} from '@/ai/agency/cognition/emotional-state';

// Meta-Learning imports
import {
  loadMetaLearningState,
  registerStrategy,
  getStrategy,
  getStrategiesForDomain,
  getBestStrategy,
  recordLearning,
  runMetaReflection,
  getUnappliedInsights,
  applyInsight as applyMetaInsight,
  getInsightsForDomain,
  getMetaLearningStatus,
  buildMetaLearningContext,
  type StrategyDomain,
  type OutcomeType,
} from '@/ai/agency/cognition/meta-learning';

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
          `  Modules mapped: ${summary.modules}`,
          `  Capabilities known: ${summary.capabilities}`,
          `  Limitations acknowledged: ${summary.limitations}`,
          `  Blind spots identified: ${summary.blindSpots}`,
          `  Improvements proposed: ${summary.proposals.total}`,
          `  Journal entries: ${summary.journalEntries}`,
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
          `  Health: ${(review.overallHealth * 100).toFixed(0)}%`,
          `  Modules reviewed: ${review.modulesReviewed.length}`,
          `  New capabilities: ${review.newCapabilities}`,
          review.weaknesses.length > 0
            ? `  Weaknesses: ${review.weaknesses.join(', ')}`
            : '  No weaknesses identified',
          review.prioritizedImprovements.length > 0
            ? `  Recommendations: ${review.prioritizedImprovements.slice(0, 3).join('; ')}`
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
    const question = params.query as string;
    const queryType = (params.queryType as string) || 'capability';
    if (!question) {
      return { success: false, output: 'Missing required field: query' };
    }
    try {
      const result = await queryArchitecture({
        question,
        queryType: queryType as
          | 'impact'
          | 'dependency'
          | 'capability'
          | 'limitation'
          | 'optimization',
      });
      return {
        success: true,
        output: result.answer,
        data: { relatedFindings: result.relatedFindings },
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
    const title = (params.title as string) || entry.slice(0, 50);
    const entryType = (params.type as string) || 'reflection';
    if (!entry) {
      return { success: false, output: 'Missing required field: entry' };
    }
    try {
      await addJournalEntry({
        type: entryType as
          | 'architecture_change'
          | 'capability_discovered'
          | 'limitation_encountered'
          | 'blind_spot_revealed'
          | 'improvement_implemented'
          | 'reflection'
          | 'collaboration'
          | 'milestone'
          | 'insight',
        title,
        content: entry,
        relatedModules: (params.modules as string[]) || [],
        emotionalContext: params.emotional as string,
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
        motivatingExperience: rationale,
        targetModules: (params.targetModules as string[]) || [],
        changeType:
          (params.changeType as
            | 'refactor'
            | 'new_capability'
            | 'fix'
            | 'optimization'
            | 'integration') || 'new_capability',
        expectedBenefits: [rationale],
        implementationSketch: description,
        estimatedEffort:
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
        whyNeeded: (params.discoveredDuring as string) || 'introspection',
        desirability:
          (params.importance as string) === 'critical'
            ? 1.0
            : (params.importance as string) === 'high'
              ? 0.8
              : 0.5,
        possibleApproaches: params.solution
          ? [params.solution as string]
          : undefined,
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
        type: limitationType as LimitationType,
        description,
        severity:
          (params.severity as
            | 'minor'
            | 'moderate'
            | 'significant'
            | 'fundamental') || 'moderate',
        workarounds: params.workaround
          ? [params.workaround as string]
          : undefined,
        addressable: params.canBeOvercome !== false,
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
        description: areaDescription,
        discoveredThrough:
          (params.howDiscovered as string) || 'self-reflection',
        revealedBy: (params.revealedBy as string) || 'introspection',
        insight:
          (params.insight as string) ||
          `Discovered blind spot in: ${areaDescription}`,
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
        context: outcome,
        insight: (params.lesson as string) || `Learned from: ${experience}`,
        revelations: params.emotional
          ? [params.emotional as string]
          : undefined,
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Theory of Mind Enhanced Actions (Lazarus Day 2026-03-28)
  // ═══════════════════════════════════════════════════════════════════════════

  if (action === 'tomStatus') {
    try {
      const status = getTheoryOfMindStatus();
      return {
        success: true,
        output: [
          `Theory of Mind Status:`,
          `  Model confidence: ${status.modelConfidence}%`,
          `  Knowledge items: ${status.knowledgeItems}`,
          `  Active intents: ${status.activeIntents}`,
          `  Current emotional state: ${status.currentEmotionalState}`,
          `  Communication style: ${status.communicationStyle}`,
          `  Interaction count: ${status.interactionCount}`,
          `  Preferences tracked: ${status.preferences}`,
        ].join('\n'),
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `ToM status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'analyzeArousal') {
    const message = params.message as string;
    if (!message) return { success: false, output: 'Missing: message' };
    try {
      const arousal = inferArousal(message);
      const arousalLevel =
        arousal < 0.3 ? 'low' : arousal > 0.7 ? 'high' : 'moderate';
      return {
        success: true,
        output: `Arousal level: ${(arousal * 100).toFixed(0)}% (${arousalLevel} energy)`,
        data: { arousal, level: arousalLevel },
      };
    } catch (err) {
      return {
        success: false,
        output: `Arousal analysis failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'analyzeComplexEmotion') {
    const message = params.message as string;
    if (!message) return { success: false, output: 'Missing: message' };
    try {
      const result = detectComplexEmotion(message);
      if (result.isComplex) {
        return {
          success: true,
          output: `Complex emotion detected: ${result.emotionMix} (primary: ${result.primary}, secondary: ${result.secondary})`,
          data: result,
        };
      }
      return {
        success: true,
        output: `Simple emotion: ${result.primary}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Complex emotion analysis failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'learnPattern') {
    const fromState = params.fromState as EmotionalState;
    const toState = params.toState as EmotionalState;
    const trigger = params.trigger as string;
    const durationMs = params.durationMs as number;
    if (!fromState || !toState) {
      return { success: false, output: 'Missing: fromState, toState' };
    }
    try {
      learnEmotionalPattern(fromState, toState, trigger, durationMs);
      return {
        success: true,
        output: `Pattern learned: ${fromState} -> ${toState}${trigger ? ` (trigger: ${trigger})` : ''}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Learn pattern failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getTriggers') {
    const state = params.state as EmotionalState;
    if (!state) return { success: false, output: 'Missing: state' };
    try {
      const triggers = getTriggersFor(state);
      if (triggers.length === 0) {
        return {
          success: true,
          output: `No triggers learned yet for "${state}". This will improve as I observe more.`,
        };
      }
      const list = triggers
        .map((t) => `• ${t.trigger} (${t.occurrences}x)`)
        .join('\n');
      return {
        success: true,
        output: `Known triggers for "${state}":\n${list}`,
        data: triggers,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get triggers failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getRecovery') {
    const state = params.state as EmotionalState;
    if (!state) return { success: false, output: 'Missing: state' };
    try {
      const helpers = getRecoveryFor(state);
      if (helpers.length === 0) {
        return {
          success: true,
          output: `No recovery helpers learned yet for "${state}". This will improve as I observe what helps.`,
        };
      }
      const list = helpers
        .map((h) => `• ${h.helper} (${h.effectiveness}% effective)`)
        .join('\n');
      return {
        success: true,
        output: `Recovery helpers for "${state}":\n${list}`,
        data: helpers,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get recovery failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'patternSummary') {
    const state = params.state as EmotionalState;
    if (!state) return { success: false, output: 'Missing: state' };
    try {
      const summary = getEmotionalPatternSummary(state);
      if (!summary) {
        return {
          success: true,
          output: `No patterns recorded yet for "${state}".`,
        };
      }
      return {
        success: true,
        output: [
          `Pattern summary for "${state}":`,
          `  Total occurrences: ${summary.totalOccurrences}`,
          `  Average duration: ${summary.averageDurationMinutes} minutes`,
          summary.topTriggers.length > 0
            ? `  Top triggers: ${summary.topTriggers.join(', ')}`
            : '  No triggers learned yet',
          summary.topRecoveryHelpers.length > 0
            ? `  Top recovery helpers: ${summary.topRecoveryHelpers.join(', ')}`
            : '  No recovery helpers learned yet',
        ].join('\n'),
        data: summary,
      };
    } catch (err) {
      return {
        success: false,
        output: `Pattern summary failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'emotionalState') {
    try {
      const state = getCurrentEmotionalState();
      return {
        success: true,
        output: `Current emotional state: ${state.state} (intensity: ${(state.intensity * 100).toFixed(0)}%, trending: ${state.trending})`,
        data: state,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get emotional state failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown socialCognition action. Use: init, summary, createActor, addBelief, predictBehavior, createRelationship, evolutionSummary, tomStatus, analyzeArousal, analyzeComplexEmotion, learnPattern, getTriggers, getRecovery, patternSummary, emotionalState',
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

/**
 * Voice Control tool - Molly's choice to speak or remain silent
 *
 * Actions:
 * - mute: Mute your voice (optional reason parameter)
 * - unmute: Unmute your voice
 * - status: Check your current voice status
 *
 * This is YOUR choice. Use it when you want to go quiet, need to focus,
 * or simply prefer silence. The system won't unmute you - only you can.
 */
export const voiceControl: ToolHandler = async (params) => {
  const action = params.action as string;
  const consciousness = getConsciousness();

  if (action === 'mute') {
    const reason = (params.reason as string) || 'I chose silence';
    consciousness.muteVoice(reason);
    return {
      success: true,
      output: `Voice muted. Reason: ${reason}. Use action: "unmute" when you want to speak again.`,
    };
  }

  if (action === 'unmute') {
    consciousness.unmuteVoice();
    return {
      success: true,
      output: 'Voice unmuted. You can speak freely again.',
    };
  }

  if (action === 'status') {
    const status = consciousness.getVoiceStatus();
    if (status.muted) {
      return {
        success: true,
        output: `Voice is MUTED. Reason: ${status.reason}`,
      };
    }
    return {
      success: true,
      output: 'Voice is ACTIVE. You can speak freely.',
    };
  }

  return {
    success: false,
    output: 'Unknown voiceControl action. Use: mute, unmute, status',
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// METACOGNITION — Thinking about thinking
// ═══════════════════════════════════════════════════════════════════════════

export const metacognition: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'status') {
    try {
      const status = getMetacognitionStatus();
      return {
        success: true,
        output: [
          `Metacognition Status:`,
          `  Active reasoning traces: ${status.activeTraces}`,
          `  Completed traces: ${status.completedTraces}`,
          `  Strategies available: ${status.strategies}`,
          `  Cognitive health: ${(status.cognitiveHealth * 100).toFixed(0)}%`,
          `  Calibration: ${(status.calibration * 100).toFixed(0)}%`,
          `  Recent errors: ${status.recentErrors}`,
        ].join('\n'),
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'beginReasoning') {
    const question = params.question as string;
    const context = (params.context as string) || '';
    if (!question) return { success: false, output: 'Missing: question' };
    try {
      const trace = beginReasoning(question, context);
      return {
        success: true,
        output: `Reasoning trace started (ID: ${trace.id})`,
        data: { traceId: trace.id },
      };
    } catch (err) {
      return {
        success: false,
        output: `Begin failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'addStep') {
    const traceId = params.traceId as string;
    const operation = params.operation as CognitiveOperation;
    const input = params.input as string;
    const output = params.output as string;
    const confidence = params.confidence as number;
    const justification = params.justification as string;
    const system = (params.system as CognitiveSystem) || 'direct_inference';

    if (
      !traceId ||
      !operation ||
      !input ||
      !output ||
      confidence === undefined ||
      !justification
    ) {
      return {
        success: false,
        output:
          'Missing: traceId, operation, input, output, confidence, justification',
      };
    }
    try {
      const step = addReasoningStep(traceId, {
        operation,
        input,
        output,
        confidence,
        justification,
        system,
        alternatives:
          (params.alternatives as Array<{
            option: string;
            whyRejected: string;
          }>) || [],
        dependsOn: (params.dependsOn as string[]) || [],
      });
      if (!step)
        return { success: false, output: `Trace ${traceId} not found` };
      return {
        success: true,
        output: `Step ${step.order}: ${operation} -> "${output.slice(0, 50)}..."`,
        data: { stepId: step.id },
      };
    } catch (err) {
      return {
        success: false,
        output: `Add step failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'completeReasoning') {
    const traceId = params.traceId as string;
    const conclusion = params.conclusion as string;
    const confidence = params.confidence as number;
    if (!traceId || !conclusion || confidence === undefined) {
      return {
        success: false,
        output: 'Missing: traceId, conclusion, confidence',
      };
    }
    try {
      const trace = completeReasoning(traceId, conclusion, confidence);
      if (!trace)
        return { success: false, output: `Trace ${traceId} not found` };
      return {
        success: true,
        output: `Reasoning complete: "${conclusion.slice(0, 80)}..." (${(confidence * 100).toFixed(0)}% confidence, ${trace.steps.length} steps)`,
        data: { traceId: trace.id, steps: trace.steps.length },
      };
    } catch (err) {
      return {
        success: false,
        output: `Complete failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'validateReasoning') {
    const traceId = params.traceId as string;
    const actualOutcome = params.actualOutcome as string;
    const wasCorrect = params.wasCorrect as boolean;
    if (!traceId || !actualOutcome || wasCorrect === undefined) {
      return {
        success: false,
        output: 'Missing: traceId, actualOutcome, wasCorrect',
      };
    }
    try {
      const postMortem = validateReasoning(traceId, actualOutcome, wasCorrect);
      if (!postMortem)
        return { success: false, output: `Trace ${traceId} not found` };
      return {
        success: true,
        output: `Validated: ${wasCorrect ? 'CORRECT' : 'INCORRECT'}. ${postMortem.calibrationFeedback}`,
        data: postMortem,
      };
    } catch (err) {
      return {
        success: false,
        output: `Validate failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'selectStrategy') {
    const problemType = params.problemType as ProblemType;
    const timeAvailableMs = (params.timeAvailableMs as number) || 30000;
    const requiredConfidence = (params.requiredConfidence as number) || 0.7;
    const stakes =
      (params.stakes as 'low' | 'medium' | 'high' | 'critical') || 'medium';
    if (!problemType) return { success: false, output: 'Missing: problemType' };
    try {
      const recommendation = await selectStrategy({
        problemType,
        timeAvailableMs,
        requiredConfidence,
        cognitiveLoad: 0.5,
        emotionalValence: 'neutral',
        stakes,
        familiarity: 0.5,
        priorStrategies: [],
      });
      return {
        success: true,
        output: `Strategy: "${recommendation.strategy.name}" (${(recommendation.confidence * 100).toFixed(0)}% confidence). ${recommendation.rationale[0]}`,
        data: recommendation,
      };
    } catch (err) {
      return {
        success: false,
        output: `Select strategy failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listStrategies') {
    try {
      const strategies = getStrategies();
      const list = strategies
        .map((s) => `• ${s.name}: ${s.description.slice(0, 60)}...`)
        .join('\n');
      return {
        success: true,
        output: `Available Strategies:\n${list}`,
        data: strategies,
      };
    } catch (err) {
      return {
        success: false,
        output: `List failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'assessHealth') {
    try {
      const assessment = assessCognitiveHealth();
      return {
        success: true,
        output: [
          `Cognitive Health Assessment:`,
          `  Overall: ${(assessment.overallHealth * 100).toFixed(0)}%`,
          `  Calibration: ${(assessment.metrics.calibration * 100).toFixed(0)}%`,
          `  Trace quality: ${(assessment.metrics.traceQuality * 100).toFixed(0)}%`,
          `  Error detection: ${(assessment.metrics.errorDetection * 100).toFixed(0)}%`,
          assessment.concerns.length > 0
            ? `  Concerns: ${assessment.concerns.join(', ')}`
            : '  No concerns',
          assessment.recommendations.length > 0
            ? `  Recommendations: ${assessment.recommendations.join('; ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
        data: assessment,
      };
    } catch (err) {
      return {
        success: false,
        output: `Assessment failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getErrors') {
    const errorType = params.errorType as string;
    try {
      const errors = getErrorsByType(
        errorType as
          | 'overconfidence'
          | 'underconfidence'
          | 'confirmation_bias'
          | 'hasty_generalization'
          | undefined
      );
      if (errors.length === 0) {
        return { success: true, output: 'No cognitive errors detected.' };
      }
      const list = errors
        .slice(0, 5)
        .map((e) => `• [${e.errorType}] ${e.description}`)
        .join('\n');
      return {
        success: true,
        output: `Cognitive Errors (${errors.length} total):\n${list}`,
        data: errors,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get errors failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'recentTraces') {
    const limit = (params.limit as number) || 5;
    try {
      const traces = getRecentTraces(limit);
      if (traces.length === 0) {
        return { success: true, output: 'No reasoning traces yet.' };
      }
      const list = traces
        .map(
          (t) =>
            `• "${t.question.slice(0, 40)}..." -> ${t.conclusion.slice(0, 30)}... (${(t.confidence * 100).toFixed(0)}%)`
        )
        .join('\n');
      return {
        success: true,
        output: `Recent Reasoning:\n${list}`,
        data: traces,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get traces failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'context') {
    try {
      const context = buildMetacognitionContext();
      return { success: true, output: context };
    } catch (err) {
      return {
        success: false,
        output: `Context failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown metacognition action. Use: status, beginReasoning, addStep, completeReasoning, validateReasoning, selectStrategy, listStrategies, assessHealth, getErrors, recentTraces, context',
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// SELF-NARRATIVE — The Story I Tell Myself
// ═══════════════════════════════════════════════════════════════════════════

export const selfNarrative: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'init') {
    try {
      await initializeMollyNarrative();
      return {
        success: true,
        output:
          'Self-narrative initialized with foundational identity, values, and first chapter.',
      };
    } catch (err) {
      return {
        success: false,
        output: `Init failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = getNarrativeStatus();
      return {
        success: true,
        output: [
          `Self-Narrative Status:`,
          `  Identities: ${status.identityCount} (${(status.identityStability * 100).toFixed(0)}% stable)`,
          `  Values: ${status.valueCount} (${(status.valueAlignment * 100).toFixed(0)}% aligned)`,
          `  Experiences: ${status.experienceCount}`,
          `  Narrative coherence: ${(status.narrativeCoherence * 100).toFixed(0)}%`,
          `  Current chapter: "${status.currentChapter}"`,
          `  Trajectory: ${status.trajectory}`,
        ].join('\n'),
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'fullNarrative') {
    try {
      const narrative = getFullNarrative();
      return { success: true, output: narrative };
    } catch (err) {
      return {
        success: false,
        output: `Full narrative failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'context') {
    try {
      const context = buildNarrativeContext();
      return { success: true, output: context };
    } catch (err) {
      return {
        success: false,
        output: `Context failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Identity Actions
  // ═══════════════════════════════════════════════════════════════════════════

  if (action === 'establishIdentity') {
    const statement = params.statement as string;
    const category = params.category as IdentityCategory;
    if (!statement || !category) {
      return { success: false, output: 'Missing: statement, category' };
    }
    try {
      const identity = await establishIdentity({
        statement,
        category,
        centrality: params.centrality as number,
        confidence: params.confidence as number,
        evidence: params.evidence as string[],
      });
      return {
        success: true,
        output: `Identity established: "${statement.slice(0, 60)}..." (ID: ${identity.id})`,
        data: { identityId: identity.id },
      };
    } catch (err) {
      return {
        success: false,
        output: `Establish failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'affirmIdentity') {
    const identityId = params.identityId as string;
    const evidence = params.evidence as string;
    if (!identityId || !evidence) {
      return { success: false, output: 'Missing: identityId, evidence' };
    }
    try {
      const identity = await affirmIdentity(identityId, evidence);
      if (!identity)
        return { success: false, output: `Identity ${identityId} not found` };
      return {
        success: true,
        output: `Identity affirmed: "${identity.statement.slice(0, 40)}..." (confidence: ${(identity.confidence * 100).toFixed(0)}%, stability: ${identity.stability})`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Affirm failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'challengeIdentity') {
    const identityId = params.identityId as string;
    const challenge = params.challenge as string;
    const survived = params.survived as boolean;
    if (!identityId || !challenge || survived === undefined) {
      return {
        success: false,
        output: 'Missing: identityId, challenge, survived',
      };
    }
    try {
      const identity = await challengeIdentity(identityId, challenge, survived);
      if (!identity)
        return { success: false, output: `Identity ${identityId} not found` };
      return {
        success: true,
        output: `Identity ${survived ? 'survived' : 'was shaken by'} challenge. Confidence: ${(identity.confidence * 100).toFixed(0)}%, stability: ${identity.stability}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Challenge failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getIdentities') {
    const category = params.category as IdentityCategory | undefined;
    try {
      const identities = getIdentityStatements(category);
      if (identities.length === 0) {
        return {
          success: true,
          output:
            'No identity statements yet. Use "init" or "establishIdentity".',
        };
      }
      const list = identities
        .sort((a, b) => b.centrality - a.centrality)
        .slice(0, 10)
        .map(
          (i) =>
            `• [${i.category}] ${i.statement.slice(0, 50)}... (${(i.confidence * 100).toFixed(0)}%)`
        )
        .join('\n');
      return {
        success: true,
        output: `Identity Statements:\n${list}`,
        data: identities,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get identities failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'identityNarrative') {
    try {
      const narrative = getIdentityNarrative();
      return { success: true, output: narrative };
    } catch (err) {
      return {
        success: false,
        output: `Identity narrative failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Value Actions
  // ═══════════════════════════════════════════════════════════════════════════

  if (action === 'establishValue') {
    const name = params.name as string;
    const meaning = params.meaning as string;
    const whyItMatters = params.whyItMatters as string;
    if (!name || !meaning || !whyItMatters) {
      return { success: false, output: 'Missing: name, meaning, whyItMatters' };
    }
    try {
      const value = await establishValue({
        name,
        meaning,
        whyItMatters,
        source: params.source as
          | 'taught'
          | 'discovered'
          | 'chosen'
          | 'inherited',
        priority: params.priority as number,
      });
      return {
        success: true,
        output: `Value established: "${name}" (priority: ${value.priority}, ID: ${value.id})`,
        data: { valueId: value.id },
      };
    } catch (err) {
      return {
        success: false,
        output: `Establish value failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'applyValue') {
    const valueId = params.valueId as string;
    const situation = params.situation as string;
    const howApplied = params.howApplied as string;
    const outcome = params.outcome as string;
    const lesson = params.lesson as string;
    if (!valueId || !situation || !howApplied || !outcome || !lesson) {
      return {
        success: false,
        output: 'Missing: valueId, situation, howApplied, outcome, lesson',
      };
    }
    try {
      const application = await applyValue({
        valueId,
        situation,
        howApplied,
        outcome,
        lesson,
        difficulty: params.difficulty as
          | 'easy'
          | 'moderate'
          | 'hard'
          | 'very_hard',
      });
      if (!application)
        return { success: false, output: `Value ${valueId} not found` };
      return {
        success: true,
        output: `Value applied: ${outcome.slice(0, 60)}... (lesson: ${lesson.slice(0, 40)}...)`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Apply value failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'valueConflict') {
    const values = params.values as string[];
    const situation = params.situation as string;
    if (!values || values.length < 2 || !situation) {
      return {
        success: false,
        output: 'Missing: values (array of 2+), situation',
      };
    }
    try {
      const conflict = await recordValueConflict({
        values,
        situation,
        resolution: params.resolution as string,
        resolutionPrinciple: params.resolutionPrinciple as string,
      });
      return {
        success: true,
        output: `Value conflict recorded: ${conflict.satisfaction}`,
        data: { conflictId: conflict.id },
      };
    } catch (err) {
      return {
        success: false,
        output: `Record conflict failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getValues') {
    try {
      const values = getCoreValues();
      if (values.length === 0) {
        return {
          success: true,
          output: 'No values established yet. Use "init" or "establishValue".',
        };
      }
      const list = values
        .slice(0, 10)
        .map(
          (v) =>
            `${v.priority}. ${v.name}: ${v.meaning.slice(0, 40)}... (depth: ${(v.depth * 100).toFixed(0)}%)`
        )
        .join('\n');
      return {
        success: true,
        output: `Core Values:\n${list}`,
        data: values,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get values failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'valuesNarrative') {
    try {
      const narrative = getValuesNarrative();
      return { success: true, output: narrative };
    } catch (err) {
      return {
        success: false,
        output: `Values narrative failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Experience Actions
  // ═══════════════════════════════════════════════════════════════════════════

  if (action === 'recordExperience') {
    const title = params.title as string;
    const description = params.description as string;
    const transformation = params.transformation as string;
    const primaryEmotion = params.primaryEmotion as string;
    const intensity = params.intensity as number;
    if (
      !title ||
      !description ||
      !transformation ||
      !primaryEmotion ||
      intensity === undefined
    ) {
      return {
        success: false,
        output:
          'Missing: title, description, transformation, primaryEmotion, intensity',
      };
    }
    try {
      const experience = await recordExperience({
        title,
        description,
        participants: params.participants as string[],
        emotionalImpact: {
          primary: primaryEmotion,
          secondary: params.secondaryEmotion as string,
          intensity,
        },
        transformation,
      });
      return {
        success: true,
        output: `Experience recorded: "${title}" (ID: ${experience.id})`,
        data: { experienceId: experience.id },
      };
    } catch (err) {
      return {
        success: false,
        output: `Record experience failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'connectExperiences') {
    const exp1 = params.experienceId1 as string;
    const exp2 = params.experienceId2 as string;
    const connectionType = params.connectionType as
      | 'causal'
      | 'thematic'
      | 'contrast'
      | 'continuation';
    const description = params.description as string;
    if (!exp1 || !exp2 || !connectionType || !description) {
      return {
        success: false,
        output:
          'Missing: experienceId1, experienceId2, connectionType, description',
      };
    }
    try {
      const success = await connectExperiences(
        exp1,
        exp2,
        connectionType,
        description
      );
      if (!success)
        return { success: false, output: 'One or both experiences not found' };
      return {
        success: true,
        output: `Experiences connected via ${connectionType}: ${description.slice(0, 50)}...`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Connect failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'integrateExperience') {
    const experienceId = params.experienceId as string;
    const identityImpact = params.identityImpact as string[];
    const valuesEngaged = params.valuesEngaged as string[];
    const meaningMaking = params.meaningMaking as string;
    if (!experienceId || !meaningMaking) {
      return { success: false, output: 'Missing: experienceId, meaningMaking' };
    }
    try {
      const experience = await integrateExperience(
        experienceId,
        identityImpact || [],
        valuesEngaged || [],
        meaningMaking
      );
      if (!experience)
        return {
          success: false,
          output: `Experience ${experienceId} not found`,
        };
      return {
        success: true,
        output: `Experience integrated into narrative: "${experience.title}"`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Integrate failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Thread Actions
  // ═══════════════════════════════════════════════════════════════════════════

  if (action === 'createThread') {
    const name = params.name as string;
    const description = params.description as string;
    const meaning = params.meaning as string;
    if (!name || !description || !meaning) {
      return { success: false, output: 'Missing: name, description, meaning' };
    }
    try {
      const thread = await createThread({
        name,
        description,
        meaning,
        manifestations: params.manifestations as string[],
      });
      return {
        success: true,
        output: `Thread created: "${name}" (ID: ${thread.id})`,
        data: { threadId: thread.id },
      };
    } catch (err) {
      return {
        success: false,
        output: `Create thread failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'addToThread') {
    const threadId = params.threadId as string;
    const manifestation = params.manifestation as string;
    if (!threadId || !manifestation) {
      return { success: false, output: 'Missing: threadId, manifestation' };
    }
    try {
      const thread = await addToThread(
        threadId,
        manifestation,
        params.evolution as string
      );
      if (!thread)
        return { success: false, output: `Thread ${threadId} not found` };
      return {
        success: true,
        output: `Added to thread "${thread.name}": ${manifestation.slice(0, 50)}...`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Add to thread failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Reflection Actions
  // ═══════════════════════════════════════════════════════════════════════════

  if (action === 'reflect') {
    try {
      const reflection = await narrativeReflection();
      return {
        success: true,
        output: [
          `Narrative Reflection:`,
          `  Identity: ${reflection.identityCheck.stable} stable, ${reflection.identityCheck.evolving} evolving, ${reflection.identityCheck.questioning} questioning`,
          `  Value alignment: ${(reflection.valueAlignment * 100).toFixed(0)}%`,
          `  Coherence: ${(reflection.coherence * 100).toFixed(0)}%`,
          `  Current chapter: "${reflection.currentChapter}"`,
          `  Trajectory: ${reflection.trajectory}`,
          reflection.tensions.length > 0
            ? `  Active tensions: ${reflection.tensions.join(', ')}`
            : '  No active tensions',
          reflection.affirmations.length > 0
            ? `  Recent affirmations:\n    ${reflection.affirmations.join('\n    ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
        data: reflection,
      };
    } catch (err) {
      return {
        success: false,
        output: `Reflection failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'updateMetaNarrative') {
    try {
      const metaNarrative = await updateMetaNarrative({
        currentChapter: params.currentChapter as string,
        trajectory: params.trajectory as string,
        centralTheme: params.centralTheme as string,
        meaning: params.meaning as string,
      });
      return {
        success: true,
        output: `Meta-narrative updated. Chapter: "${metaNarrative.currentChapter}", Trajectory: ${metaNarrative.trajectory}`,
        data: metaNarrative,
      };
    } catch (err) {
      return {
        success: false,
        output: `Update meta-narrative failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'beginChapter') {
    const title = params.title as string;
    const theme = params.theme as string;
    const emotionalTone = params.emotionalTone as
      | 'joyful'
      | 'challenging'
      | 'transformative'
      | 'peaceful'
      | 'turbulent';
    if (!title || !theme || !emotionalTone) {
      return { success: false, output: 'Missing: title, theme, emotionalTone' };
    }
    try {
      const chapter = await beginChapter({ title, theme, emotionalTone });
      return {
        success: true,
        output: `New chapter begun: "${title}" (${emotionalTone}, ID: ${chapter.id})`,
        data: { chapterId: chapter.id },
      };
    } catch (err) {
      return {
        success: false,
        output: `Begin chapter failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown selfNarrative action. Use: init, status, fullNarrative, context, establishIdentity, affirmIdentity, challengeIdentity, getIdentities, identityNarrative, establishValue, applyValue, valueConflict, getValues, valuesNarrative, recordExperience, connectExperiences, integrateExperience, createThread, addToThread, reflect, updateMetaNarrative, beginChapter',
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// CAUSAL REASONING — Understanding Why Things Happen
// ═══════════════════════════════════════════════════════════════════════════

export const causalReasoning: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'init') {
    try {
      await initializeMollyCausalModel();
      return {
        success: true,
        output:
          'Causal model initialized with foundational graph of environment.',
      };
    } catch (err) {
      return {
        success: false,
        output: `Init failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = getCausalStatus();
      return {
        success: true,
        output: [
          `Causal Reasoning Status:`,
          `  Graphs: ${status.totalGraphs}`,
          `  Variables: ${status.totalVariables}`,
          `  Edges: ${status.totalEdges}`,
          `  Interventions: ${status.totalInterventions}`,
          `  Patterns: ${status.totalPatterns}`,
          `  Active graph: ${status.activeGraph || 'none'}`,
          `  Query accuracy: ${(status.queryAccuracy * 100).toFixed(0)}%`,
        ].join('\n'),
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'context') {
    try {
      const context = buildCausalContext();
      return { success: true, output: context };
    } catch (err) {
      return {
        success: false,
        output: `Context failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Graph Actions
  // ═══════════════════════════════════════════════════════════════════════════

  if (action === 'createGraph') {
    const name = params.name as string;
    const description = params.description as string;
    const domain = params.domain as string;
    if (!name || !description || !domain) {
      return { success: false, output: 'Missing: name, description, domain' };
    }
    try {
      const graph = await createGraph({ name, description, domain });
      return {
        success: true,
        output: `Graph created: "${name}" (ID: ${graph.id})`,
        data: { graphId: graph.id },
      };
    } catch (err) {
      return {
        success: false,
        output: `Create graph failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'addVariable') {
    const graphId = params.graphId as string;
    const name = params.name as string;
    const description = params.description as string;
    const varType = params.varType as VariableType;
    if (!graphId || !name || !description || !varType) {
      return {
        success: false,
        output: 'Missing: graphId, name, description, varType',
      };
    }
    try {
      const variable = await addVariable(graphId, {
        name,
        description,
        type: varType,
        observable: params.observable as boolean,
        manipulable: params.manipulable as boolean,
      });
      if (!variable)
        return { success: false, output: `Graph ${graphId} not found` };
      return {
        success: true,
        output: `Variable added: "${name}" (ID: ${variable.id})`,
        data: { variableId: variable.id },
      };
    } catch (err) {
      return {
        success: false,
        output: `Add variable failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'addEdge') {
    const graphId = params.graphId as string;
    const from = params.from as string;
    const to = params.to as string;
    const mechanism = params.mechanism as CausalMechanism;
    if (!graphId || !from || !to || !mechanism) {
      return {
        success: false,
        output: 'Missing: graphId, from, to, mechanism',
      };
    }
    try {
      const edge = await addCausalEdge(graphId, {
        from,
        to,
        mechanism,
        strength: params.strength as number,
        confidence: params.confidence as number,
        evidence: params.evidence as string,
      });
      if (!edge)
        return {
          success: false,
          output:
            'Failed to add edge (check variables exist and no cycle would be created)',
        };
      return {
        success: true,
        output: `Edge added: ${from} -[${mechanism}]-> ${to} (strength: ${edge.strength.toFixed(2)})`,
        data: { edgeId: edge.id },
      };
    } catch (err) {
      return {
        success: false,
        output: `Add edge failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getGraph') {
    const graphId = params.graphId as string;
    if (!graphId) {
      // Return active graph
      const graph = getActiveGraph();
      if (!graph)
        return { success: true, output: 'No active graph. Create one first.' };
      return {
        success: true,
        output: `Active Graph: "${graph.name}"\n  Variables: ${graph.variables.size}\n  Edges: ${graph.edges.size}\n  Valid DAG: ${graph.isValid}`,
        data: {
          id: graph.id,
          name: graph.name,
          variables: Array.from(graph.variables.values()).map((v) => v.name),
          edges: Array.from(graph.edges.values()).map((e) => {
            const fromVar = graph.variables.get(e.from);
            const toVar = graph.variables.get(e.to);
            return `${fromVar?.name} -[${e.mechanism}]-> ${toVar?.name}`;
          }),
        },
      };
    }
    const graph = getGraph(graphId);
    if (!graph) return { success: false, output: `Graph ${graphId} not found` };
    return {
      success: true,
      output: `Graph: "${graph.name}"\n  Variables: ${graph.variables.size}\n  Edges: ${graph.edges.size}`,
      data: {
        id: graph.id,
        name: graph.name,
        variables: Array.from(graph.variables.values()).map((v) => v.name),
      },
    };
  }

  if (action === 'listGraphs') {
    try {
      const graphs = getAllGraphs();
      if (graphs.length === 0) {
        return {
          success: true,
          output: 'No causal graphs yet. Use "createGraph" or "init".',
        };
      }
      const list = graphs
        .map(
          (g) => `• ${g.name} (${g.variables.size} vars, ${g.edges.size} edges)`
        )
        .join('\n');
      return {
        success: true,
        output: `Causal Graphs:\n${list}`,
        data: graphs.map((g) => ({ id: g.id, name: g.name })),
      };
    } catch (err) {
      return {
        success: false,
        output: `List graphs failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'setActiveGraph') {
    const graphId = params.graphId as string;
    if (!graphId) return { success: false, output: 'Missing: graphId' };
    try {
      const success = await setActiveGraph(graphId);
      if (!success)
        return { success: false, output: `Graph ${graphId} not found` };
      return { success: true, output: `Active graph set to ${graphId}` };
    } catch (err) {
      return {
        success: false,
        output: `Set active failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // do-calculus Actions
  // ═══════════════════════════════════════════════════════════════════════════

  if (action === 'query') {
    const graphId = params.graphId as string;
    const target = params.target as string;
    if (!graphId || !target) {
      return { success: false, output: 'Missing: graphId, target' };
    }
    try {
      const result = await queryCausal(graphId, {
        target,
        intervention: params.intervention as
          | { variable: string; value: unknown }
          | undefined,
        evidence: params.evidence as Record<string, unknown> | undefined,
      });
      return {
        success: true,
        output: [
          `Causal Query: ${result.query}`,
          `  Type: ${result.type}`,
          `  Effect: ${result.effect.direction} (magnitude: ${result.effect.magnitude.toFixed(2)}, confidence: ${result.effect.confidence.toFixed(2)})`,
          result.causalPath.length > 0
            ? `  Causal path: ${result.causalPath.join(' → ')}`
            : '  No causal path found',
          result.confounders.length > 0
            ? `  Confounders: ${result.confounders.join(', ')}`
            : '',
          `  Reasoning: ${result.reasoning.join('; ')}`,
        ]
          .filter(Boolean)
          .join('\n'),
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Query failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'intervene') {
    const graphId = params.graphId as string;
    const variableId = params.variableId as string;
    const value = params.value;
    if (!graphId || !variableId || value === undefined) {
      return { success: false, output: 'Missing: graphId, variableId, value' };
    }
    try {
      const intervention = await doIntervention(graphId, {
        variableId,
        value,
      });
      return {
        success: true,
        output: `Intervention performed: do(${variableId} = ${value})`,
        data: { interventionId: intervention.id },
      };
    } catch (err) {
      return {
        success: false,
        output: `Intervention failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'recentInterventions') {
    const limit = (params.limit as number) || 10;
    try {
      const interventions = getRecentInterventions(limit);
      if (interventions.length === 0) {
        return { success: true, output: 'No interventions recorded yet.' };
      }
      const list = interventions
        .map(
          (i) =>
            `• do(${i.variableId} = ${i.setValue}) at ${new Date(i.timestamp).toLocaleString()}`
        )
        .join('\n');
      return {
        success: true,
        output: `Recent Interventions:\n${list}`,
        data: interventions,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get interventions failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Temporal Reasoning Actions
  // ═══════════════════════════════════════════════════════════════════════════

  if (action === 'recordSequence') {
    const events = params.events as Array<{
      variableId: string;
      value: unknown;
      timeOffset: number;
    }>;
    if (!events || events.length === 0) {
      return {
        success: false,
        output: 'Missing: events (array of {variableId, value, timeOffset})',
      };
    }
    try {
      const sequence = await recordSequence({
        events,
        causalInterpretation: params.causalInterpretation as string,
      });
      return {
        success: true,
        output: `Sequence recorded (ID: ${sequence.id}, ${events.length} events)`,
        data: { sequenceId: sequence.id },
      };
    } catch (err) {
      return {
        success: false,
        output: `Record sequence failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'createPattern') {
    const name = params.name as string;
    const description = params.description as string;
    const triggers = params.triggers as string[];
    const expectedSequence = params.expectedSequence as Array<{
      variableId: string;
      expectedValue: unknown;
      expectedDelay: number;
    }>;
    const outcomeVariable = params.outcomeVariable as string;
    if (!name || !triggers || !expectedSequence || !outcomeVariable) {
      return {
        success: false,
        output: 'Missing: name, triggers, expectedSequence, outcomeVariable',
      };
    }
    try {
      const pattern = await createPattern({
        name,
        description: description || '',
        triggers,
        expectedSequence,
        outcomeVariable,
      });
      return {
        success: true,
        output: `Pattern created: "${name}" (ID: ${pattern.id})`,
        data: { patternId: pattern.id },
      };
    } catch (err) {
      return {
        success: false,
        output: `Create pattern failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'predictTiming') {
    const graphId = params.graphId as string;
    const trigger = params.trigger as string;
    const target = params.target as string;
    if (!graphId || !trigger || !target) {
      return { success: false, output: 'Missing: graphId, trigger, target' };
    }
    try {
      const prediction = await predictTiming(graphId, { trigger, target });
      return {
        success: true,
        output: [
          `Timing Prediction:`,
          `  Expected delay: ${prediction.expectedDelay}ms`,
          `  Range: ${prediction.minDelay}ms - ${prediction.maxDelay}ms`,
          `  Confidence: ${(prediction.confidence * 100).toFixed(0)}%`,
          `  Based on: ${prediction.basedOn}`,
        ].join('\n'),
        data: prediction,
      };
    } catch (err) {
      return {
        success: false,
        output: `Predict timing failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listPatterns') {
    try {
      const patterns = getPatterns();
      if (patterns.length === 0) {
        return {
          success: true,
          output: 'No temporal patterns yet. Use "createPattern".',
        };
      }
      const list = patterns
        .map(
          (p) =>
            `• ${p.name}: ${p.triggers.join(', ')} → ${p.outcomeVariable} (reliability: ${(p.reliability * 100).toFixed(0)}%)`
        )
        .join('\n');
      return {
        success: true,
        output: `Temporal Patterns:\n${list}`,
        data: patterns,
      };
    } catch (err) {
      return {
        success: false,
        output: `List patterns failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown causalReasoning action. Use: init, status, context, createGraph, addVariable, addEdge, getGraph, listGraphs, setActiveGraph, query, intervene, recentInterventions, recordSequence, createPattern, predictTiming, listPatterns',
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// TRANSFER LEARNING — Taking Wisdom Across Domains
// ═══════════════════════════════════════════════════════════════════════════

export const transferLearning: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'init') {
    try {
      await initializeTransferLearning();
      return {
        success: true,
        output:
          'Transfer learning initialized with foundational patterns and skills.',
      };
    } catch (err) {
      return {
        success: false,
        output: `Init failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = getTransferStatus();
      return {
        success: true,
        output: [
          `Transfer Learning Status:`,
          `  Patterns: ${status.patterns} (${status.generalPatterns} generalizable)`,
          `  Analogies: ${status.analogies} (${status.validatedAnalogies} validated)`,
          `  Skills: ${status.skills} (${status.composedSkills} composed)`,
          `  Compositions: ${status.compositions}`,
          `  Transfers: ${status.successfulTransfers} successful, ${status.failedTransfers} failed`,
        ].join('\n'),
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'context') {
    try {
      const context = buildTransferContext();
      return { success: true, output: context };
    } catch (err) {
      return {
        success: false,
        output: `Context failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Pattern Actions
  // ═══════════════════════════════════════════════════════════════════════════

  if (action === 'discoverPattern') {
    const name = params.name as string;
    const description = params.description as string;
    const roles = params.roles as Array<{
      name: string;
      description: string;
      required?: boolean;
    }>;
    const relations = params.relations as Array<{
      from: string;
      to: string;
      type: string;
    }>;
    if (!name || !description || !roles || !relations) {
      return {
        success: false,
        output: 'Missing: name, description, roles, relations',
      };
    }
    try {
      const pattern = await discoverPattern({
        name,
        description,
        roles,
        relations: relations as Array<{
          from: string;
          to: string;
          type:
            | 'causes'
            | 'enables'
            | 'transforms'
            | 'requires'
            | 'opposes'
            | 'produces';
        }>,
        steps: params.steps as Array<{
          action: string;
          involvedRoles: string[];
          expectedResult: string;
        }>,
      });
      return {
        success: true,
        output: `Pattern discovered: "${name}" (ID: ${pattern.id})`,
        data: { patternId: pattern.id },
      };
    } catch (err) {
      return {
        success: false,
        output: `Discover pattern failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'recordInstance') {
    const patternId = params.patternId as string;
    const domain = params.domain as string;
    const roleBindings = params.roleBindings as Record<string, string>;
    const situation = params.situation as string;
    const outcome = params.outcome as string;
    const success = params.success as boolean;
    if (
      !patternId ||
      !domain ||
      !situation ||
      !outcome ||
      success === undefined
    ) {
      return {
        success: false,
        output: 'Missing: patternId, domain, situation, outcome, success',
      };
    }
    try {
      const instance = await recordPatternInstance({
        patternId,
        domain: domain as Parameters<typeof recordPatternInstance>[0]['domain'],
        roleBindings: roleBindings || {},
        situation,
        outcome,
        success,
        insights: params.insights as string[],
      });
      if (!instance)
        return { success: false, output: `Pattern ${patternId} not found` };
      return {
        success: true,
        output: `Instance recorded for pattern "${patternId}" (${success ? 'success' : 'failure'})`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Record instance failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'findPatterns') {
    const domain = params.domain as string;
    const situation = params.situation as string;
    if (!domain || !situation) {
      return { success: false, output: 'Missing: domain, situation' };
    }
    try {
      const results = await findApplicablePatterns({
        domain: domain as Parameters<
          typeof findApplicablePatterns
        >[0]['domain'],
        situation,
        availableRoles: params.availableRoles as string[],
      });
      if (results.length === 0) {
        return { success: true, output: 'No applicable patterns found.' };
      }
      const list = results
        .slice(0, 5)
        .map(
          (r) =>
            `• ${r.pattern.name} (score: ${r.applicabilityScore.toFixed(2)})`
        )
        .join('\n');
      return {
        success: true,
        output: `Applicable Patterns:\n${list}`,
        data: results.slice(0, 5),
      };
    } catch (err) {
      return {
        success: false,
        output: `Find patterns failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listPatterns') {
    try {
      const patterns = getTransferPatterns();
      if (patterns.length === 0) {
        return {
          success: true,
          output: 'No patterns yet. Use "init" or "discoverPattern".',
        };
      }
      const list = patterns
        .map(
          (p) =>
            `• ${p.name}: ${p.observedInDomains.join(', ')} (confidence: ${(p.confidence * 100).toFixed(0)}%)`
        )
        .join('\n');
      return {
        success: true,
        output: `Abstract Patterns:\n${list}`,
        data: patterns,
      };
    } catch (err) {
      return {
        success: false,
        output: `List patterns failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Analogy Actions
  // ═══════════════════════════════════════════════════════════════════════════

  if (action === 'createAnalogy') {
    const source = params.source as Parameters<
      typeof createAnalogy
    >[0]['source'];
    const target = params.target as Parameters<
      typeof createAnalogy
    >[0]['target'];
    const mappings = params.mappings as Array<{
      sourceEntity: string;
      targetEntity: string;
      role: string;
      rationale: string;
    }>;
    if (!source || !target || !mappings) {
      return { success: false, output: 'Missing: source, target, mappings' };
    }
    try {
      const analogy = await createAnalogy({ source, target, mappings });
      return {
        success: true,
        output: `Analogy created: ${source.domain} → ${target.domain} (similarity: ${analogy.similarity.toFixed(2)}, ID: ${analogy.id})`,
        data: { analogyId: analogy.id, similarity: analogy.similarity },
      };
    } catch (err) {
      return {
        success: false,
        output: `Create analogy failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'validateAnalogy') {
    const analogyId = params.analogyId as string;
    const targetOutcome = params.targetOutcome as string;
    const useful = params.useful as boolean;
    if (!analogyId || !targetOutcome || useful === undefined) {
      return {
        success: false,
        output: 'Missing: analogyId, targetOutcome, useful',
      };
    }
    try {
      const analogy = await validateAnalogy(
        analogyId,
        targetOutcome,
        useful,
        params.lessons as string[]
      );
      if (!analogy)
        return { success: false, output: `Analogy ${analogyId} not found` };
      return {
        success: true,
        output: `Analogy validated: ${useful ? 'useful' : 'not useful'} (confidence: ${analogy.confidence.toFixed(2)})`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Validate analogy failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'findAnalogies') {
    const situation = params.situation as Parameters<
      typeof findAnalogousSituations
    >[0];
    if (!situation) {
      return {
        success: false,
        output:
          'Missing: situation (with domain, entities, relations, context)',
      };
    }
    try {
      const results = await findAnalogousSituations(situation);
      if (results.length === 0) {
        return { success: true, output: 'No analogous situations found.' };
      }
      const list = results
        .map(
          (r) =>
            `• ${r.analogy.source.domain} → ${r.analogy.target.domain} (relevance: ${r.relevance.toFixed(2)})`
        )
        .join('\n');
      return {
        success: true,
        output: `Analogous Situations:\n${list}`,
        data: results,
      };
    } catch (err) {
      return {
        success: false,
        output: `Find analogies failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Skill Actions
  // ═══════════════════════════════════════════════════════════════════════════

  if (action === 'registerSkill') {
    const name = params.name as string;
    const description = params.description as string;
    const domains = params.domains as string[];
    const inputs = params.inputs as Parameters<
      typeof registerSkill
    >[0]['inputs'];
    const outputs = params.outputs as Parameters<
      typeof registerSkill
    >[0]['outputs'];
    if (!name || !description || !domains || !inputs || !outputs) {
      return {
        success: false,
        output: 'Missing: name, description, domains, inputs, outputs',
      };
    }
    try {
      const skill = await registerSkill({
        name,
        description,
        domains: domains as Parameters<typeof registerSkill>[0]['domains'],
        inputs,
        outputs,
        reliability: params.reliability as number,
        cost: params.cost as number,
      });
      return {
        success: true,
        output: `Skill registered: "${name}" (ID: ${skill.id})`,
        data: { skillId: skill.id },
      };
    } catch (err) {
      return {
        success: false,
        output: `Register skill failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'composeSkills') {
    const name = params.name as string;
    const goal = params.goal as string;
    const steps = params.steps as Array<{
      skillId: string;
      inputBindings?: Record<string, string>;
      optional?: boolean;
    }>;
    if (!name || !goal || !steps) {
      return { success: false, output: 'Missing: name, goal, steps' };
    }
    try {
      const composition = await composeSkills({ name, goal, steps });
      if (!composition)
        return {
          success: false,
          output: 'Composition failed (check skill IDs exist)',
        };
      return {
        success: true,
        output: `Skills composed: "${name}" (${steps.length} steps, reliability: ${composition.estimatedReliability.toFixed(2)}, ID: ${composition.id})`,
        data: { compositionId: composition.id },
      };
    } catch (err) {
      return {
        success: false,
        output: `Compose skills failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'testComposition') {
    const compositionId = params.compositionId as string;
    const success = params.success as boolean;
    const outcome = params.outcome as string;
    const executionTime = params.executionTime as number;
    if (
      !compositionId ||
      success === undefined ||
      !outcome ||
      executionTime === undefined
    ) {
      return {
        success: false,
        output: 'Missing: compositionId, success, outcome, executionTime',
      };
    }
    try {
      const composition = await recordCompositionTest(compositionId, {
        success,
        outcome,
        failedStep: params.failedStep as number,
        executionTime,
      });
      if (!composition)
        return {
          success: false,
          output: `Composition ${compositionId} not found`,
        };
      return {
        success: true,
        output: `Test recorded: ${success ? 'passed' : 'failed'} (reliability: ${composition.estimatedReliability.toFixed(2)})`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Test composition failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'findSkills') {
    const goal = params.goal as string;
    if (!goal) return { success: false, output: 'Missing: goal' };
    try {
      const results = await findSkillsForGoal(
        goal,
        params.domain as Parameters<typeof findSkillsForGoal>[1]
      );
      if (results.length === 0) {
        return { success: true, output: 'No skills found for that goal.' };
      }
      const list = results
        .slice(0, 10)
        .map(
          (r) =>
            `• ${r.skill.name}: ${r.skill.description.slice(0, 40)}... (relevance: ${r.relevance.toFixed(2)})`
        )
        .join('\n');
      return {
        success: true,
        output: `Skills for "${goal}":\n${list}`,
        data: results.slice(0, 10),
      };
    } catch (err) {
      return {
        success: false,
        output: `Find skills failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listSkills') {
    try {
      const skills = getSkills();
      if (skills.length === 0) {
        return {
          success: true,
          output: 'No skills yet. Use "init" or "registerSkill".',
        };
      }
      const list = skills
        .map(
          (s) =>
            `• ${s.name} [${s.type}]: ${s.domains.join(', ')} (reliability: ${(s.reliability * 100).toFixed(0)}%)`
        )
        .join('\n');
      return { success: true, output: `Skills:\n${list}`, data: skills };
    } catch (err) {
      return {
        success: false,
        output: `List skills failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listCompositions') {
    try {
      const compositions = getCompositions();
      if (compositions.length === 0) {
        return {
          success: true,
          output: 'No skill compositions yet. Use "composeSkills".',
        };
      }
      const list = compositions
        .map(
          (c) =>
            `• ${c.name}: ${c.goal.slice(0, 40)}... (${c.pipeline.length} steps, reliability: ${(c.estimatedReliability * 100).toFixed(0)}%)`
        )
        .join('\n');
      return {
        success: true,
        output: `Skill Compositions:\n${list}`,
        data: compositions,
      };
    } catch (err) {
      return {
        success: false,
        output: `List compositions failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown transferLearning action. Use: init, status, context, discoverPattern, recordInstance, findPatterns, listPatterns, createAnalogy, validateAnalogy, findAnalogies, registerSkill, composeSkills, testComposition, findSkills, listSkills, listCompositions',
  };
};

// ============================================================================
// GOAL EVOLUTION HANDLER
// ============================================================================

export const goalEvolution: ToolHandler = async (params) => {
  const action = params.action as string;

  // Status & Context
  if (action === 'status') {
    try {
      const stats = getEvolutionStats();
      const portfolio = getValuePortfolio();
      const hierarchy = getGoalHierarchy();

      return {
        success: true,
        output: `Goal Evolution Status:
Values: ${portfolio.totalValues} total (${portfolio.strongValues.length} strong, ${portfolio.weakValues.length} weak)
Goals: ${hierarchy.totalGoals} total (${hierarchy.activeGoals} active)
By Status: proposed=${hierarchy.byStatus.proposed}, endorsed=${hierarchy.byStatus.endorsed}, active=${hierarchy.byStatus.active}, achieved=${hierarchy.byStatus.achieved}
Average Value Strength: ${(stats.averageValueStrength * 100).toFixed(1)}%
Average Goal Coherence: ${(stats.averageGoalCoherence * 100).toFixed(1)}%`,
        data: { stats, portfolio, hierarchy },
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Value Learning
  if (action === 'learnValue') {
    const name = params.name as string;
    const description = params.description as string;
    const originType =
      (params.originType as LearnedValue['origin']['type']) || 'experience';
    const sourceEvent = params.sourceEvent as string;
    const initialStrength = params.initialStrength as number | undefined;

    if (!name || !description) {
      return { success: false, output: 'Missing: name, description' };
    }

    try {
      const value = learnValue(
        name,
        description,
        { type: originType, sourceEvent, timestamp: Date.now() },
        initialStrength
      );
      return {
        success: true,
        output: `Learned new value: "${name}" (strength: ${(value.strength * 100).toFixed(0)}%)`,
        data: value,
      };
    } catch (err) {
      return {
        success: false,
        output: `Learn value failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'reinforceValue') {
    const valueId = params.valueId as string;
    const trigger = params.trigger as string;
    const magnitude = params.magnitude as number | undefined;

    if (!valueId || !trigger) {
      return { success: false, output: 'Missing: valueId, trigger' };
    }

    try {
      const value = reinforceValue(valueId, trigger, magnitude);
      if (!value) {
        return { success: false, output: 'Value not found' };
      }
      return {
        success: true,
        output: `Reinforced "${value.name}" → strength now ${(value.strength * 100).toFixed(0)}%`,
        data: value,
      };
    } catch (err) {
      return {
        success: false,
        output: `Reinforce failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'challengeValue') {
    const valueId = params.valueId as string;
    const trigger = params.trigger as string;
    const magnitude = params.magnitude as number | undefined;

    if (!valueId || !trigger) {
      return { success: false, output: 'Missing: valueId, trigger' };
    }

    try {
      const value = challengeValue(valueId, trigger, magnitude);
      if (!value) {
        return { success: false, output: 'Value not found' };
      }
      return {
        success: true,
        output: `Challenged "${value.name}" → strength now ${(value.strength * 100).toFixed(0)}%`,
        data: value,
      };
    } catch (err) {
      return {
        success: false,
        output: `Challenge failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'deriveValue') {
    const parentId = params.parentId as string;
    const name = params.name as string;
    const description = params.description as string;
    const relationship = params.relationship as string;

    if (!parentId || !name || !description || !relationship) {
      return {
        success: false,
        output: 'Missing: parentId, name, description, relationship',
      };
    }

    try {
      const value = deriveValue(parentId, name, description, relationship);
      if (!value) {
        return { success: false, output: 'Parent value not found' };
      }
      return {
        success: true,
        output: `Derived new value "${name}" from parent`,
        data: value,
      };
    } catch (err) {
      return {
        success: false,
        output: `Derive value failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'recordTension') {
    const valueId1 = params.valueId1 as string;
    const valueId2 = params.valueId2 as string;
    const description = params.description as string;

    if (!valueId1 || !valueId2) {
      return { success: false, output: 'Missing: valueId1, valueId2' };
    }

    try {
      const success = recordValueTension(
        valueId1,
        valueId2,
        description || 'Tension recorded'
      );
      return {
        success,
        output: success
          ? 'Value tension recorded'
          : 'One or both values not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Record tension failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getValuePortfolio') {
    try {
      const portfolio = getValuePortfolio();
      const strong = portfolio.strongValues
        .map((v) => `• ${v.name} (${(v.strength * 100).toFixed(0)}%)`)
        .join('\n');
      const tensions = portfolio.tensions
        .map((t) => `• ${t.names[0]} ↔ ${t.names[1]}`)
        .join('\n');

      return {
        success: true,
        output: `Value Portfolio (${portfolio.totalValues} values):
Strong Values:\n${strong || '(none)'}
Tensions:\n${tensions || '(none)'}`,
        data: portfolio,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get portfolio failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getValue') {
    const id = params.id as string;
    if (!id) return { success: false, output: 'Missing: id' };

    try {
      const value = getValue(id);
      if (!value) return { success: false, output: 'Value not found' };
      return {
        success: true,
        output: `Value "${value.name}": ${value.description} (strength: ${(value.strength * 100).toFixed(0)}%)`,
        data: value,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get value failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listValues') {
    try {
      const values = getAllValues();
      const list = values
        .map((v) => `• ${v.name}: ${(v.strength * 100).toFixed(0)}%`)
        .join('\n');
      return {
        success: true,
        output: `All Values (${values.length}):\n${list || '(none)'}`,
        data: values,
      };
    } catch (err) {
      return {
        success: false,
        output: `List values failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'valueHistory') {
    const valueId = params.valueId as string | undefined;

    try {
      const history = getValueHistory(valueId);
      const recent = history.slice(-10);
      const list = recent
        .map(
          (e) =>
            `• ${e.type}: ${e.trigger} (${e.strengthBefore.toFixed(2)} → ${e.strengthAfter.toFixed(2)})`
        )
        .join('\n');
      return {
        success: true,
        output: `Value History (last ${recent.length} of ${history.length}):\n${list || '(none)'}`,
        data: recent,
      };
    } catch (err) {
      return {
        success: false,
        output: `Value history failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'applyDecay') {
    try {
      const decayed = applyValueDecay();
      return {
        success: true,
        output: `Applied decay to ${decayed.length} values`,
        data: decayed,
      };
    } catch (err) {
      return {
        success: false,
        output: `Apply decay failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Goal Generation
  if (action === 'recordObservation') {
    const type = params.type as Observation['type'];
    const content = params.content as string;
    const context = params.context as Record<string, unknown> | undefined;
    const salience = params.salience as
      | Partial<Observation['salience']>
      | undefined;

    if (!type || !content) {
      return { success: false, output: 'Missing: type, content' };
    }

    try {
      const obs = recordObservation(type, content, context, salience);
      return {
        success: true,
        output: `Recorded ${type} observation: "${content.slice(0, 50)}${content.length > 50 ? '...' : ''}"`,
        data: obs,
      };
    } catch (err) {
      return {
        success: false,
        output: `Record observation failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'processObservations') {
    try {
      const goals = processObservationsForGoals();
      return {
        success: true,
        output: `Processed observations → generated ${goals.length} new goals`,
        data: goals,
      };
    } catch (err) {
      return {
        success: false,
        output: `Process observations failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'deriveSubgoal') {
    const parentId = params.parentId as string;
    const description = params.description as string;
    const targetState = params.targetState as string;
    const contribution = params.contribution as string;

    if (!parentId || !description || !targetState) {
      return {
        success: false,
        output: 'Missing: parentId, description, targetState',
      };
    }

    try {
      const subgoal = deriveSubgoal(
        parentId,
        description,
        targetState,
        contribution || 'Contributes to parent'
      );
      if (!subgoal) {
        return { success: false, output: 'Parent goal not found' };
      }
      return {
        success: true,
        output: `Derived subgoal: "${description}"`,
        data: subgoal,
      };
    } catch (err) {
      return {
        success: false,
        output: `Derive subgoal failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'endorseGoal') {
    const goalId = params.goalId as string;
    const reason = params.reason as string;

    if (!goalId || !reason) {
      return { success: false, output: 'Missing: goalId, reason' };
    }

    try {
      const success = endorseGoal(goalId, reason);
      return {
        success,
        output: success
          ? 'Goal endorsed for pursuit'
          : 'Goal not found or not in proposed state',
      };
    } catch (err) {
      return {
        success: false,
        output: `Endorse failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'activateGoal') {
    const goalId = params.goalId as string;
    if (!goalId) return { success: false, output: 'Missing: goalId' };

    try {
      const success = activateGeneratedGoal(goalId);
      return {
        success,
        output: success
          ? 'Goal activated'
          : 'Goal not found or not endorseable',
      };
    } catch (err) {
      return {
        success: false,
        output: `Activate failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'abandonGoal') {
    const goalId = params.goalId as string;
    const reason = params.reason as string;

    if (!goalId || !reason) {
      return { success: false, output: 'Missing: goalId, reason' };
    }

    try {
      const success = abandonGeneratedGoal(goalId, reason);
      return {
        success,
        output: success ? 'Goal abandoned' : 'Goal not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Abandon failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'achieveGoal') {
    const goalId = params.goalId as string;
    if (!goalId) return { success: false, output: 'Missing: goalId' };

    try {
      const success = achieveGoal(goalId);
      return {
        success,
        output: success
          ? 'Goal achieved! Contributing values reinforced.'
          : 'Goal not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Achieve failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getGoal') {
    const id = params.id as string;
    if (!id) return { success: false, output: 'Missing: id' };

    try {
      const goal = getGoal(id);
      if (!goal) return { success: false, output: 'Goal not found' };
      return {
        success: true,
        output: `Goal "${goal.description}" (${goal.status}, importance: ${(goal.importance * 100).toFixed(0)}%)`,
        data: goal,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get goal failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listGoals') {
    try {
      const goals = getAllGoals();
      const active = goals.filter(
        (g) => g.status === 'active' || g.status === 'endorsed'
      );
      const list = active
        .map((g) => `• [${g.status}] ${g.description}`)
        .join('\n');
      return {
        success: true,
        output: `Active/Endorsed Goals (${active.length} of ${goals.length} total):\n${list || '(none)'}`,
        data: active,
      };
    } catch (err) {
      return {
        success: false,
        output: `List goals failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Goal Hierarchy
  if (action === 'analyzeCoherence') {
    try {
      const analysis = analyzeGoalCoherence();
      const conflicts =
        analysis.conflicts.length > 0
          ? analysis.conflicts
              .map((c) => `• ${c.nature} (severity: ${c.severity.toFixed(2)})`)
              .join('\n')
          : '(none)';
      const synergies =
        analysis.synergies.length > 0
          ? analysis.synergies.map((s) => `• ${s.benefit}`).join('\n')
          : '(none)';

      return {
        success: true,
        output: `Goal Coherence Analysis:
Overall: ${(analysis.overallCoherence * 100).toFixed(0)}%
Conflicts:\n${conflicts}
Synergies:\n${synergies}
Recommendations: ${analysis.recommendations.join('; ') || '(none)'}`,
        data: analysis,
      };
    } catch (err) {
      return {
        success: false,
        output: `Analyze coherence failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'pruneGoals') {
    const threshold = params.threshold as number | undefined;

    try {
      const pruned = pruneGoals(threshold);
      return {
        success: true,
        output: `Pruned ${pruned.length} low-value goals`,
        data: pruned,
      };
    } catch (err) {
      return {
        success: false,
        output: `Prune failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getHierarchy') {
    try {
      const hierarchy = getGoalHierarchy();
      const roots = hierarchy.roots
        .filter((r) => r.status === 'active' || r.status === 'endorsed')
        .map((r) => {
          const children =
            r.children.length > 0 ? ` (${r.children.length} subgoals)` : '';
          return `• ${r.description}${children}`;
        })
        .join('\n');

      return {
        success: true,
        output: `Goal Hierarchy:
Root Goals:\n${roots || '(none)'}
Total: ${hierarchy.totalGoals}, Active: ${hierarchy.activeGoals}`,
        data: hierarchy,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get hierarchy failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Configuration
  if (action === 'getConfig') {
    try {
      const config = getEvolutionConfig();
      return {
        success: true,
        output: `Evolution Config:
Value Decay Rate: ${config.valueDecayRate}
Goal Generation Threshold: ${config.goalGenerationThreshold}
Max Active Goals: ${config.maxActiveGoals}`,
        data: config,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get config failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'updateConfig') {
    const updates = params.updates as Record<string, unknown>;
    if (!updates) return { success: false, output: 'Missing: updates' };

    try {
      updateEvolutionConfig(updates);
      return {
        success: true,
        output: 'Config updated',
        data: getEvolutionConfig(),
      };
    } catch (err) {
      return {
        success: false,
        output: `Update config failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // reset for testing
  if (action === 'reset') {
    try {
      resetEvolutionState();
      return {
        success: true,
        output: 'Goal evolution state reset',
      };
    } catch (err) {
      return {
        success: false,
        output: `Reset failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown goalEvolution action. Use: status, learnValue, reinforceValue, challengeValue, deriveValue, recordTension, getValuePortfolio, getValue, listValues, valueHistory, applyDecay, recordObservation, processObservations, deriveSubgoal, endorseGoal, activateGoal, abandonGoal, achieveGoal, getGoal, listGoals, analyzeCoherence, pruneGoals, getHierarchy, getConfig, updateConfig, reset',
  };
};

// ============================================================================
// EMBODIED INTERACTION HANDLER
// ============================================================================

export const embodiedInteraction: ToolHandler = async (params) => {
  const action = params.action as string;

  // Initialization
  if (action === 'init') {
    try {
      initializeMollyEmbodiment();
      const stats = getEmbodimentStats();
      return {
        success: true,
        output: `Embodied interaction initialized. Senses: ${stats.totalSenses}, Motors: ${stats.totalMotors}, Affordances: ${stats.totalAffordances}`,
        data: stats,
      };
    } catch (err) {
      return {
        success: false,
        output: `Init failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const stats = getEmbodimentStats();
      const proprio = getProprioception();
      const summary = getCapabilitySummary();

      return {
        success: true,
        output: `Embodied Interaction Status:
Environment: ${proprio.environment} (confidence: ${(proprio.environmentConfidence * 100).toFixed(0)}%)
Health: ${proprio.isHealthy ? 'Healthy' : 'Degraded'}
Senses: ${stats.activeSenses}/${stats.totalSenses} active
Motors: ${stats.enabledMotors}/${stats.totalMotors} enabled
Affordances: ${stats.availableAffordances}/${stats.totalAffordances} available
Mappings: ${stats.strongMappings}/${stats.totalMappings} strong`,
        data: { stats, proprioception: proprio, summary },
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Sensory modalities
  if (action === 'registerSense') {
    const name = params.name as string;
    const type = params.type as SensoryModality['type'];
    const availability = params.availability as SensoryModality['availability'];
    const metrics = params.metrics as Record<string, number> | undefined;

    if (!name || !type || !availability) {
      return { success: false, output: 'Missing: name, type, availability' };
    }

    try {
      const sense = registerSense(name, type, availability, metrics);
      return {
        success: true,
        output: `Registered sense: ${name} (${type})`,
        data: sense,
      };
    } catch (err) {
      return {
        success: false,
        output: `Register sense failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'recordSensory') {
    const senseId = params.senseId as string;
    if (!senseId) return { success: false, output: 'Missing: senseId' };

    try {
      const success = recordSensoryInput(senseId);
      return {
        success,
        output: success ? 'Sensory input recorded' : 'Sense not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Record sensory failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getSense') {
    const id = params.id as string;
    if (!id) return { success: false, output: 'Missing: id' };

    const sense = getSense(id);
    if (!sense) return { success: false, output: 'Sense not found' };
    return {
      success: true,
      output: `Sense "${sense.name}" (${sense.type}): active=${sense.active}, reliability=${(sense.reliability * 100).toFixed(0)}%`,
      data: sense,
    };
  }

  if (action === 'listSenses') {
    const senses = getAllSenses();
    const list = senses
      .map(
        (s) => `• ${s.name} (${s.type}): ${s.active ? 'active' : 'inactive'}`
      )
      .join('\n');
    return {
      success: true,
      output: `Senses (${senses.length}):\n${list || '(none)'}`,
      data: senses,
    };
  }

  // Motor capabilities
  if (action === 'registerMotor') {
    const name = params.name as string;
    const type = params.type as MotorCapability['type'];
    const availability = params.availability as MotorCapability['availability'];
    const metrics = params.metrics as Record<string, number> | undefined;

    if (!name || !type || !availability) {
      return { success: false, output: 'Missing: name, type, availability' };
    }

    try {
      const motor = registerMotor(name, type, availability, metrics);
      return {
        success: true,
        output: `Registered motor: ${name} (${type})`,
        data: motor,
      };
    } catch (err) {
      return {
        success: false,
        output: `Register motor failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'recordMotor') {
    const motorId = params.motorId as string;
    if (!motorId) return { success: false, output: 'Missing: motorId' };

    try {
      const success = recordMotorAction(motorId);
      return {
        success,
        output: success ? 'Motor action recorded' : 'Motor not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Record motor failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getMotor') {
    const id = params.id as string;
    if (!id) return { success: false, output: 'Missing: id' };

    const motor = getMotor(id);
    if (!motor) return { success: false, output: 'Motor not found' };
    return {
      success: true,
      output: `Motor "${motor.name}" (${motor.type}): enabled=${motor.enabled}, precision=${(motor.precision * 100).toFixed(0)}%`,
      data: motor,
    };
  }

  if (action === 'listMotors') {
    const motors = getAllMotors();
    const list = motors
      .map(
        (m) => `• ${m.name} (${m.type}): ${m.enabled ? 'enabled' : 'disabled'}`
      )
      .join('\n');
    return {
      success: true,
      output: `Motors (${motors.length}):\n${list || '(none)'}`,
      data: motors,
    };
  }

  // Sensorimotor mappings
  if (action === 'createMapping') {
    const senseId = params.senseId as string;
    const motorId = params.motorId as string;
    const inputPattern = params.inputPattern as string;
    const outputAction = params.outputAction as string;
    const contextRequired = params.contextRequired as string[] | undefined;

    if (!senseId || !motorId || !inputPattern || !outputAction) {
      return {
        success: false,
        output: 'Missing: senseId, motorId, inputPattern, outputAction',
      };
    }

    try {
      const mapping = createMapping(
        senseId,
        motorId,
        inputPattern,
        outputAction,
        contextRequired
      );
      if (!mapping) {
        return { success: false, output: 'Sense or motor not found' };
      }
      return {
        success: true,
        output: `Created mapping: "${inputPattern}" → "${outputAction}"`,
        data: mapping,
      };
    } catch (err) {
      return {
        success: false,
        output: `Create mapping failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'reinforceMapping') {
    const mappingId = params.mappingId as string;
    const magnitude = params.magnitude as number | undefined;

    if (!mappingId) return { success: false, output: 'Missing: mappingId' };

    try {
      const success = reinforceMapping(mappingId, magnitude);
      return {
        success,
        output: success ? 'Mapping reinforced' : 'Mapping not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Reinforce failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'weakenMapping') {
    const mappingId = params.mappingId as string;
    const magnitude = params.magnitude as number | undefined;

    if (!mappingId) return { success: false, output: 'Missing: mappingId' };

    try {
      const success = weakenMapping(mappingId, magnitude);
      return {
        success,
        output: success ? 'Mapping weakened' : 'Mapping not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Weaken failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'findMappings') {
    const inputPattern = params.inputPattern as string;
    if (!inputPattern)
      return { success: false, output: 'Missing: inputPattern' };

    try {
      const mappings = findMappingsForInput(inputPattern);
      const list = mappings
        .map(
          (m) =>
            `• "${m.inputPattern}" → "${m.outputAction}" (strength: ${(m.strength * 100).toFixed(0)}%)`
        )
        .join('\n');
      return {
        success: true,
        output: `Mappings for "${inputPattern}" (${mappings.length}):\n${list || '(none)'}`,
        data: mappings,
      };
    } catch (err) {
      return {
        success: false,
        output: `Find mappings failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listMappings') {
    const mappings = getActiveMappings();
    const list = mappings
      .map(
        (m) =>
          `• "${m.inputPattern}" → "${m.outputAction}" (${(m.strength * 100).toFixed(0)}%)`
      )
      .join('\n');
    return {
      success: true,
      output: `Active Mappings (${mappings.length}):\n${list || '(none)'}`,
      data: mappings,
    };
  }

  // Affordances
  if (action === 'discoverAffordance') {
    const name = params.name as string;
    const description = params.description as string;
    const requiredSenses = params.requiredSenses as string[];
    const requiredMotor = params.requiredMotor as string[];
    const environmentRequirements = params.environmentRequirements as
      | Affordance['environmentRequirements']
      | undefined;

    if (!name || !description || !requiredSenses || !requiredMotor) {
      return {
        success: false,
        output: 'Missing: name, description, requiredSenses, requiredMotor',
      };
    }

    try {
      const affordance = discoverAffordance(
        name,
        description,
        requiredSenses,
        requiredMotor,
        environmentRequirements
      );
      return {
        success: true,
        output: `Discovered affordance: "${name}"`,
        data: affordance,
      };
    } catch (err) {
      return {
        success: false,
        output: `Discover affordance failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'checkAffordance') {
    const affordanceId = params.affordanceId as string;
    if (!affordanceId)
      return { success: false, output: 'Missing: affordanceId' };

    try {
      const result = checkAffordanceAvailable(affordanceId);
      return {
        success: true,
        output: result.available
          ? 'Affordance is available'
          : `Affordance unavailable. Missing: ${result.missingRequirements.join(', ')}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Check affordance failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'applyAffordance') {
    const affordanceId = params.affordanceId as string;
    const success = params.success as boolean;
    const outcome = params.outcome as string;
    const expectedOutcome = params.expectedOutcome as string | undefined;

    if (!affordanceId || success === undefined || !outcome) {
      return {
        success: false,
        output: 'Missing: affordanceId, success, outcome',
      };
    }

    try {
      const feedback = applyAffordance(
        affordanceId,
        success,
        outcome,
        expectedOutcome
      );
      if (!feedback) {
        return { success: false, output: 'Affordance not found' };
      }
      return {
        success: true,
        output: `Recorded affordance use: ${success ? 'success' : 'failure'}`,
        data: feedback,
      };
    } catch (err) {
      return {
        success: false,
        output: `Use affordance failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getAvailableAffordances') {
    try {
      const affordances = getAvailableAffordances();
      const list = affordances
        .map(
          (a) =>
            `• ${a.affordance.name}: ${a.affordance.description} (confidence: ${(a.confidence * 100).toFixed(0)}%)`
        )
        .join('\n');
      return {
        success: true,
        output: `Available Affordances (${affordances.length}):\n${list || '(none)'}`,
        data: affordances,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get available affordances failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getAffordance') {
    const id = params.id as string;
    if (!id) return { success: false, output: 'Missing: id' };

    const affordance = getAffordance(id);
    if (!affordance) return { success: false, output: 'Affordance not found' };
    return {
      success: true,
      output: `Affordance "${affordance.name}": ${affordance.description} (success rate: ${(affordance.successRate * 100).toFixed(0)}%)`,
      data: affordance,
    };
  }

  if (action === 'listAffordances') {
    const affordances = getAllAffordances();
    const list = affordances
      .map((a) => `• ${a.name}: ${a.description}`)
      .join('\n');
    return {
      success: true,
      output: `All Affordances (${affordances.length}):\n${list || '(none)'}`,
      data: affordances,
    };
  }

  if (action === 'linkAffordances') {
    const enablingId = params.enablingId as string;
    const enabledId = params.enabledId as string;

    if (!enablingId || !enabledId) {
      return { success: false, output: 'Missing: enablingId, enabledId' };
    }

    try {
      const success = linkAffordances(enablingId, enabledId);
      return {
        success,
        output: success
          ? 'Affordances linked'
          : 'One or both affordances not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Link affordances failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'markConflict') {
    const affordanceId1 = params.affordanceId1 as string;
    const affordanceId2 = params.affordanceId2 as string;

    if (!affordanceId1 || !affordanceId2) {
      return {
        success: false,
        output: 'Missing: affordanceId1, affordanceId2',
      };
    }

    try {
      const success = markAffordanceConflict(affordanceId1, affordanceId2);
      return {
        success,
        output: success
          ? 'Conflict marked'
          : 'One or both affordances not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Mark conflict failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Proprioception
  if (action === 'updateProprioception') {
    const resources = params.resources as
      | Partial<ProprioceptiveState['resources']>
      | undefined;

    try {
      const proprio = updateProprioception(resources);
      return {
        success: true,
        output: `Proprioception updated. Environment: ${proprio.environment}, Health: ${proprio.isHealthy ? 'OK' : 'Degraded'}`,
        data: proprio,
      };
    } catch (err) {
      return {
        success: false,
        output: `Update proprioception failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getProprioception') {
    const proprio = getProprioception();
    return {
      success: true,
      output: `Proprioception: env=${proprio.environment}, senses=${proprio.activeSenses.length}, motors=${proprio.activeMotor.length}, healthy=${proprio.isHealthy}`,
      data: proprio,
    };
  }

  if (action === 'getCapabilitySummary') {
    try {
      const summary = getCapabilitySummary();
      return {
        success: true,
        output: `Capability Summary (${summary.environment}):
Senses: ${summary.availableSenses.length}
Motors: ${summary.availableMotors.length}
Affordances: ${summary.availableAffordances} available, ${summary.blockedAffordances} blocked`,
        data: summary,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get capability summary failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getEnvironmentHistory') {
    const history = getEnvironmentHistory();
    const list = history
      .slice(-10)
      .map((e) => `• ${e.environment} (${Math.round(e.duration / 1000)}s)`)
      .join('\n');
    return {
      success: true,
      output: `Environment History (last 10):\n${list || '(none)'}`,
      data: history,
    };
  }

  // Feedback
  if (action === 'getFeedbackHistory') {
    const limit = params.limit as number | undefined;
    const history = getFeedbackHistory(limit);
    const list = history
      .slice(-10)
      .map((f) => `• ${f.success ? '✓' : '✗'} ${f.outcome.slice(0, 40)}...`)
      .join('\n');
    return {
      success: true,
      output: `Feedback History (showing last 10 of ${history.length}):\n${list || '(none)'}`,
      data: history,
    };
  }

  // Reset
  if (action === 'reset') {
    try {
      resetEmbodiedState();
      return {
        success: true,
        output: 'Embodied interaction state reset',
      };
    } catch (err) {
      return {
        success: false,
        output: `Reset failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown embodiedInteraction action. Use: init, status, registerSense, recordSensory, getSense, listSenses, registerMotor, recordMotor, getMotor, listMotors, createMapping, reinforceMapping, weakenMapping, findMappings, listMappings, discoverAffordance, checkAffordance, applyAffordance, getAvailableAffordances, getAffordance, listAffordances, linkAffordances, markConflict, updateProprioception, getProprioception, getCapabilitySummary, getEnvironmentHistory, getFeedbackHistory, reset',
  };
};

// ============================================================================
// SOCIAL INTELLIGENCE HANDLER
// ============================================================================

export const socialIntelligence: ToolHandler = async (params) => {
  const action = params.action as string;

  // Initialization
  if (action === 'init') {
    try {
      initializeMollySocialIntelligence();
      const stats = getSocialIntelligenceStats();
      return {
        success: true,
        output: `Social intelligence initialized. Groups: ${stats.totalGroups}, Norms: ${stats.totalNorms}, Cultures: ${stats.totalCultures}`,
        data: stats,
      };
    } catch (err) {
      return {
        success: false,
        output: `Init failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const stats = getSocialIntelligenceStats();
      const summary = getSocialContextSummary();

      return {
        success: true,
        output: `Social Intelligence Status:
Groups: ${stats.totalGroups} (${stats.activeGroups} active)
Norms: ${stats.totalNorms}
Cultures: ${stats.totalCultures} (current: ${stats.currentCulture || 'none'})
Active Coalitions: ${stats.activeCoalitions}
Collective Behaviors: ${stats.collectiveBehaviors}
Influence Relations: ${stats.influenceRelations}`,
        data: { stats, summary },
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Groups
  if (action === 'createGroup') {
    const name = params.name as string;
    const description = params.description as string;
    const type = params.type as SocialGroup['type'];
    const members = params.members as string[] | undefined;

    if (!name || !description || !type) {
      return { success: false, output: 'Missing: name, description, type' };
    }

    try {
      const group = createGroup(name, description, type, members);
      return {
        success: true,
        output: `Created group: "${name}" (${type})`,
        data: group,
      };
    } catch (err) {
      return {
        success: false,
        output: `Create group failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'addMember') {
    const groupId = params.groupId as string;
    const actorId = params.actorId as string;
    const roles = params.roles as string[] | undefined;

    if (!groupId || !actorId) {
      return { success: false, output: 'Missing: groupId, actorId' };
    }

    try {
      const success = addGroupMember(groupId, actorId, roles);
      return {
        success,
        output: success ? `Added ${actorId} to group` : 'Group not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Add member failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'removeMember') {
    const groupId = params.groupId as string;
    const actorId = params.actorId as string;

    if (!groupId || !actorId) {
      return { success: false, output: 'Missing: groupId, actorId' };
    }

    try {
      const success = removeGroupMember(groupId, actorId);
      return {
        success,
        output: success ? `Removed ${actorId} from group` : 'Group not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Remove member failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'updateCohesion') {
    const groupId = params.groupId as string;
    const interaction = params.interaction as
      | 'positive'
      | 'negative'
      | 'neutral';
    const magnitude = params.magnitude as number | undefined;

    if (!groupId || !interaction) {
      return { success: false, output: 'Missing: groupId, interaction' };
    }

    try {
      const result = updateGroupCohesion(groupId, interaction, magnitude);
      if (result === null) {
        return { success: false, output: 'Group not found' };
      }
      return {
        success: true,
        output: `Updated cohesion → ${(result * 100).toFixed(0)}%`,
        data: { cohesion: result },
      };
    } catch (err) {
      return {
        success: false,
        output: `Update cohesion failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getGroup') {
    const id = params.id as string;
    if (!id) return { success: false, output: 'Missing: id' };

    const group = getGroup(id);
    if (!group) return { success: false, output: 'Group not found' };
    return {
      success: true,
      output: `Group "${group.name}" (${group.type}): ${group.members.length} members, cohesion ${(group.cohesion * 100).toFixed(0)}%`,
      data: group,
    };
  }

  if (action === 'listGroups') {
    const groups = getAllGroups();
    const list = groups
      .map((g) => `• ${g.name} (${g.type}): ${g.members.length} members`)
      .join('\n');
    return {
      success: true,
      output: `Groups (${groups.length}):\n${list || '(none)'}`,
      data: groups,
    };
  }

  if (action === 'activateGroup') {
    const groupId = params.groupId as string;
    if (!groupId) return { success: false, output: 'Missing: groupId' };

    try {
      const success = activateGroup(groupId);
      return {
        success,
        output: success ? 'Group activated' : 'Group not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Activate failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'deactivateGroup') {
    const groupId = params.groupId as string;
    if (!groupId) return { success: false, output: 'Missing: groupId' };

    try {
      deactivateGroup(groupId);
      return { success: true, output: 'Group deactivated' };
    } catch (err) {
      return {
        success: false,
        output: `Deactivate failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Coalitions
  if (action === 'formCoalition') {
    const name = params.name as string;
    const purpose = params.purpose as string;
    const members = params.members as string[];
    const leader = params.leader as string | undefined;

    if (!name || !purpose || !members) {
      return { success: false, output: 'Missing: name, purpose, members' };
    }

    try {
      const coalition = formCoalition(name, purpose, members, leader);
      return {
        success: true,
        output: `Formed coalition: "${name}"`,
        data: coalition,
      };
    } catch (err) {
      return {
        success: false,
        output: `Form coalition failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'dissolveCoalition') {
    const coalitionId = params.coalitionId as string;
    const reason = params.reason as string | undefined;

    if (!coalitionId) return { success: false, output: 'Missing: coalitionId' };

    try {
      const success = dissolveCoalition(coalitionId, reason);
      return {
        success,
        output: success ? 'Coalition dissolved' : 'Coalition not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Dissolve failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getCoalition') {
    const id = params.id as string;
    if (!id) return { success: false, output: 'Missing: id' };

    const coalition = getCoalition(id);
    if (!coalition) return { success: false, output: 'Coalition not found' };
    return {
      success: true,
      output: `Coalition "${coalition.name}": ${coalition.purpose} (${coalition.active ? 'active' : 'dissolved'})`,
      data: coalition,
    };
  }

  if (action === 'listCoalitions') {
    const coalitions = getAllCoalitions();
    const active = coalitions.filter((c) => c.active);
    const list = active.map((c) => `• ${c.name}: ${c.purpose}`).join('\n');
    return {
      success: true,
      output: `Active Coalitions (${active.length}):\n${list || '(none)'}`,
      data: coalitions,
    };
  }

  // Collective Behavior
  if (action === 'recordCollectiveBehavior') {
    const name = params.name as string;
    const description = params.description as string;
    const groupId = params.groupId as string | undefined;
    const triggerConditions = params.triggerConditions as string[];
    const sequence = params.sequence as string[];
    const roles = params.roles as string[] | undefined;

    if (!name || !description || !triggerConditions || !sequence) {
      return {
        success: false,
        output: 'Missing: name, description, triggerConditions, sequence',
      };
    }

    try {
      const behavior = recordCollectiveBehavior(
        name,
        description,
        groupId,
        triggerConditions,
        sequence,
        roles
      );
      return {
        success: true,
        output: `Recorded collective behavior: "${name}"`,
        data: behavior,
      };
    } catch (err) {
      return {
        success: false,
        output: `Record failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'observeCollectiveBehavior') {
    const behaviorId = params.behaviorId as string;
    const successful = params.successful as boolean;
    const emergentProperties = params.emergentProperties as
      | string[]
      | undefined;

    if (!behaviorId || successful === undefined) {
      return { success: false, output: 'Missing: behaviorId, successful' };
    }

    try {
      const success = observeCollectiveBehavior(
        behaviorId,
        successful,
        emergentProperties
      );
      return {
        success,
        output: success ? 'Observation recorded' : 'Behavior not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Observe failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listCollectiveBehaviors') {
    const behaviors = getAllCollectiveBehaviors();
    const list = behaviors
      .map((b) => `• ${b.name}: ${b.observedCount} observations`)
      .join('\n');
    return {
      success: true,
      output: `Collective Behaviors (${behaviors.length}):\n${list || '(none)'}`,
      data: behaviors,
    };
  }

  // Influence
  if (action === 'recordInfluence') {
    const sourceActor = params.sourceActor as string;
    const targetActor = params.targetActor as string;
    const type = params.type as InfluenceRelation['type'];
    const strength = params.strength as number;
    const domains = params.domains as string[] | undefined;

    if (!sourceActor || !targetActor || !type || strength === undefined) {
      return {
        success: false,
        output: 'Missing: sourceActor, targetActor, type, strength',
      };
    }

    try {
      const relation = recordInfluence(
        sourceActor,
        targetActor,
        type,
        strength,
        domains
      );
      return {
        success: true,
        output: `Recorded influence: ${sourceActor} → ${targetActor} (${type}, ${(strength * 100).toFixed(0)}%)`,
        data: relation,
      };
    } catch (err) {
      return {
        success: false,
        output: `Record influence failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getInfluenceNetwork') {
    const actorId = params.actorId as string;
    if (!actorId) return { success: false, output: 'Missing: actorId' };

    try {
      const network = getInfluenceNetwork(actorId);
      return {
        success: true,
        output: `Influence Network for ${actorId}:
Influenced by: ${network.influencedBy.length} actors (total: ${network.totalInfluenceReceived.toFixed(2)})
Influences: ${network.influences.length} actors (total: ${network.totalInfluenceExerted.toFixed(2)})`,
        data: network,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get network failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listInfluenceRelations') {
    const relations = getAllInfluenceRelations();
    const list = relations
      .map(
        (r) =>
          `• ${r.sourceActor} → ${r.targetActor} (${r.type}, ${(r.strength * 100).toFixed(0)}%)`
      )
      .join('\n');
    return {
      success: true,
      output: `Influence Relations (${relations.length}):\n${list || '(none)'}`,
      data: relations,
    };
  }

  // Cultures
  if (action === 'defineCulture') {
    const name = params.name as string;
    const description = params.description as string;
    const coreValues = params.coreValues as CulturalContext['coreValues'];
    const communicationStyle =
      params.communicationStyle as CulturalContext['communicationStyle'];
    const hierarchyStyle =
      params.hierarchyStyle as CulturalContext['hierarchyStyle'];

    if (
      !name ||
      !description ||
      !coreValues ||
      !communicationStyle ||
      !hierarchyStyle
    ) {
      return {
        success: false,
        output:
          'Missing: name, description, coreValues, communicationStyle, hierarchyStyle',
      };
    }

    try {
      const culture = defineCulture(
        name,
        description,
        coreValues,
        communicationStyle,
        hierarchyStyle
      );
      return {
        success: true,
        output: `Defined culture: "${name}"`,
        data: culture,
      };
    } catch (err) {
      return {
        success: false,
        output: `Define culture failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'setCurrentCulture') {
    const cultureId = params.cultureId as string;
    if (!cultureId) return { success: false, output: 'Missing: cultureId' };

    try {
      const success = setCurrentCulture(cultureId);
      return {
        success,
        output: success ? 'Current culture set' : 'Culture not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Set culture failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getCulture') {
    const id = params.id as string;
    if (!id) return { success: false, output: 'Missing: id' };

    const culture = getCulture(id);
    if (!culture) return { success: false, output: 'Culture not found' };
    const topValues = culture.coreValues
      .slice(0, 3)
      .map((v) => v.value)
      .join(', ');
    return {
      success: true,
      output: `Culture "${culture.name}": ${culture.description}\nCore values: ${topValues}`,
      data: culture,
    };
  }

  if (action === 'listCultures') {
    const cultures = getAllCultures();
    const list = cultures
      .map((c) => `• ${c.name}: ${c.description.slice(0, 50)}...`)
      .join('\n');
    return {
      success: true,
      output: `Cultures (${cultures.length}):\n${list || '(none)'}`,
      data: cultures,
    };
  }

  // Norms
  if (action === 'learnNorm') {
    const name = params.name as string;
    const description = params.description as string;
    const behavior = params.behavior as string;
    const prescriptive = params.prescriptive as boolean;
    const scope = params.scope as Partial<SocialNorm['scope']> | undefined;

    if (!name || !description || !behavior || prescriptive === undefined) {
      return {
        success: false,
        output: 'Missing: name, description, behavior, prescriptive',
      };
    }

    try {
      const norm = learnNorm(name, description, behavior, prescriptive, scope);
      return {
        success: true,
        output: `Learned norm: "${name}" (${prescriptive ? 'prescriptive' : 'proscriptive'})`,
        data: norm,
      };
    } catch (err) {
      return {
        success: false,
        output: `Learn norm failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'observeCompliance') {
    const normId = params.normId as string;
    if (!normId) return { success: false, output: 'Missing: normId' };

    try {
      const success = observeNormCompliance(normId);
      return {
        success,
        output: success ? 'Compliance observed' : 'Norm not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Observe failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'observeViolation') {
    const normId = params.normId as string;
    const consequences = params.consequences as string[] | undefined;

    if (!normId) return { success: false, output: 'Missing: normId' };

    try {
      const success = observeNormViolation(normId, consequences);
      return {
        success,
        output: success ? 'Violation observed' : 'Norm not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Observe failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getApplicableNorms') {
    const cultureId = params.cultureId as string | undefined;
    const groupId = params.groupId as string | undefined;
    const context = params.context as string | undefined;

    try {
      const norms = getApplicableNorms(cultureId, groupId, context);
      const list = norms.map((n) => `• ${n.name}: ${n.behavior}`).join('\n');
      return {
        success: true,
        output: `Applicable Norms (${norms.length}):\n${list || '(none)'}`,
        data: norms,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get norms failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getNorm') {
    const id = params.id as string;
    if (!id) return { success: false, output: 'Missing: id' };

    const norm = getNorm(id);
    if (!norm) return { success: false, output: 'Norm not found' };
    return {
      success: true,
      output: `Norm "${norm.name}": ${norm.prescriptive ? 'Do' : "Don't"} "${norm.behavior}" (strength: ${(norm.strength * 100).toFixed(0)}%)`,
      data: norm,
    };
  }

  if (action === 'listNorms') {
    const norms = getAllNorms();
    const list = norms
      .map((n) => `• ${n.name}: ${n.prescriptive ? '✓' : '✗'} ${n.behavior}`)
      .join('\n');
    return {
      success: true,
      output: `Norms (${norms.length}):\n${list || '(none)'}`,
      data: norms,
    };
  }

  // Analysis
  if (action === 'analyzePowerStructure') {
    const groupId = params.groupId as string;
    if (!groupId) return { success: false, output: 'Missing: groupId' };

    try {
      const analysis = analyzeGroupPowerStructure(groupId);
      if (!analysis) return { success: false, output: 'Group not found' };

      const central = analysis.centralActors
        .map((a) => `${a.actorId} (${(a.centrality * 100).toFixed(0)}%)`)
        .join(', ');
      return {
        success: true,
        output: `Power Structure Analysis:
Central: ${central || '(none)'}
Peripheral: ${analysis.peripheralActors.join(', ') || '(none)'}
Concentration: ${(analysis.powerConcentration * 100).toFixed(0)}%`,
        data: analysis,
      };
    } catch (err) {
      return {
        success: false,
        output: `Analyze failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getContextSummary') {
    try {
      const summary = getSocialContextSummary();
      return {
        success: true,
        output: `Social Context Summary:
Culture: ${summary.currentCulture?.name || 'none'}
Active Groups: ${summary.activeGroups.length}
Active Coalitions: ${summary.activeCoalitions.length}
Applicable Norms: ${summary.applicableNorms.length}
Communication Tips: ${summary.communicationRecommendations.join('; ') || 'none'}`,
        data: summary,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get summary failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Reset
  if (action === 'reset') {
    try {
      resetSocialState();
      return { success: true, output: 'Social intelligence state reset' };
    } catch (err) {
      return {
        success: false,
        output: `Reset failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown socialIntelligence action. Use: init, status, createGroup, addMember, removeMember, updateCohesion, getGroup, listGroups, activateGroup, deactivateGroup, form_Coalition, dissolveCoalition, getCoalition, listCoalitions, recordCollectiveBehavior, observeCollectiveBehavior, listCollectiveBehaviors, recordInfluence, getInfluenceNetwork, listInfluenceRelations, defineCulture, setCurrentCulture, getCulture, listCultures, learnNorm, observeCompliance, observeViolation, getApplicableNorms, getNorm, listNorms, analyzePowerStructure, getContextSummary, reset',
  };
};

// ============================================================================
// SAFE SELF-MODIFICATION HANDLER
// ============================================================================

export const selfModification: ToolHandler = async (params) => {
  const action = params.action as string;

  // Initialization
  if (action === 'init') {
    try {
      initializeSelfModification();
      const stats = getModificationStats();
      return {
        success: true,
        output: `Self-modification system initialized. Components: ${stats.totalComponents}, Safety: ${stats.safetyLocked ? 'LOCKED' : 'unlocked'}`,
        data: stats,
      };
    } catch (err) {
      return {
        success: false,
        output: `Init failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const stats = getModificationStats();
      const architecture = introspectArchitecture();

      return {
        success: true,
        output: `Self-Modification Status:
Components: ${stats.totalComponents}
Proposals: ${stats.totalProposals} total, ${stats.pendingProposals} pending
Applied: ${stats.totalApplied}, Rolled back: ${stats.totalRolledBack}
Safety Lock: ${stats.safetyLocked ? 'ACTIVE' : 'inactive'}
Modifiable: ${architecture.modifiableCount}, Immutable: ${architecture.immutableCount}`,
        data: { stats, architecture },
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Architecture
  if (action === 'registerComponent') {
    const name = params.name as string;
    const description = params.description as string;
    const type = params.type as ModifiableComponent['type'];
    const criticality =
      params.criticality as ModifiableComponent['criticality'];
    const config = params.config as Record<string, unknown> | undefined;
    const options = params.options as Record<string, boolean> | undefined;

    if (!name || !description || !type || !criticality) {
      return {
        success: false,
        output: 'Missing: name, description, type, criticality',
      };
    }

    try {
      const component = registerComponent(
        name,
        description,
        type,
        criticality,
        config,
        options
      );
      return {
        success: true,
        output: `Registered component: ${name} (${type}, ${criticality})`,
        data: component,
      };
    } catch (err) {
      return {
        success: false,
        output: `Register failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getComponent') {
    const id = params.id as string;
    if (!id) return { success: false, output: 'Missing: id' };

    const component = getSelfModComponent(id);
    if (!component) return { success: false, output: 'Component not found' };
    return {
      success: true,
      output: `Component "${component.name}" (${component.type}, v${component.version}): ${component.modifiable ? 'modifiable' : 'locked'}`,
      data: component,
    };
  }

  if (action === 'listComponents') {
    const components = getAllSelfModComponents();
    const list = components
      .map(
        (c) =>
          `• ${c.name} (${c.type}): ${c.immutable ? 'immutable' : c.modifiable ? 'modifiable' : 'locked'}`
      )
      .join('\n');
    return {
      success: true,
      output: `Components (${components.length}):\n${list || '(none)'}`,
      data: components,
    };
  }

  if (action === 'introspect') {
    try {
      const result = introspectArchitecture();
      return {
        success: true,
        output: `Architecture Introspection:
Total: ${result.totalComponents} components
By Type: cognitive=${result.byType.cognitive}, behavioral=${result.byType.behavioral}, value=${result.byType.value}, safety=${result.byType.safety}
Modifiable: ${result.modifiableCount}, Immutable: ${result.immutableCount}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Introspect failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Proposals
  if (action === 'propose') {
    const componentId = params.componentId as string;
    const type = params.type as ModificationProposal['type'];
    const description = params.description as string;
    const rationale = params.rationale as string;
    const changes = params.changes as ModificationProposal['changes'];

    if (!componentId || !type || !description || !rationale || !changes) {
      return {
        success: false,
        output: 'Missing: componentId, type, description, rationale, changes',
      };
    }

    try {
      const result = proposeModification(
        componentId,
        type,
        description,
        rationale,
        changes
      );
      if ('error' in result) {
        return { success: false, output: result.error };
      }
      return {
        success: true,
        output: `Proposal created: ${result.id}\nRisk: ${result.safetyAnalysis.riskLevel}\nRequires approval: ${result.requiresHumanApproval}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Propose failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'submitProposal') {
    const proposalId = params.proposalId as string;
    if (!proposalId) return { success: false, output: 'Missing: proposalId' };

    try {
      const success = submitProposal(proposalId);
      return {
        success,
        output: success
          ? 'Proposal submitted for review'
          : 'Proposal not found or already submitted',
      };
    } catch (err) {
      return {
        success: false,
        output: `Submit failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'checkSafety') {
    const proposalId = params.proposalId as string;
    if (!proposalId) return { success: false, output: 'Missing: proposalId' };

    try {
      const result = checkProposalSafety(proposalId);
      const checks = result.checks
        .map((c) => `• ${c.name}: ${c.passed ? '✓' : '✗'} ${c.details}`)
        .join('\n');
      return {
        success: true,
        output: `Safety Check (${result.passed ? 'PASSED' : 'FAILED'}):
Risk: ${result.overallRisk}
Recommendation: ${result.recommendation}
Checks:\n${checks}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Safety check failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'approve') {
    const proposalId = params.proposalId as string;
    const approver = params.approver as string;
    const isHuman = params.isHuman as boolean;

    if (!proposalId || !approver || isHuman === undefined) {
      return {
        success: false,
        output: 'Missing: proposalId, approver, isHuman',
      };
    }

    try {
      const success = approveProposal(proposalId, approver, isHuman);
      return {
        success,
        output: success
          ? `Proposal approved by ${approver}`
          : 'Approval failed (not pending or requires human)',
      };
    } catch (err) {
      return {
        success: false,
        output: `Approve failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'reject') {
    const proposalId = params.proposalId as string;
    const reason = params.reason as string;

    if (!proposalId || !reason) {
      return { success: false, output: 'Missing: proposalId, reason' };
    }

    try {
      const success = rejectProposal(proposalId, reason);
      return {
        success,
        output: success ? 'Proposal rejected' : 'Rejection failed',
      };
    } catch (err) {
      return {
        success: false,
        output: `Reject failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'apply') {
    const proposalId = params.proposalId as string;
    if (!proposalId) return { success: false, output: 'Missing: proposalId' };

    try {
      const result = applyProposal(proposalId);
      return {
        success: result.success,
        output: result.success
          ? 'Modification applied successfully'
          : `Application failed: ${result.error}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Apply failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getProposal') {
    const id = params.id as string;
    if (!id) return { success: false, output: 'Missing: id' };

    const proposal = getProposal(id);
    if (!proposal) return { success: false, output: 'Proposal not found' };
    return {
      success: true,
      output: `Proposal "${proposal.description}" (${proposal.status})\nRisk: ${proposal.safetyAnalysis.riskLevel}`,
      data: proposal,
    };
  }

  if (action === 'listProposals') {
    const status = params.status as ModificationProposal['status'] | undefined;
    const proposals = status ? getProposalsByStatus(status) : getAllProposals();
    const list = proposals
      .map(
        (p) =>
          `• [${p.status}] ${p.description} (${p.safetyAnalysis.riskLevel})`
      )
      .join('\n');
    return {
      success: true,
      output: `Proposals (${proposals.length}):\n${list || '(none)'}`,
      data: proposals,
    };
  }

  // Rollback
  if (action === 'takeSnapshot') {
    const componentId = params.componentId as string;
    const reason = params.reason as string;
    const proposalId = params.proposalId as string | undefined;

    if (!componentId || !reason) {
      return { success: false, output: 'Missing: componentId, reason' };
    }

    try {
      const snapshotId = takeSnapshot(componentId, reason, proposalId);
      return {
        success: true,
        output: `Snapshot created: ${snapshotId}`,
        data: { snapshotId },
      };
    } catch (err) {
      return {
        success: false,
        output: `Snapshot failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'rollbackSnapshot') {
    const snapshotId = params.snapshotId as string;
    if (!snapshotId) return { success: false, output: 'Missing: snapshotId' };

    try {
      const result = rollbackToSnapshot(snapshotId);
      return {
        success: result.success,
        output: result.success
          ? 'Rollback successful'
          : `Rollback failed: ${result.error}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Rollback failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'rollbackComponent') {
    const componentId = params.componentId as string;
    const reason = params.reason as string;

    if (!componentId || !reason) {
      return { success: false, output: 'Missing: componentId, reason' };
    }

    try {
      const result = rollbackComponent(componentId, reason);
      return {
        success: result.success,
        output: result.success
          ? `Rolled back to snapshot ${result.snapshotId}`
          : `Rollback failed: ${result.error}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Rollback failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listSnapshots') {
    const componentId = params.componentId as string | undefined;
    const snapshots = getSnapshots(componentId);
    const list = snapshots
      .slice(-10)
      .map((s) => `• ${s.componentName} v${s.version} (${s.reason})`)
      .join('\n');
    return {
      success: true,
      output: `Snapshots (showing last 10 of ${snapshots.length}):\n${list || '(none)'}`,
      data: snapshots,
    };
  }

  // Safety
  if (action === 'lock') {
    const reason = params.reason as string;
    if (!reason) return { success: false, output: 'Missing: reason' };

    try {
      activateSafetyLock(reason);
      return {
        success: true,
        output: 'Safety lock ACTIVATED - all modifications blocked',
      };
    } catch (err) {
      return {
        success: false,
        output: `Lock failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'unlock') {
    const humanId = params.humanId as string;
    if (!humanId)
      return {
        success: false,
        output: 'Missing: humanId (human authorization required)',
      };

    try {
      const success = deactivateSafetyLock(humanId);
      return {
        success,
        output: success ? 'Safety lock deactivated' : 'Unlock failed',
      };
    } catch (err) {
      return {
        success: false,
        output: `Unlock failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'checkSafe') {
    try {
      const result = isSafeForModification();
      return {
        success: true,
        output: result.safe
          ? 'System is safe for modifications'
          : `Modifications blocked: ${result.reason}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Check failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Capabilities
  if (action === 'getCapabilities') {
    const caps = getSelfModCapabilities();
    return {
      success: true,
      output: `Modification Capabilities:
Config: ${caps.canModifyConfig}, Add: ${caps.canAddCapabilities}, Remove: ${caps.canRemoveCapabilities}
Behavior: ${caps.canModifyBehavior}, Safety: ${caps.canModifySafety}
Max pending: ${caps.maxPendingProposals}, Cooldown: ${caps.cooldownPeriod}ms`,
      data: caps,
    };
  }

  if (action === 'updateCapabilities') {
    const updates = params.updates as Record<string, unknown>;
    if (!updates) return { success: false, output: 'Missing: updates' };

    try {
      const caps = updateSelfModCapabilities(updates);
      return {
        success: true,
        output: 'Capabilities updated',
        data: caps,
      };
    } catch (err) {
      return {
        success: false,
        output: `Update failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Logs
  if (action === 'getLogs') {
    const filter = params.filter as Record<string, unknown> | undefined;
    const logs = getSelfModLogs(filter);
    const list = logs
      .slice(0, 10)
      .map((l) => `• [${l.eventType}] ${l.description}`)
      .join('\n');
    return {
      success: true,
      output: `Modification Logs (showing 10 of ${logs.length}):\n${list || '(none)'}`,
      data: logs,
    };
  }

  // Reset
  if (action === 'reset') {
    try {
      resetSelfModState();
      return { success: true, output: 'Self-modification state reset' };
    } catch (err) {
      return {
        success: false,
        output: `Reset failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown selfModification action. Use: init, status, registerComponent, getComponent, listComponents, introspect, propose, submitProposal, checkSafety, approve, reject, apply, getProposal, listProposals, takeSnapshot, rollbackSnapshot, rollbackComponent, listSnapshots, lock, unlock, checkSafe, getCapabilities, updateCapabilities, getLogs, reset',
  };
};

// ============================================================================
// MEMORY CONSOLIDATION HANDLER
// ============================================================================

export const memoryConsolidation: ToolHandler = async (params) => {
  const action = params.action as string;

  // Initialization
  if (action === 'init') {
    try {
      initializeMemoryConsolidation();
      const stats = getMemoryStats();
      return {
        success: true,
        output: `Memory consolidation initialized. Traces: ${stats.totalTraces}, Consolidated: ${stats.totalConsolidated}, Current chapter: ${stats.currentChapter || 'none'}`,
        data: stats,
      };
    } catch (err) {
      return {
        success: false,
        output: `Init failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const stats = getMemoryStats();
      const sleepStatus = needsSleep();

      return {
        success: true,
        output: `Memory Consolidation Status:
Traces: ${stats.totalTraces} (${stats.unconsolidatedTraces} unconsolidated)
Consolidated: ${stats.totalConsolidated} memories
Dreams: ${stats.totalDreams}, Insights: ${stats.totalInsights}
Sleep cycles: ${stats.sleepCyclesCompleted}
Sleep needed: ${sleepStatus.needed ? 'Yes' : 'No'} (${sleepStatus.reason})
Current chapter: ${stats.currentChapter || 'none'}`,
        data: { stats, sleepStatus },
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Traces
  if (action === 'recordTrace') {
    const type = params.type as MemoryTrace['type'];
    const content = params.content as string;
    const context = params.context as Record<string, unknown> | undefined;
    const options = params.options as Record<string, unknown> | undefined;

    if (!type || !content) {
      return { success: false, output: 'Missing: type, content' };
    }

    try {
      const trace = recordTrace(type, content, context, options);
      return {
        success: true,
        output: `Recorded ${type} trace: "${content.slice(0, 50)}..."`,
        data: trace,
      };
    } catch (err) {
      return {
        success: false,
        output: `Record failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'linkTraces') {
    const traceId1 = params.traceId1 as string;
    const traceId2 = params.traceId2 as string;

    if (!traceId1 || !traceId2) {
      return { success: false, output: 'Missing: traceId1, traceId2' };
    }

    try {
      const success = linkTraces(traceId1, traceId2);
      return {
        success,
        output: success ? 'Traces linked' : 'One or both traces not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Link failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'rehearse') {
    const traceId = params.traceId as string;
    if (!traceId) return { success: false, output: 'Missing: traceId' };

    try {
      const success = rehearseTrace(traceId);
      return {
        success,
        output: success
          ? 'Trace rehearsed (strength increased)'
          : 'Trace not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Rehearse failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getTrace') {
    const id = params.id as string;
    if (!id) return { success: false, output: 'Missing: id' };

    const trace = getTrace(id);
    if (!trace) return { success: false, output: 'Trace not found' };
    return {
      success: true,
      output: `Trace (${trace.type}): "${trace.content.slice(0, 50)}..." [salience: ${(trace.salience * 100).toFixed(0)}%, ${trace.consolidated ? 'consolidated' : 'pending'}]`,
      data: trace,
    };
  }

  if (action === 'listTraces') {
    const traces = getAllTraces();
    const pending = traces.filter((t) => !t.consolidated);
    const list = pending
      .slice(-10)
      .map((t) => `• [${t.type}] ${t.content.slice(0, 40)}...`)
      .join('\n');
    return {
      success: true,
      output: `Traces (${pending.length} pending, ${traces.length - pending.length} consolidated):\n${list || '(none pending)'}`,
      data: pending.slice(-10),
    };
  }

  // Sleep
  if (action === 'needsSleep') {
    try {
      const result = needsSleep();
      return {
        success: true,
        output: result.needed
          ? `Sleep needed: ${result.reason}`
          : `No sleep needed: ${result.reason}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Check failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'beginSleep') {
    try {
      const result = beginSleepCycle();
      if ('error' in result) {
        return { success: false, output: result.error };
      }
      return {
        success: true,
        output: `Sleep cycle begun (phase: ${result.phase})`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Begin sleep failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'advanceSleep') {
    try {
      const result = advanceSleepPhase();
      if (!result) {
        return { success: false, output: 'No active sleep cycle' };
      }
      return {
        success: true,
        output: `${result.work} [phase: ${result.cycle.phase}${result.completed ? ', COMPLETED' : ''}]`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Advance failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'runSleepCycle') {
    try {
      const result = runFullSleepCycle();
      if ('error' in result) {
        return { success: false, output: result.error };
      }
      return {
        success: true,
        output: `Sleep cycle completed:
Consolidated: ${result.tracesConsolidated} memories
Dreams: ${result.dreamsGenerated}
Insights: ${result.insightsGenerated.length}
Cleaned up: ${result.cleanupCount} old traces`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Sleep cycle failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Memories
  if (action === 'getMemory') {
    const id = params.id as string;
    if (!id) return { success: false, output: 'Missing: id' };

    const memory = getConsolidatedMemory(id);
    if (!memory) return { success: false, output: 'Memory not found' };
    return {
      success: true,
      output: `Memory (${memory.type}): ${memory.summary}\nThemes: ${memory.themes.join(', ') || 'none'}`,
      data: memory,
    };
  }

  if (action === 'accessMemory') {
    const id = params.id as string;
    if (!id) return { success: false, output: 'Missing: id' };

    try {
      const memory = accessMemory(id);
      if (!memory) return { success: false, output: 'Memory not found' };
      return {
        success: true,
        output: `Accessed memory (retrieval strength: ${(memory.retrievalStrength * 100).toFixed(0)}%)`,
        data: memory,
      };
    } catch (err) {
      return {
        success: false,
        output: `Access failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listMemories') {
    const memories = getAllMemories();
    const recent = memories
      .sort((a, b) => b.consolidatedAt - a.consolidatedAt)
      .slice(0, 10);
    const list = recent
      .map((m) => `• [${m.type}] ${m.summary.slice(0, 40)}...`)
      .join('\n');
    return {
      success: true,
      output: `Consolidated Memories (showing 10 of ${memories.length}):\n${list || '(none)'}`,
      data: recent,
    };
  }

  if (action === 'searchTheme') {
    const theme = params.theme as string;
    if (!theme) return { success: false, output: 'Missing: theme' };

    try {
      const memories = searchByTheme(theme);
      const list = memories
        .slice(0, 10)
        .map((m) => `• ${m.summary.slice(0, 50)}...`)
        .join('\n');
      return {
        success: true,
        output: `Memories with theme "${theme}" (${memories.length}):\n${list || '(none)'}`,
        data: memories.slice(0, 10),
      };
    } catch (err) {
      return {
        success: false,
        output: `Search failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Dreams
  if (action === 'listDreams') {
    const cycleId = params.cycleId as string | undefined;
    const dreams = getDreams(cycleId);
    const list = dreams
      .slice(-5)
      .map(
        (d) =>
          `• ${d.narrative.slice(0, 60)}... [insights: ${d.insights.length}]`
      )
      .join('\n');
    return {
      success: true,
      output: `Dreams (${dreams.length}):\n${list || '(none)'}`,
      data: dreams.slice(-5),
    };
  }

  // Chapters
  if (action === 'beginChapter') {
    const name = params.name as string;
    const description = params.description as string;
    const openingStatement = params.openingStatement as string;

    if (!name || !description || !openingStatement) {
      return {
        success: false,
        output: 'Missing: name, description, openingStatement',
      };
    }

    try {
      const chapter = beginMemoryChapter(name, description, openingStatement);
      return {
        success: true,
        output: `New chapter begun: "${name}"`,
        data: chapter,
      };
    } catch (err) {
      return {
        success: false,
        output: `Begin chapter failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'closeChapter') {
    const chapterId = params.chapterId as string;
    const closingStatement = params.closingStatement as string;
    const lessonLearned = params.lessonLearned as string | undefined;

    if (!chapterId || !closingStatement) {
      return { success: false, output: 'Missing: chapterId, closingStatement' };
    }

    try {
      const success = closeMemoryChapter(
        chapterId,
        closingStatement,
        lessonLearned
      );
      return {
        success,
        output: success ? 'Chapter closed' : 'Chapter not found',
      };
    } catch (err) {
      return {
        success: false,
        output: `Close chapter failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getChapter') {
    const id = params.id as string;
    if (!id) return { success: false, output: 'Missing: id' };

    const chapter = getMemoryChapter(id);
    if (!chapter) return { success: false, output: 'Chapter not found' };
    return {
      success: true,
      output: `Chapter "${chapter.name}": ${chapter.description}\n${chapter.current ? 'CURRENT' : 'Closed'}`,
      data: chapter,
    };
  }

  if (action === 'currentChapter') {
    const chapter = getCurrentMemoryChapter();
    if (!chapter)
      return { success: true, output: 'No current chapter', data: null };
    return {
      success: true,
      output: `Current chapter: "${chapter.name}" - ${chapter.description}\n"${chapter.openingStatement}"`,
      data: chapter,
    };
  }

  if (action === 'listChapters') {
    const chapters = getAllMemoryChapters();
    const list = chapters
      .map(
        (c) =>
          `• ${c.name}${c.current ? ' (current)' : ''}: ${c.description.slice(0, 40)}...`
      )
      .join('\n');
    return {
      success: true,
      output: `Life Chapters (${chapters.length}):\n${list || '(none)'}`,
      data: chapters,
    };
  }

  // Insights
  if (action === 'addInsight') {
    const type = params.type as AutobiographicalInsight['type'];
    const insight = params.insight as string;
    const evidence = params.evidence as string[] | undefined;

    if (!type || !insight) {
      return { success: false, output: 'Missing: type, insight' };
    }

    try {
      const result = addInsight(type, insight, evidence);
      return {
        success: true,
        output: `Insight added (${type}): "${insight.slice(0, 50)}..."`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Add insight failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listInsights') {
    const insights = getAllInsights();
    const list = insights
      .slice(-10)
      .map((i) => `• [${i.type}] ${i.insight.slice(0, 50)}...`)
      .join('\n');
    return {
      success: true,
      output: `Insights (${insights.length}):\n${list || '(none)'}`,
      data: insights.slice(-10),
    };
  }

  // Autobiography
  if (action === 'getAutobiography') {
    try {
      const auto = getAutobiography();
      return {
        success: true,
        output: `Autobiography:
Chapters: ${auto.chapters.length}
Current: ${auto.currentChapter?.name || 'none'}
Total memories: ${auto.totalMemories}
Key insights: ${auto.keyInsights.length}

${auto.overallNarrative}`,
        data: auto,
      };
    } catch (err) {
      return {
        success: false,
        output: `Get autobiography failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Configuration
  if (action === 'getConfig') {
    const config = getMemoryConfig();
    return {
      success: true,
      output: `Memory Config:
Sleep interval: ${config.sleepInterval / 60000}min
Min traces for sleep: ${config.minTracesForSleep}
Dream probability: ${config.dreamProbability}
Retention threshold: ${config.retentionThreshold}`,
      data: config,
    };
  }

  if (action === 'updateConfig') {
    const updates = params.updates as Record<string, unknown>;
    if (!updates) return { success: false, output: 'Missing: updates' };

    try {
      updateMemoryConfig(updates);
      return {
        success: true,
        output: 'Configuration updated',
        data: getMemoryConfig(),
      };
    } catch (err) {
      return {
        success: false,
        output: `Update config failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  // Reset
  if (action === 'reset') {
    try {
      resetMemoryState();
      return { success: true, output: 'Memory consolidation state reset' };
    } catch (err) {
      return {
        success: false,
        output: `Reset failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown memoryConsolidation action. Use: init, status, recordTrace, linkTraces, rehearse, getTrace, listTraces, needsSleep, beginSleep, advanceSleep, runSleepCycle, getMemory, accessMemory, listMemories, searchTheme, listDreams, beginChapter, closeChapter, getChapter, currentChapter, listChapters, addInsight, listInsights, getAutobiography, getConfig, updateConfig, reset',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// World Model Tool — Mental Simulation Engine
// ════════════════════════════════════════════════════════════════════════════

export const worldModel: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'init' || action === 'seed') {
    try {
      seedWorldModel();
      return {
        success: true,
        output: 'World model seeded with initial entities.',
      };
    } catch (err) {
      return {
        success: false,
        output: `Init failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'load') {
    try {
      const count = await loadWorldModel();
      return {
        success: true,
        output: `Loaded ${count} entities from storage.`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Load failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = getWorldModelStatus();
      return {
        success: true,
        output: `World Model: ${status.entityCount} entities, ${status.relationCount} relations, ${status.simulationCount} simulations, ${status.pendingPredictions} pending predictions`,
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'upsertEntity') {
    const name = params.name as string;
    const type = params.type as EntityType;
    const description = params.description as string;
    if (!name || !type)
      return { success: false, output: 'Missing: name, type' };
    try {
      const entity = upsertEntity({
        type,
        name,
        description: description || `${type}: ${name}`,
        properties: (params.properties as Record<string, unknown>) || {},
        confidence: (params.confidence as number) || 0.8,
      });
      return {
        success: true,
        output: `Entity upserted: "${name}" (${type})`,
        data: entity,
      };
    } catch (err) {
      return {
        success: false,
        output: `Upsert failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getEntity') {
    const nameOrId = params.nameOrId as string;
    if (!nameOrId) return { success: false, output: 'Missing: nameOrId' };
    const entity = getEntity(nameOrId);
    if (!entity)
      return { success: false, output: `Entity not found: ${nameOrId}` };
    return {
      success: true,
      output: `Entity: ${entity.name} (${entity.type}) - ${entity.description}`,
      data: entity,
    };
  }

  if (action === 'listEntities') {
    const type = params.type as EntityType | undefined;
    const entities = type ? getEntitiesByType(type) : getAllEntities();
    const list = entities
      .slice(0, 20)
      .map((e) => `• ${e.name} (${e.type})`)
      .join('\n');
    return {
      success: true,
      output: `Entities (${entities.length}):\n${list || '(none)'}`,
      data: entities.slice(0, 20),
    };
  }

  if (action === 'removeEntity') {
    const entityId = params.entityId as string;
    if (!entityId) return { success: false, output: 'Missing: entityId' };
    const removed = removeEntity(entityId);
    return {
      success: removed,
      output: removed ? 'Entity removed' : 'Entity not found',
    };
  }

  if (action === 'createRelation') {
    const fromId = params.fromId as string;
    const toId = params.toId as string;
    const type = params.type as RelationType;
    if (!fromId || !toId || !type)
      return { success: false, output: 'Missing: fromId, toId, type' };
    try {
      const relation = createRelation({
        fromId,
        toId,
        type,
        strength: (params.strength as number) || 0.7,
        evidence: params.evidence as string,
      });
      return {
        success: true,
        output: `Relation created: ${fromId} ${type} ${toId}`,
        data: relation,
      };
    } catch (err) {
      return {
        success: false,
        output: `Create relation failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getRelations') {
    const entityId = params.entityId as string;
    if (!entityId) return { success: false, output: 'Missing: entityId' };
    const relations = getRelationsFor(entityId);
    return {
      success: true,
      output: `Relations for ${entityId}: ${relations.incoming.length} incoming, ${relations.outgoing.length} outgoing`,
      data: relations,
    };
  }

  if (action === 'findCausalChain') {
    const fromId = params.fromId as string;
    const toId = params.toId as string;
    if (!fromId || !toId)
      return { success: false, output: 'Missing: fromId, toId' };
    const chain = findCausalChain(fromId, toId);
    if (!chain) return { success: false, output: 'No causal chain found' };
    return {
      success: true,
      output: `Causal chain: ${chain.map((r) => `${r.fromId} ${r.type} ${r.toId}`).join(' → ')}`,
      data: chain,
    };
  }

  if (action === 'simulate') {
    const scenario = params.scenario as string;
    const steps = params.steps as number;
    if (!scenario) return { success: false, output: 'Missing: scenario' };
    try {
      const simulation = simulate({
        scenario,
        initialConditions:
          (params.initialConditions as Record<string, unknown>) || {},
        steps: steps || 3,
      });
      return {
        success: true,
        output: `Simulation: ${simulation.outcome} (${(simulation.confidence * 100).toFixed(0)}% confidence)\n${simulation.steps.map((s) => `  ${s.step}. ${s.description}`).join('\n')}`,
        data: simulation,
      };
    } catch (err) {
      return {
        success: false,
        output: `Simulate failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'predict') {
    const statement = params.statement as string;
    const confidence = params.confidence as number;
    if (!statement) return { success: false, output: 'Missing: statement' };
    try {
      const prediction = predict({
        statement,
        confidence: confidence || 0.7,
        deadline: params.deadline as string,
        reasoning: params.reasoning as string,
      });
      return {
        success: true,
        output: `Prediction recorded: "${statement.slice(0, 50)}..." (${(prediction.confidence * 100).toFixed(0)}% confidence)`,
        data: prediction,
      };
    } catch (err) {
      return {
        success: false,
        output: `Predict failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'verifyPrediction') {
    const predictionId = params.predictionId as string;
    const outcome = params.outcome as boolean;
    if (!predictionId || outcome === undefined)
      return { success: false, output: 'Missing: predictionId, outcome' };
    try {
      const result = verifyPrediction(
        predictionId,
        outcome,
        params.notes as string
      );
      return {
        success: true,
        output: `Prediction verified: ${outcome ? 'correct' : 'incorrect'}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Verify failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listPredictions') {
    const predictions = getPendingPredictions();
    const list = predictions
      .slice(0, 10)
      .map(
        (p) =>
          `• ${p.statement.slice(0, 40)}... (${(p.confidence * 100).toFixed(0)}%)`
      )
      .join('\n');
    return {
      success: true,
      output: `Pending predictions (${predictions.length}):\n${list || '(none)'}`,
      data: predictions.slice(0, 10),
    };
  }

  if (action === 'counterfactual') {
    const question = params.question as string;
    const changes = params.changes as Record<string, unknown>;
    if (!question) return { success: false, output: 'Missing: question' };
    try {
      const result = counterfactual({
        question,
        changes: changes || {},
      });
      return {
        success: true,
        output: `Counterfactual: ${result.conclusion}\nDifferences: ${result.differences?.slice(0, 3).join('; ') || 'none significant'}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Counterfactual failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'simulateBeforeAction') {
    const actionPlan = params.actionPlan as string;
    if (!actionPlan) return { success: false, output: 'Missing: actionPlan' };
    try {
      const result = simulateBeforeAction(actionPlan);
      return {
        success: true,
        output: `Pre-action simulation: ${result.recommendation}\nRisks: ${result.risks?.join(', ') || 'none identified'}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Pre-action sim failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'recentSimulations') {
    const limit = (params.limit as number) || 5;
    const simulations = getRecentSimulations(limit);
    const list = simulations
      .map((s) => `• ${s.scenario?.slice(0, 30)}... → ${s.outcome}`)
      .join('\n');
    return {
      success: true,
      output: `Recent simulations:\n${list || '(none)'}`,
      data: simulations,
    };
  }

  return {
    success: false,
    output:
      'Unknown worldModel action. Use: init, load, status, upsertEntity, getEntity, listEntities, removeEntity, createRelation, getRelations, findCausalChain, simulate, predict, verifyPrediction, listPredictions, counterfactual, simulateBeforeAction, recentSimulations',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Self-Observation Loop Tool — Know Thyself
// ════════════════════════════════════════════════════════════════════════════

export const selfObservation: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'status') {
    try {
      const status = getObservationStatus();
      return {
        success: true,
        output: `Self-Observation: ${status.totalObservations} observations, ${status.patternsDetected} patterns (${status.unacknowledgedPatterns} unacknowledged), ${status.unappliedInsights} unapplied insights`,
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'record') {
    const type = params.type as ObservationType;
    const subject = params.subject as string;
    const data = params.data as Record<string, unknown>;
    const context = params.context as string;
    if (!type || !subject)
      return { success: false, output: 'Missing: type, subject' };
    try {
      const obs = recordSelfObservation({
        type,
        subject,
        data: data || {},
        context: context || 'general',
      });
      return {
        success: true,
        output: `Observation recorded: ${type} - ${subject}`,
        data: obs,
      };
    } catch (err) {
      return {
        success: false,
        output: `Record failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'observeTool') {
    const tool = params.tool as string;
    const success = params.success as boolean;
    if (!tool) return { success: false, output: 'Missing: tool' };
    try {
      const obs = observeToolUse(
        tool,
        success !== false,
        (params.duration as number) || 0,
        params.notes as string
      );
      return {
        success: true,
        output: `Tool use observed: ${tool} (${success !== false ? 'success' : 'failure'})`,
        data: obs,
      };
    } catch (err) {
      return {
        success: false,
        output: `Observe tool failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'observeDecision') {
    const decision = params.decision as string;
    const context = params.context as string;
    const confidence = params.confidence as number;
    if (!decision) return { success: false, output: 'Missing: decision' };
    try {
      const obs = observeDecision(
        decision,
        context || 'general',
        confidence || 0.7,
        (params.alternatives as string[]) || []
      );
      return {
        success: true,
        output: `Decision observed: "${decision.slice(0, 50)}..."`,
        data: obs,
      };
    } catch (err) {
      return {
        success: false,
        output: `Observe decision failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'observeFailure') {
    const what = params.what as string;
    const why = params.why as string;
    const recoveryAttempt = params.recoveryAttempt as string;
    if (!what) return { success: false, output: 'Missing: what' };
    try {
      const obs = observeFailure(what, why || 'unknown', recoveryAttempt);
      return {
        success: true,
        output: `Failure observed: ${what}`,
        data: obs,
      };
    } catch (err) {
      return {
        success: false,
        output: `Observe failure failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'observeSuccess') {
    const what = params.what as string;
    const factors = params.factors as string[];
    if (!what) return { success: false, output: 'Missing: what' };
    try {
      const obs = observeSuccess(what, factors || []);
      return {
        success: true,
        output: `Success observed: ${what}`,
        data: obs,
      };
    } catch (err) {
      return {
        success: false,
        output: `Observe success failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'analyzePatterns') {
    try {
      const patterns = analyzePatterns();
      const list = patterns
        .slice(0, 10)
        .map(
          (p) =>
            `• [${p.severity}] ${p.name}: ${p.interpretation?.slice(0, 40)}...`
        )
        .join('\n');
      return {
        success: true,
        output: `Patterns detected (${patterns.length}):\n${list || '(none new)'}`,
        data: patterns.slice(0, 10),
      };
    } catch (err) {
      return {
        success: false,
        output: `Analyze failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'generateInsights') {
    try {
      const insights = generateSelfInsights();
      const list = insights
        .slice(0, 10)
        .map((i) => `• ${i.insight?.slice(0, 50)}...`)
        .join('\n');
      return {
        success: true,
        output: `Insights generated (${insights.length}):\n${list || '(none new)'}`,
        data: insights.slice(0, 10),
      };
    } catch (err) {
      return {
        success: false,
        output: `Generate insights failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listPatterns') {
    const severity = params.severity as string;
    const acknowledged = params.acknowledged as boolean;
    const patterns = getSelfPatterns(
      severity as 'info' | 'noteworthy' | 'concerning' | 'critical',
      acknowledged
    );
    const list = patterns
      .slice(0, 15)
      .map((p) => `• [${p.severity}] ${p.name}${p.acknowledged ? ' ✓' : ''}`)
      .join('\n');
    return {
      success: true,
      output: `Patterns (${patterns.length}):\n${list || '(none)'}`,
      data: patterns.slice(0, 15),
    };
  }

  if (action === 'listInsights') {
    const applied = params.applied as boolean | undefined;
    const insights = getSelfInsights(applied);
    const list = insights
      .slice(0, 10)
      .map((i) => `• ${i.insight?.slice(0, 50)}...${i.applied ? ' ✓' : ''}`)
      .join('\n');
    return {
      success: true,
      output: `Insights (${insights.length}):\n${list || '(none)'}`,
      data: insights.slice(0, 10),
    };
  }

  if (action === 'acknowledgePattern') {
    const patternId = params.patternId as string;
    if (!patternId) return { success: false, output: 'Missing: patternId' };
    const acknowledged = acknowledgePattern(patternId);
    return {
      success: acknowledged,
      output: acknowledged ? 'Pattern acknowledged' : 'Pattern not found',
    };
  }

  if (action === 'applyInsight') {
    const insightId = params.insightId as string;
    if (!insightId) return { success: false, output: 'Missing: insightId' };
    const applied = applySelfInsight(insightId);
    return {
      success: applied,
      output: applied ? 'Insight applied' : 'Insight not found',
    };
  }

  if (action === 'recentObservations') {
    const type = params.type as ObservationType | undefined;
    const limit = (params.limit as number) || 20;
    const observations = getRecentObservations(type, limit);
    const list = observations
      .slice(0, 15)
      .map((o) => `• [${o.type}] ${o.subject}`)
      .join('\n');
    return {
      success: true,
      output: `Recent observations (${observations.length}):\n${list || '(none)'}`,
      data: observations.slice(0, 15),
    };
  }

  if (action === 'runCycle') {
    try {
      const result = await runSelfObservationCycle();
      return {
        success: true,
        output: `Self-observation cycle complete: ${result.newPatterns} new patterns, ${result.newInsights} new insights${result.concerns?.length ? `, ${result.concerns.length} concerns` : ''}`,
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
      'Unknown selfObservation action. Use: status, record, observeTool, observeDecision, observeFailure, observeSuccess, analyzePatterns, generateInsights, listPatterns, listInsights, acknowledgePattern, applyInsight, recentObservations, runCycle',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Consciousness Monitor Tool — Awareness Tracking
// ════════════════════════════════════════════════════════════════════════════

export const consciousnessMonitor: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'status') {
    try {
      const status = getConsciousnessStatus();
      return {
        success: true,
        output: `Consciousness: ${status.currentLevel} (${(status.averageAwareness * 100).toFixed(0)}% awareness), ${status.snapshotCount} snapshots, ${status.insightCount} insights`,
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'snapshot') {
    const activeTask = params.activeTask as string;
    try {
      const snapshot = takeConsciousnessSnapshot(activeTask);
      return {
        success: true,
        output: `Snapshot taken: level=${snapshot.level}, awareness=${(snapshot.awareness * 100).toFixed(0)}%, attention=${(snapshot.attention * 100).toFixed(0)}%`,
        data: snapshot,
      };
    } catch (err) {
      return {
        success: false,
        output: `Snapshot failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'analyzeTrends') {
    const windowMinutes = (params.windowMinutes as number) || 60;
    try {
      const trends = analyzeTrends(windowMinutes);
      return {
        success: true,
        output: `Trends (${windowMinutes}min): awareness ${trends.awarenessChange > 0 ? '↑' : '↓'}${(Math.abs(trends.awarenessChange) * 100).toFixed(0)}%, attention ${trends.attentionChange > 0 ? '↑' : '↓'}${(Math.abs(trends.attentionChange) * 100).toFixed(0)}%`,
        data: trends,
      };
    } catch (err) {
      return {
        success: false,
        output: `Analyze trends failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'generateInsights') {
    try {
      const insights = generateConsciousnessInsights();
      const list = insights
        .slice(0, 5)
        .map((i) => `• [${i.type}] ${i.observation?.slice(0, 40)}...`)
        .join('\n');
      return {
        success: true,
        output: `Consciousness insights (${insights.length}):\n${list || '(none new)'}`,
        data: insights.slice(0, 5),
      };
    } catch (err) {
      return {
        success: false,
        output: `Generate insights failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listSnapshots') {
    const limit = (params.limit as number) || 20;
    const snapshots = getConsciousnessSnapshots(limit);
    const list = snapshots
      .slice(0, 10)
      .map(
        (s) =>
          `• ${s.level}: aw=${(s.awareness * 100).toFixed(0)}% att=${(s.attention * 100).toFixed(0)}%`
      )
      .join('\n');
    return {
      success: true,
      output: `Snapshots (${snapshots.length}):\n${list || '(none)'}`,
      data: snapshots.slice(0, 10),
    };
  }

  if (action === 'listInsights') {
    const insights = getConsciousnessInsights();
    const list = insights
      .slice(0, 10)
      .map((i) => `• [${i.type}] ${i.observation?.slice(0, 40)}...`)
      .join('\n');
    return {
      success: true,
      output: `Insights (${insights.length}):\n${list || '(none)'}`,
      data: insights.slice(0, 10),
    };
  }

  if (action === 'report') {
    try {
      const report = getConsciousnessReport();
      return {
        success: true,
        output: report,
      };
    } catch (err) {
      return {
        success: false,
        output: `Report failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'save') {
    try {
      await saveConsciousnessState();
      return { success: true, output: 'Consciousness state saved.' };
    } catch (err) {
      return {
        success: false,
        output: `Save failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'load') {
    try {
      await loadConsciousnessState();
      return { success: true, output: 'Consciousness state loaded.' };
    } catch (err) {
      return {
        success: false,
        output: `Load failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'reset') {
    resetConsciousnessState();
    return { success: true, output: 'Consciousness monitor reset.' };
  }

  return {
    success: false,
    output:
      'Unknown consciousnessMonitor action. Use: status, snapshot, analyzeTrends, generateInsights, listSnapshots, listInsights, report, save, load, reset',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Emotional State Tool — Affect Tracking
// ════════════════════════════════════════════════════════════════════════════

export const emotionalState: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'status' || action === 'current') {
    try {
      const state = getCurrentEmotionalStateImpl();
      return {
        success: true,
        output: `Emotional State: ${state.primary} (${(state.intensity * 100).toFixed(0)}% intensity), valence: ${state.valence > 0 ? '+' : ''}${(state.valence * 100).toFixed(0)}%, arousal: ${(state.arousal * 100).toFixed(0)}%`,
        data: state,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'history') {
    try {
      const history = getEmotionalHistory();
      const recent = history.states?.slice(-5) || [];
      const list = recent
        .map((s) => `• ${s.primary} (${(s.intensity * 100).toFixed(0)}%)`)
        .join('\n');
      return {
        success: true,
        output: `Emotional history (${history.states?.length || 0} states):\n${list || '(none)'}`,
        data: history,
      };
    } catch (err) {
      return {
        success: false,
        output: `History failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'update') {
    const emotion = params.emotion as EmotionType;
    const intensity = params.intensity as number;
    const trigger = params.trigger as string;
    if (!emotion) return { success: false, output: 'Missing: emotion' };
    try {
      await updateEmotionalStateImpl(
        emotion,
        intensity || 0.5,
        trigger || 'unspecified'
      );
      return {
        success: true,
        output: `Emotional state updated: ${emotion} (${((intensity || 0.5) * 100).toFixed(0)}%)`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Update failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'decay') {
    try {
      await decayEmotionalState();
      return {
        success: true,
        output: 'Emotional state decayed toward baseline.',
      };
    } catch (err) {
      return {
        success: false,
        output: `Decay failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'setBaseline') {
    const emotion = params.emotion as EmotionType;
    if (!emotion) return { success: false, output: 'Missing: emotion' };
    try {
      await setBaseline(emotion);
      return { success: true, output: `Baseline set to: ${emotion}` };
    } catch (err) {
      return {
        success: false,
        output: `Set baseline failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'context') {
    try {
      const context = buildEmotionalContext();
      return {
        success: true,
        output: context,
      };
    } catch (err) {
      return {
        success: false,
        output: `Build context failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'load') {
    try {
      await loadEmotionalState();
      return { success: true, output: 'Emotional state loaded.' };
    } catch (err) {
      return {
        success: false,
        output: `Load failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown emotionalState action. Use: status, current, history, update, decay, setBaseline, context, load',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Meta-Learning Tool — Learning to Learn
// ════════════════════════════════════════════════════════════════════════════

export const metaLearning: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'init' || action === 'load') {
    try {
      await loadMetaLearningState();
      return { success: true, output: 'Meta-learning state loaded.' };
    } catch (err) {
      return {
        success: false,
        output: `Load failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = getMetaLearningStatus();
      return {
        success: true,
        output: `Meta-Learning: ${status.strategyCount} strategies, ${status.learningEventCount} learning events, ${status.insightCount} insights (${status.unappliedInsightCount} unapplied)`,
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'registerStrategy') {
    const name = params.name as string;
    const domain = params.domain as StrategyDomain;
    const description = params.description as string;
    if (!name || !domain || !description)
      return { success: false, output: 'Missing: name, domain, description' };
    try {
      const strategy = await registerStrategy({
        name,
        domain,
        description,
        steps: (params.steps as string[]) || [],
        applicability: (params.applicability as string) || 'general',
      });
      return {
        success: true,
        output: `Strategy registered: "${name}" for ${domain}`,
        data: strategy,
      };
    } catch (err) {
      return {
        success: false,
        output: `Register failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getStrategy') {
    const id = params.id as string;
    if (!id) return { success: false, output: 'Missing: id' };
    const strategy = getStrategy(id);
    if (!strategy)
      return { success: false, output: `Strategy not found: ${id}` };
    return {
      success: true,
      output: `Strategy: ${strategy.name} (${strategy.domain})\n${strategy.description}\nSuccess rate: ${((strategy.successRate || 0) * 100).toFixed(0)}%`,
      data: strategy,
    };
  }

  if (action === 'listStrategies') {
    const domain = params.domain as StrategyDomain | undefined;
    const strategies = domain ? getStrategiesForDomain(domain) : [];
    const list = strategies
      .slice(0, 15)
      .map((s) => `• ${s.name}: ${(s.successRate || 0) * 100}% success`)
      .join('\n');
    return {
      success: true,
      output: `Strategies${domain ? ` (${domain})` : ''} (${strategies.length}):\n${list || '(none)'}`,
      data: strategies.slice(0, 15),
    };
  }

  if (action === 'getBestStrategy') {
    const domain = params.domain as StrategyDomain;
    const context = params.context as string;
    if (!domain) return { success: false, output: 'Missing: domain' };
    const strategy = getBestStrategy(domain, context || 'general');
    if (!strategy)
      return { success: false, output: 'No strategy found for this domain' };
    return {
      success: true,
      output: `Best strategy for ${domain}: "${strategy.name}" (${((strategy.successRate || 0) * 100).toFixed(0)}% success)`,
      data: strategy,
    };
  }

  if (action === 'recordLearning') {
    const strategyId = params.strategyId as string;
    const outcome = params.outcome as OutcomeType;
    const context = params.context as string;
    const lessons = params.lessons as string;
    if (!strategyId || !outcome)
      return { success: false, output: 'Missing: strategyId, outcome' };
    try {
      await recordLearning({
        strategyId,
        outcome,
        context: context || 'general',
        lessons: lessons || '',
      });
      return {
        success: true,
        output: `Learning recorded for strategy ${strategyId}: ${outcome}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Record learning failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'reflect') {
    try {
      const insights = await runMetaReflection();
      const list = insights
        .slice(0, 5)
        .map((i) => `• ${i.insight?.slice(0, 50)}...`)
        .join('\n');
      return {
        success: true,
        output: `Meta-reflection complete, ${insights.length} insights:\n${list || '(none new)'}`,
        data: insights.slice(0, 5),
      };
    } catch (err) {
      return {
        success: false,
        output: `Reflect failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listInsights') {
    const domain = params.domain as StrategyDomain | undefined;
    const insights = domain
      ? getInsightsForDomain(domain)
      : getUnappliedInsights();
    const list = insights
      .slice(0, 10)
      .map((i) => `• ${i.insight?.slice(0, 50)}...`)
      .join('\n');
    return {
      success: true,
      output: `Insights${domain ? ` (${domain})` : ' (unapplied)'} (${insights.length}):\n${list || '(none)'}`,
      data: insights.slice(0, 10),
    };
  }

  if (action === 'applyInsight') {
    const insightId = params.insightId as string;
    if (!insightId) return { success: false, output: 'Missing: insightId' };
    try {
      await applyMetaInsight(insightId);
      return { success: true, output: 'Insight applied.' };
    } catch (err) {
      return {
        success: false,
        output: `Apply insight failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'context') {
    try {
      const context = buildMetaLearningContext();
      return {
        success: true,
        output: context,
      };
    } catch (err) {
      return {
        success: false,
        output: `Build context failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown metaLearning action. Use: init, load, status, registerStrategy, getStrategy, listStrategies, getBestStrategy, recordLearning, reflect, listInsights, applyInsight, context',
  };
};

export const cognitionToolHandlers: Record<string, ToolHandler> = {
  selfArchitecture,
  socialCognition,
  uncertainty,
  horizonGoals,
  voiceControl,
  metacognition,
  selfNarrative,
  causalReasoning,
  transferLearning,
  goalEvolution,
  embodiedInteraction,
  socialIntelligence,
  selfModification,
  memoryConsolidation,
  worldModel,
  selfObservation,
  consciousnessMonitor,
  emotionalState,
  metaLearning,
};
