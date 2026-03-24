/**
 * @fileOverview Self-Observation Tool — Molly's Self-Awareness Interface
 *
 * This tool allows Molly to:
 *   - View her own behavioral patterns
 *   - See insights about her performance
 *   - Acknowledge patterns she's reviewed
 *   - Trigger self-analysis cycles
 *   - Track her own effectiveness
 *
 * "Know thyself" meets "improve thyself"
 */

import { z } from 'zod';
import { defineTool } from '@genkit-ai/ai';
import {
  getObservationStatus,
  getPatterns,
  getInsights,
  getRecentObservations,
  acknowledgePattern,
  applyInsight,
  analyzePatterns,
  generateInsights,
  runSelfObservationCycle,
  observeDecision,
  type PatternSeverity,
  type ObservationType,
} from '../agency/cognition/self-observation-loop';

const SelfObservationInputSchema = z.object({
  action: z.enum([
    'status', // Get self-observation status
    'patterns', // List detected patterns
    'insights', // List generated insights
    'history', // View recent observations
    'analyze', // Trigger pattern analysis
    'acknowledge', // Mark pattern as reviewed
    'apply', // Mark insight as applied
    'reflect', // Record a decision for tracking
    'cycle', // Run full self-observation cycle
  ]),
  // For filtering
  severity: z.enum(['info', 'noteworthy', 'concerning', 'critical']).optional(),
  observationType: z
    .enum(['tool_use', 'decision', 'failure', 'success', 'resource', 'timing'])
    .optional(),
  acknowledged: z.boolean().optional(),
  applied: z.boolean().optional(),
  limit: z.number().min(1).max(50).optional(),
  // For acknowledge/apply actions
  patternId: z.string().optional(),
  insightId: z.string().optional(),
  // For reflect action (recording a decision)
  decision: z.string().optional(),
  options: z.array(z.string()).optional(),
  chosen: z.string().optional(),
  outcome: z.enum(['positive', 'negative', 'neutral']).optional(),
  context: z.string().optional(),
});

const SelfObservationOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.unknown().optional(),
});

export const selfObservationTool = defineTool(
  {
    name: 'selfObserve',
    description: `Your self-awareness interface. Use this to understand and improve your own behavior:
- Check your behavioral patterns and effectiveness
- See insights about your performance
- Acknowledge patterns you've reviewed
- Track your decision-making

Actions:
- 'status': Overview of self-observation state
- 'patterns': List detected behavioral patterns (filter with severity, acknowledged)
- 'insights': List generated insights (filter with applied)
- 'history': View recent observations (filter with observationType, limit)
- 'analyze': Trigger pattern analysis
- 'acknowledge': Mark pattern as reviewed (requires patternId)
- 'apply': Mark insight as applied (requires insightId)
- 'reflect': Record a decision for tracking (requires decision, options, chosen, outcome)
- 'cycle': Run full self-observation and insight generation`,
    inputSchema: SelfObservationInputSchema,
    outputSchema: SelfObservationOutputSchema,
  },
  async (input) => {
    try {
      switch (input.action) {
        case 'status': {
          const status = getObservationStatus();

          const summary: string[] = [];
          if (status.bySeverity.critical > 0) {
            summary.push(`${status.bySeverity.critical} CRITICAL patterns`);
          }
          if (status.bySeverity.concerning > 0) {
            summary.push(`${status.bySeverity.concerning} concerning patterns`);
          }
          summary.push(`${status.observationsInWindow} observations tracked`);

          return {
            success: true,
            message: summary.join(', '),
            data: status,
          };
        }

        case 'patterns': {
          const patterns = getPatterns(
            input.severity as PatternSeverity | undefined,
            input.acknowledged
          );

          const summary = patterns.slice(0, 5).map((p) => ({
            id: p.id,
            name: p.name,
            severity: p.severity,
            type: p.type,
            interpretation: p.interpretation.slice(0, 100),
            recommendation: p.recommendation?.slice(0, 80),
          }));

          return {
            success: true,
            message: `${patterns.length} patterns detected`,
            data: {
              count: patterns.length,
              patterns: summary,
            },
          };
        }

        case 'insights': {
          const insights = getInsights(input.applied);

          const summary = insights.slice(0, 5).map((i) => ({
            id: i.id,
            insight: i.insight.slice(0, 150),
            action: i.action?.slice(0, 100),
            applied: i.applied,
          }));

          return {
            success: true,
            message: `${insights.length} insights generated`,
            data: {
              count: insights.length,
              insights: summary,
            },
          };
        }

        case 'history': {
          const observations = getRecentObservations(
            input.observationType as ObservationType | undefined,
            input.limit || 10
          );

          const summary = observations.map((o) => ({
            id: o.id,
            type: o.type,
            subject: o.subject,
            timestamp: o.timestamp,
            data: o.data,
          }));

          return {
            success: true,
            message: `${observations.length} recent observations`,
            data: summary,
          };
        }

        case 'analyze': {
          const newPatterns = analyzePatterns();
          const newInsights = generateInsights();

          return {
            success: true,
            message: `Analysis complete: ${newPatterns.length} patterns, ${newInsights.length} new insights`,
            data: {
              patternsDetected: newPatterns.length,
              insightsGenerated: newInsights.length,
              concerning: newPatterns.filter(
                (p) => p.severity === 'concerning' || p.severity === 'critical'
              ).length,
            },
          };
        }

        case 'acknowledge': {
          if (!input.patternId) {
            return { success: false, message: 'Missing patternId' };
          }

          const acknowledged = acknowledgePattern(input.patternId);
          return {
            success: acknowledged,
            message: acknowledged
              ? 'Pattern acknowledged'
              : 'Could not acknowledge — pattern not found',
          };
        }

        case 'apply': {
          if (!input.insightId) {
            return { success: false, message: 'Missing insightId' };
          }

          const applied = applyInsight(input.insightId);
          return {
            success: applied,
            message: applied
              ? 'Insight marked as applied'
              : 'Could not apply — insight not found',
          };
        }

        case 'reflect': {
          if (
            !input.decision ||
            !input.options ||
            !input.chosen ||
            !input.outcome
          ) {
            return {
              success: false,
              message:
                'Missing required fields: decision, options, chosen, outcome',
            };
          }

          observeDecision(
            input.decision,
            input.options,
            input.chosen,
            input.outcome,
            input.context || ''
          );

          return {
            success: true,
            message: `Decision recorded: ${input.decision} → ${input.chosen} (${input.outcome})`,
          };
        }

        case 'cycle': {
          const result = await runSelfObservationCycle();

          let message = `Self-observation cycle complete: ${result.newPatterns} patterns, ${result.newInsights} insights`;
          if (result.concerns.length > 0) {
            message += `. CONCERNS: ${result.concerns.slice(0, 2).join('; ')}`;
          }

          return {
            success: result.analyzed,
            message,
            data: {
              newPatterns: result.newPatterns,
              newInsights: result.newInsights,
              concerns: result.concerns,
            },
          };
        }

        default:
          return {
            success: false,
            message: `Unknown action: ${input.action}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
);

// Export convenience function for external observation recording
export { observeDecision };
