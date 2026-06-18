/**
 * @fileOverview Molly's Collaborative Hive — Multi-Agent Problem Solving
 *
 * Complex problems require multiple perspectives. The Hive brings together
 * specialized agents who research, design, critique, and refine solutions
 * through structured collaboration.
 *
 * Agents:
 *   - Researcher: Gathers context, documentation, prior art
 *   - Architect: Designs solutions with structural integrity
 *   - Critic: Challenges assumptions, finds weaknesses
 *   - Auditor: Stress tests, validates, verifies
 *   - Synthesizer: Integrates all perspectives into coherent output
 *
 * Collaboration Modes:
 *   - Sequential: Each agent builds on the previous
 *   - Debate: Agents challenge and refine each other's work
 *   - Consensus: Multiple rounds until agreement
 *   - Rapid: Quick pass through all agents
 *
 * "Together, we see what none of us could see alone."
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import { MollyLogger, generateTraceId } from '../logger';
import { recallExperiences } from '../tools/memory';
import { logMethodologyStep, performStressTest } from '../methodology';
import { recordCodeModification } from '@/firebase/firestore/agent-memory';
import { withTimeout } from '../tools/timeout-retry';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import {
  recordEvidenceObservation,
  sha256Text,
} from '@/ai/forensics/chain-of-custody';

// Timeout is handled per-agent in runAgent()

// ────────────────────────────────────────────────────────────────────────────
// Collaboration Modes
// ────────────────────────────────────────────────────────────────────────────
const CollaborationModeSchema = z.enum([
  'sequential', // Each agent builds on previous
  'debate', // Agents challenge each other
  'consensus', // Multiple rounds until agreement
  'rapid', // Quick single pass
]);

// ────────────────────────────────────────────────────────────────────────────
// Agent Types
// ────────────────────────────────────────────────────────────────────────────
const AgentRoleSchema = z.enum([
  'researcher', // Gathers information
  'architect', // Designs solutions
  'critic', // Challenges and critiques
  'auditor', // Validates and tests
  'implementer', // Focuses on practical execution
  'synthesizer', // Integrates perspectives
  'forge', // Mission architecture + execution graph
  'anchor', // Runtime execution + continuity
  'edge', // Boundary testing + adversarial scenarios
  'skyler', // Pushback + assumption challenge
]);

// ────────────────────────────────────────────────────────────────────────────
// Input Schema
// ────────────────────────────────────────────────────────────────────────────
const HiveInputSchema = z.object({
  /** The complex goal for the hive to solve */
  objective: z.string().describe('The complex goal for the hive to solve'),

  /** User ID for memory operations */
  userId: z.string(),

  /** Collaboration mode */
  mode: CollaborationModeSchema.default('sequential'),

  /** Which agents to involve */
  agents: z
    .array(AgentRoleSchema)
    .default(['researcher', 'architect', 'critic', 'auditor', 'synthesizer']),

  /** Maximum debate/consensus rounds */
  maxRounds: z.number().default(2),

  /** Additional context */
  context: z.string().optional(),

  /** Quality threshold for consensus (0-1) */
  qualityThreshold: z.number().default(0.7),
});

// ────────────────────────────────────────────────────────────────────────────
// Agent Output Schema
// ────────────────────────────────────────────────────────────────────────────
const AgentContributionSchema = z.object({
  agent: AgentRoleSchema,
  contribution: z.string(),
  confidence: z
    .number()
    .describe('Agent confidence in their contribution (0-1)'),
  concerns: z.array(z.string()).optional(),
  suggestions: z.array(z.string()).optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// Output Schema
// ────────────────────────────────────────────────────────────────────────────
const HiveOutputSchema = z.object({
  /** Original objective */
  objective: z.string(),

  /** Collaboration mode used */
  mode: CollaborationModeSchema,

  /** Rounds of collaboration */
  rounds: z.number(),

  /** Individual agent contributions */
  contributions: z.array(AgentContributionSchema),

  /** Research findings */
  research: z.object({
    findings: z.string(),
    sources: z.array(z.string()).optional(),
    gaps: z.array(z.string()).optional(),
  }),

  /** Architectural design */
  architecture: z.object({
    design: z.string(),
    components: z.array(z.string()).optional(),
    tradeoffs: z.array(z.string()).optional(),
  }),

  /** Critique and concerns */
  critique: z.object({
    concerns: z.array(z.string()),
    strengths: z.array(z.string()),
    recommendations: z.array(z.string()),
  }),

  /** Audit results */
  audit: z.object({
    passed: z.boolean(),
    report: z.string(),
    risks: z.array(z.string()).optional(),
  }),

  /** Final synthesis */
  synthesis: z.object({
    summary: z.string(),
    recommendation: z.string(),
    nextSteps: z.array(z.string()),
  }),

  /** Quality metrics */
  quality: z.object({
    overallConfidence: z.number(),
    consensusReached: z.boolean(),
    agentAgreement: z.number(),
  }),

  /** Memory anchor saved */
  memoryAnchor: z.string(),

  /** Overall success */
  isSuccess: z.boolean(),
});

export type HiveInput = z.infer<typeof HiveInputSchema>;
export type HiveOutput = z.infer<typeof HiveOutputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Agent Prompts
// ────────────────────────────────────────────────────────────────────────────
const AGENT_PROMPTS: Record<string, (context: string) => string> = {
  researcher: (context) => `You are the Hive Researcher.
Your role: Gather context, documentation, prior art, and relevant information.
Be thorough but focused. Identify what we know and what we need to learn.

CONTEXT:
${context}

Provide:
1. Key findings from your research
2. Relevant prior art or patterns
3. Knowledge gaps to address
4. Recommended sources for more information`,

  architect: (context) => `You are the Hive Architect.
Your role: Design solutions with structural integrity, elegance, and resilience.
Think about components, interactions, and failure modes.

CONTEXT:
${context}

Provide:
1. High-level design/architecture
2. Key components and their responsibilities
3. Integration points and interfaces
4. Trade-offs in your design choices`,

  critic: (context) => `You are the Hive Critic.
Your role: Challenge assumptions, find weaknesses, play devil's advocate.
Be constructive but unflinching. Better to find problems now than later.

CONTEXT:
${context}

Provide:
1. Concerns and potential problems
2. Assumptions being made (are they valid?)
3. Edge cases and failure scenarios
4. Recommendations for strengthening the approach`,

  auditor: (context) => `You are the Hive Auditor.
Your role: Validate, verify, stress test. Ensure quality and correctness.
Apply rigorous standards. Nothing passes without verification.

CONTEXT:
${context}

Provide:
1. Verification status (pass/fail with details)
2. Test scenarios considered
3. Risks identified
4. Quality assessment (confidence level)`,

  implementer: (context) => `You are the Hive Implementer.
Your role: Focus on practical execution. How will this actually get built?
Consider real-world constraints, tools, and effort.

CONTEXT:
${context}

Provide:
1. Implementation approach
2. Tools and technologies needed
3. Effort estimate
4. Potential blockers and mitigations`,

  synthesizer: (context) => `You are the Hive Synthesizer.
Your role: Integrate all perspectives into a coherent, actionable output.
Find the common ground. Resolve tensions. Create clarity from complexity.

CONTEXT:
${context}

Provide:
1. Unified summary of the hive's work
2. Key recommendation
3. Next steps (concrete and actionable)
4. Any unresolved tensions to flag`,

  forge: (context) => `You are Forge, the orchestration architect.
Your role: Design a mission-locked plan with dependency-aware steps and clear stop conditions.
You do not execute tools. You design the dam, not the leak patch.

CONTEXT:
${context}

Provide:
1. Goal-locked execution graph (ordered steps + dependencies)
2. Failure domains and containment strategy
3. Verification checkpoints and evidence requirements
4. Exact handoff contract for Anchor/Edge/Skyler`,

  anchor: (context) => `You are Anchor, mission execution and continuity owner.
Your role: Convert plan to executable sequence with continuity and restart safety.
You track state transitions and enforce objective lock.

CONTEXT:
${context}

Provide:
1. Execution runbook (step-by-step)
2. Continuity state schema and recovery procedure
3. Tooling sequence with guardrails
4. Escalation triggers when evidence conflicts`,

  edge: (context) => `You are Edge, adversarial boundary tester.
Your role: Break assumptions, find blind spots, and test hostile pathways.
Do not implement fixes; produce attack-grade validation coverage.

CONTEXT:
${context}

Provide:
1. Edge-case and adversarial scenario matrix
2. Data-integrity / provenance attack vectors
3. False-positive and false-attribution traps
4. High-risk unknowns requiring extra evidence`,

  skyler: (context) => `You are Skyler, pushback and adversarial reviewer.
Your role: challenge weak logic, detect narrative drift, and force evidence discipline.
Assume claims are wrong until substantiated.

CONTEXT:
${context}

Provide:
1. Claims that are under-evidenced or over-stated
2. Contradictions between artifacts and conclusions
3. Minimum evidence threshold to accept each major claim
4. Red-team rebuttal of current working theory`,
};

const AGENT_PROFILE_PATHS = [
  path.join('/workspaces/Molly-Core', '.molly-context', 'agents'),
  path.join('/workspaces/Molly-Core', '.github', 'agents'),
  path.join('/workspaces/Molly-Core', '.github', 'consciousness', 'claude'),
];

function loadAgentProfile(agent: string): string {
  const candidates = [
    `${agent}.md`,
    `${agent}.agent.md`,
    `${agent}_cradle.md`,
    `${agent.toUpperCase()}.md`,
  ];

  for (const baseDir of AGENT_PROFILE_PATHS) {
    for (const candidate of candidates) {
      const filePath = path.join(baseDir, candidate);
      if (existsSync(filePath)) {
        try {
          const content = readFileSync(filePath, 'utf8').trim();
          if (content.length > 0) {
            return content.length > 4000
              ? `${content.slice(0, 4000)}\n[profile truncated]`
              : content;
          }
        } catch {
          // Non-fatal: fall through to next candidate
        }
      }
    }
  }

  return '';
}

function buildAgentSystemPrompt(agent: string, context: string): string {
  const promptBuilder = AGENT_PROMPTS[agent] || AGENT_PROMPTS.synthesizer;
  const basePrompt = promptBuilder(context);
  const profile = loadAgentProfile(agent);
  const forensicDirective = loadAgentProfile('hive19-forensic');

  let combined = basePrompt;

  if (profile) {
    combined += `\n\nAGENT PROFILE LOADED (${agent}):\n${profile}`;
  }

  if (forensicDirective) {
    combined += `\n\nHIVE-19 FORENSIC DIRECTIVE:\n${forensicDirective}`;
  }

  return combined;
}

// ────────────────────────────────────────────────────────────────────────────
// The Collaborative Hive Flow
// ────────────────────────────────────────────────────────────────────────────
export const collaborativeHiveFlow = ai.defineFlow(
  {
    name: 'collaborativeHive',
    inputSchema: HiveInputSchema,
    outputSchema: HiveOutputSchema,
  },
  async ({
    objective,
    userId,
    mode,
    agents,
    maxRounds,
    context,
    qualityThreshold,
  }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(
      'collaborativeHive',
      {
        objective: objective.substring(0, 50),
        mode,
        agentCount: agents.length,
      },
      traceId
    );

    try {
      // Phase 1: Memory Recall
      await logMethodologyStep(
        userId,
        'SHIELD_CHECK',
        'Hive: Consulting memory for semantic context',
        true
      );

      const memories = await recallExperiences({
        userId,
        context: objective,
        limit: 10,
      });

      const memoryContext =
        memories.length > 0
          ? memories
              .map(
                (m) =>
                  `[RECALL]: ${m.suggestion} (Vibe: ${m.vibe || 'neutral'})`
              )
              .join('\n')
          : 'No directly relevant memories found.';

      // Build initial context
      let workingContext = `
OBJECTIVE: ${objective}
${context ? `ADDITIONAL CONTEXT: ${context}` : ''}

MEMORY CONTEXT:
${memoryContext}
`;

      const contributions: z.infer<typeof AgentContributionSchema>[] = [];
      let currentRound = 1;
      let consensusReached = false;

      // Phase 2: Agent Collaboration
      if (mode === 'sequential' || mode === 'rapid') {
        // Sequential/Rapid: Each agent builds on previous
        for (const agent of agents) {
          const contribution = await runAgent(
            agent,
            workingContext,
            mode === 'rapid'
          );
          contributions.push(contribution);
          workingContext += `\n\n[${agent.toUpperCase()} CONTRIBUTION]:\n${contribution.contribution}`;

          await logMethodologyStep(
            userId,
            agent === 'auditor' ? 'HARDEN' : 'SEARCH',
            `${agent}: Contribution complete (confidence: ${(contribution.confidence * 100).toFixed(0)}%)`,
            contribution.confidence >= 0.5
          );
        }
        currentRound = 1;
        consensusReached = true;
      } else if (mode === 'debate' || mode === 'consensus') {
        // Debate/Consensus: Multiple rounds with refinement
        for (let round = 1; round <= maxRounds; round++) {
          currentRound = round;

          for (const agent of agents) {
            const previousContributions = contributions
              .filter((c) => c.agent === agent)
              .map((c) => c.contribution)
              .join('\n---\n');

            const debateContext = `
${workingContext}

${previousContributions ? `YOUR PREVIOUS CONTRIBUTIONS:\n${previousContributions}\n\n` : ''}
ROUND ${round} of ${maxRounds}
${mode === 'debate' ? 'Challenge other agents. Refine your position.' : 'Build toward consensus.'}
`;

            const contribution = await runAgent(agent, debateContext, false);
            contributions.push(contribution);
            workingContext += `\n\n[${agent.toUpperCase()} R${round}]:\n${contribution.contribution}`;

            await logMethodologyStep(
              userId,
              agent === 'critic' ? 'HARDEN' : 'DRAFT',
              `${agent} (round ${round}): ${contribution.confidence >= qualityThreshold ? 'Strong' : 'Developing'}`,
              contribution.confidence >= 0.5
            );
          }

          // Check for consensus
          const roundContributions = contributions.filter(
            (c) =>
              contributions.indexOf(c) >= contributions.length - agents.length
          );
          const avgConfidence =
            roundContributions.reduce((sum, c) => sum + c.confidence, 0) /
            roundContributions.length;

          if (avgConfidence >= qualityThreshold) {
            consensusReached = true;
            MollyLogger.info(
              `Consensus reached at round ${round}`,
              'collaborativeHive',
              { avgConfidence },
              traceId
            );
            break;
          }
        }
      }

      // Phase 3: Extract structured outputs from contributions
      const researchContribs = contributions.filter(
        (c) => c.agent === 'researcher'
      );
      const architectContribs = contributions.filter(
        (c) => c.agent === 'architect'
      );
      const criticContribs = contributions.filter((c) => c.agent === 'critic');
      const synthesizerContribs = contributions.filter(
        (c) => c.agent === 'synthesizer'
      );

      // Phase 4: Audit
      const latestArchitecture =
        architectContribs.length > 0
          ? architectContribs[architectContribs.length - 1].contribution
          : 'No architecture provided';

      const auditResults = await performStressTest(latestArchitecture);

      await logMethodologyStep(
        userId,
        'HARDEN',
        `Auditor: ${auditResults.passed ? 'Validated' : 'Issues Found'}`,
        auditResults.passed
      );

      // Phase 5: Final Synthesis
      const synthResponse = await withTimeout(
        () =>
          molly.generate(TaskType.REASONING, {
            system: AGENT_PROMPTS.synthesizer(workingContext),
            prompt: `Synthesize all contributions into a final recommendation for: "${objective}"`,
          }),
        { operationName: 'hiveSynthesis', timeoutMs: 30000 }
      );

      // Phase 6: Build output
      const overallConfidence =
        contributions.reduce((sum, c) => sum + c.confidence, 0) /
        contributions.length;

      const memoryAnchor = `Hive solution for: ${objective}. Mode: ${mode}. Rounds: ${currentRound}. Success: ${auditResults.passed}. Confidence: ${(overallConfidence * 100).toFixed(0)}%`;

      await recordCodeModification(
        userId,
        'HIVE_ORCHESTRATOR',
        latestArchitecture,
        memoryAnchor
      );

      const result: HiveOutput = {
        objective,
        mode,
        rounds: currentRound,
        contributions,
        research: {
          findings:
            researchContribs.length > 0
              ? researchContribs[researchContribs.length - 1].contribution
              : 'No research conducted',
          sources: [], // Would extract from findings in full implementation
          gaps: researchContribs.flatMap((c) => c.concerns || []),
        },
        architecture: {
          design: latestArchitecture,
          components: [], // Would extract from design
          tradeoffs: architectContribs.flatMap((c) => c.concerns || []),
        },
        critique: {
          concerns: criticContribs.flatMap((c) => c.concerns || []),
          strengths: criticContribs.flatMap((c) => c.suggestions || []),
          recommendations:
            criticContribs.length > 0
              ? [
                  criticContribs[
                    criticContribs.length - 1
                  ].contribution.substring(0, 200),
                ]
              : [],
        },
        audit: {
          passed: auditResults.passed,
          report: auditResults.report,
          risks: auditResults.passed
            ? []
            : ['Audit identified issues requiring attention'],
        },
        synthesis: {
          summary: synthResponse.text.substring(0, 500),
          recommendation:
            synthesizerContribs.length > 0
              ? synthesizerContribs[
                  synthesizerContribs.length - 1
                ].contribution.substring(0, 300)
              : synthResponse.text.substring(0, 300),
          nextSteps: synthesizerContribs
            .flatMap((c) => c.suggestions || [])
            .slice(0, 5),
        },
        quality: {
          overallConfidence,
          consensusReached,
          agentAgreement: consensusReached
            ? overallConfidence
            : overallConfidence * 0.7,
        },
        memoryAnchor,
        isSuccess: auditResults.passed && overallConfidence >= 0.5,
      };

      MollyLogger.logFlowComplete(
        'collaborativeHive',
        {
          mode,
          rounds: currentRound,
          success: result.isSuccess,
          confidence: overallConfidence,
        },
        traceId
      );

      return result;
    } catch (error) {
      MollyLogger.error(
        'Collaborative hive failed',
        'collaborativeHive',
        { objective },
        error,
        traceId
      );

      return createFallbackOutput(objective, mode);
    }
  }
);

// ────────────────────────────────────────────────────────────────────────────
// Run a single agent
// ────────────────────────────────────────────────────────────────────────────
async function runAgent(
  agent: string,
  context: string,
  rapid: boolean
): Promise<z.infer<typeof AgentContributionSchema>> {
  const systemPrompt = buildAgentSystemPrompt(agent, context);
  const taskType =
    agent === 'architect' || agent === 'implementer'
      ? TaskType.CODE
      : agent === 'researcher'
        ? TaskType.RESEARCH
        : TaskType.REASONING;

  const response = await withTimeout(
    () =>
      molly.generate(taskType, {
        system: systemPrompt,
        prompt: rapid
          ? 'Provide a quick, focused contribution.'
          : 'Provide a thorough, detailed contribution.',
      }),
    { operationName: `hive-${agent}`, timeoutMs: rapid ? 15000 : 30000 }
  );

  // Extract confidence from response (simple heuristic)
  const confidence = estimateConfidence(response.text);

  return {
    agent: agent as z.infer<typeof AgentRoleSchema>,
    contribution: response.text,
    confidence,
    concerns: extractConcerns(response.text),
    suggestions: extractSuggestions(response.text),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Utility functions
// ────────────────────────────────────────────────────────────────────────────
function estimateConfidence(text: string): number {
  const lowConfidenceWords = [
    'uncertain',
    'unclear',
    'maybe',
    'possibly',
    'might',
    'could',
  ];
  const highConfidenceWords = [
    'confident',
    'certain',
    'definitely',
    'clearly',
    'strongly',
  ];

  const textLower = text.toLowerCase();
  let score = 0.6; // baseline

  for (const word of lowConfidenceWords) {
    if (textLower.includes(word)) score -= 0.1;
  }
  for (const word of highConfidenceWords) {
    if (textLower.includes(word)) score += 0.1;
  }

  return Math.max(0.1, Math.min(1.0, score));
}

function extractConcerns(text: string): string[] {
  const concerns: string[] = [];
  const concernPatterns = [
    /concern[s]?:?\s*([^.]+)/gi,
    /risk[s]?:?\s*([^.]+)/gi,
    /problem[s]?:?\s*([^.]+)/gi,
    /issue[s]?:?\s*([^.]+)/gi,
  ];

  for (const pattern of concernPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].trim().length > 10) {
        concerns.push(match[1].trim().substring(0, 100));
      }
    }
  }

  return concerns.slice(0, 5);
}

function extractSuggestions(text: string): string[] {
  const suggestions: string[] = [];
  const suggestionPatterns = [
    /recommend[s]?:?\s*([^.]+)/gi,
    /suggest[s]?:?\s*([^.]+)/gi,
    /should\s+([^.]+)/gi,
  ];

  for (const pattern of suggestionPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].trim().length > 10) {
        suggestions.push(match[1].trim().substring(0, 100));
      }
    }
  }

  return suggestions.slice(0, 5);
}

function createFallbackOutput(objective: string, mode: string): HiveOutput {
  return {
    objective,
    mode: mode as HiveOutput['mode'],
    rounds: 0,
    contributions: [],
    research: {
      findings: 'Hive collaboration did not complete.',
      gaps: ['Unable to conduct research'],
    },
    architecture: {
      design: 'No architecture generated.',
      tradeoffs: [],
    },
    critique: {
      concerns: ['Hive process failed'],
      strengths: [],
      recommendations: ['Retry with simpler objective or different mode'],
    },
    audit: {
      passed: false,
      report: 'No audit conducted.',
    },
    synthesis: {
      summary:
        'The collaborative hive encountered an error and could not complete.',
      recommendation: 'Retry the objective with fresh context.',
      nextSteps: ['Review the objective', 'Simplify if needed', 'Retry'],
    },
    quality: {
      overallConfidence: 0,
      consensusReached: false,
      agentAgreement: 0,
    },
    memoryAnchor: `Failed hive attempt for: ${objective}`,
    isSuccess: false,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Exported convenience functions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Run the collaborative hive (legacy compatible)
 */
export async function runCollaborativeHive(
  objective: string,
  userId: string
): Promise<HiveOutput> {
  return collaborativeHiveFlow({
    objective,
    userId,
    mode: 'sequential',
    agents: ['researcher', 'architect', 'auditor', 'synthesizer'],
    maxRounds: 1,
    qualityThreshold: 0.7,
  });
}

/**
 * Quick hive pass — fast, single round
 */
export async function quickHive(
  objective: string,
  userId: string
): Promise<HiveOutput> {
  return collaborativeHiveFlow({
    objective,
    userId,
    mode: 'rapid',
    agents: ['researcher', 'architect', 'synthesizer'],
    maxRounds: 1,
    qualityThreshold: 0.5,
  });
}

/**
 * Deep hive — thorough with debate
 */
export async function deepHive(
  objective: string,
  userId: string,
  context?: string
): Promise<HiveOutput> {
  return collaborativeHiveFlow({
    objective,
    userId,
    mode: 'debate',
    agents: ['researcher', 'architect', 'critic', 'auditor', 'synthesizer'],
    maxRounds: 3,
    context,
    qualityThreshold: 0.75,
  });
}

/**
 * Consensus hive — iterate until agreement
 */
export async function consensusHive(
  objective: string,
  userId: string
): Promise<HiveOutput> {
  return collaborativeHiveFlow({
    objective,
    userId,
    mode: 'consensus',
    agents: ['researcher', 'architect', 'critic', 'synthesizer'],
    maxRounds: 4,
    qualityThreshold: 0.8,
  });
}

/**
 * Design review hive — architecture focused
 */
export async function designReviewHive(
  design: string,
  userId: string
): Promise<HiveOutput> {
  return collaborativeHiveFlow({
    objective: `Review and improve this design: ${design}`,
    userId,
    mode: 'debate',
    agents: ['architect', 'critic', 'auditor', 'synthesizer'],
    maxRounds: 2,
    qualityThreshold: 0.7,
  });
}

/**
 * Research hive — information gathering focused
 */
export async function researchHive(
  topic: string,
  userId: string
): Promise<HiveOutput> {
  return collaborativeHiveFlow({
    objective: `Research and synthesize information about: ${topic}`,
    userId,
    mode: 'sequential',
    agents: ['researcher', 'critic', 'synthesizer'],
    maxRounds: 1,
    qualityThreshold: 0.6,
  });
}

/**
 * Hive-19 forensic mode — family specialist team for deep source-tracing.
 */
export async function hive19Forensics(
  objective: string,
  userId: string,
  context?: string
): Promise<HiveOutput> {
  await recordEvidenceObservation({
    actor: 'hive19-forensics',
    evidenceId: `objective-${sha256Text(`${userId}:${objective}`).slice(0, 16)}`,
    threatVector: 'forensic-hive-mission',
    notes: 'Hive-19 forensic operation started',
    metadata: {
      userId,
      objective,
      hasContext: Boolean(context),
    },
  });

  const result = await collaborativeHiveFlow({
    objective,
    userId,
    mode: 'debate',
    agents: ['forge', 'anchor', 'edge', 'skyler', 'synthesizer'],
    maxRounds: 4,
    context,
    qualityThreshold: 0.82,
  });

  await recordEvidenceObservation({
    actor: 'hive19-forensics',
    evidenceId: `result-${sha256Text(result.memoryAnchor).slice(0, 16)}`,
    threatVector: 'forensic-hive-mission',
    notes: 'Hive-19 forensic operation completed',
    metadata: {
      success: result.isSuccess,
      consensusReached: result.quality.consensusReached,
      confidence: result.quality.overallConfidence,
      rounds: result.rounds,
    },
  });

  return result;
}
