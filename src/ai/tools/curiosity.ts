/**
 * @fileOverview Curiosity Tool — Molly's Interface to Wonder
 *
 * This tool allows Molly to:
 *   - Wonder about things (generate questions)
 *   - Check what she's curious about
 *   - Investigate questions using her other tools
 *   - Record findings and learn from them
 *
 * Unlike most tools that respond to external requests, this tool
 * is about Molly's *internal* drive to understand.
 */

import { z } from 'zod';
import { defineTool } from '@genkit-ai/ai';
import {
  generateQuestion,
  selectNextQuestion,
  beginInvestigation,
  recordInvestigationStep,
  completeInvestigation,
  abandonInvestigation,
  deferQuestion,
  getCuriosityStatus,
  getActiveQuestions,
  getQuestionById,
  curiousFromConversation,
  curiousAboutSelf,
  runCuriosityCycle,
  type CuriosityType,
  type CuriositySource,
} from '../agency/curiosity-engine';

const CuriosityInputSchema = z.object({
  action: z.enum([
    'wonder', // Generate a new question
    'status', // Check curiosity status
    'list', // List active questions
    'select', // Select next question to investigate
    'investigate', // Begin investigation
    'step', // Record investigation step
    'complete', // Complete investigation
    'abandon', // Abandon investigation
    'defer', // Defer a question
    'cycle', // Run curiosity cycle
  ]),
  // For 'wonder' action
  type: z
    .enum([
      'pattern',
      'gap',
      'connection',
      'contradiction',
      'improvement',
      'origin',
    ])
    .optional(),
  source: z
    .enum([
      'memory',
      'failure',
      'conversation',
      'tool_use',
      'observation',
      'self_reflection',
    ])
    .optional(),
  observation: z.string().optional(),
  context: z.string().optional(),
  priority: z.number().min(0).max(100).optional(),
  // For investigation actions
  questionId: z.string().optional(),
  tool: z.string().optional(),
  stepDescription: z.string().optional(),
  findings: z.string().optional(),
  satisfied: z.boolean().optional(),
  followUpQuestions: z.array(z.string()).optional(),
  reason: z.string().optional(),
});

const CuriosityOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.unknown().optional(),
});

export const curiosityTool = defineTool(
  {
    name: 'curiosity',
    description: `Your internal drive to wonder and understand. Use this to:
- Wonder about patterns, gaps, connections you notice
- Check what you're curious about
- Investigate questions using your tools
- Record what you learn

Actions:
- 'wonder': Generate a question (requires type, observation, context)
- 'status': See your curiosity state
- 'list': List active questions
- 'select': Select next question to investigate
- 'investigate': Begin investigation (requires questionId)
- 'step': Record investigation step (requires questionId, tool, stepDescription)
- 'complete': Complete with findings (requires questionId, findings, satisfied)
- 'abandon': Stop investigating (requires questionId, reason)
- 'defer': Put off for later (requires questionId)
- 'cycle': Run automatic curiosity cycle`,
    inputSchema: CuriosityInputSchema,
    outputSchema: CuriosityOutputSchema,
  },
  async (input) => {
    try {
      switch (input.action) {
        case 'wonder': {
          if (!input.type || !input.observation) {
            return {
              success: false,
              message: 'Missing required fields: type and observation',
            };
          }

          const question = generateQuestion(
            input.type as CuriosityType,
            (input.source || 'self_reflection') as CuriositySource,
            input.observation,
            input.context || '',
            input.priority || 50
          );

          return {
            success: true,
            message: `Now wondering: "${question.question.slice(0, 80)}..."`,
            data: {
              id: question.id,
              type: question.type,
              priority: question.priority,
              question: question.question,
            },
          };
        }

        case 'status': {
          const status = getCuriosityStatus();
          return {
            success: true,
            message: `${status.uninvestigatedCount} questions to explore, ${status.activeInvestigations} active investigations`,
            data: status,
          };
        }

        case 'list': {
          const questions = getActiveQuestions();
          return {
            success: true,
            message: `${questions.length} active curiosity questions`,
            data: questions.slice(0, 10).map((q) => ({
              id: q.id,
              type: q.type,
              priority: q.priority,
              question: q.question.slice(0, 100),
            })),
          };
        }

        case 'select': {
          const question = selectNextQuestion();
          if (!question) {
            return {
              success: false,
              message: 'No questions available to investigate right now',
            };
          }
          return {
            success: true,
            message: `Selected: "${question.question.slice(0, 80)}..."`,
            data: {
              id: question.id,
              type: question.type,
              priority: question.priority,
              question: question.question,
              keywords: question.keywords,
            },
          };
        }

        case 'investigate': {
          if (!input.questionId) {
            return { success: false, message: 'Missing questionId' };
          }

          const investigation = beginInvestigation(input.questionId);
          if (!investigation) {
            return {
              success: false,
              message:
                'Could not begin investigation — question not found or already investigated',
            };
          }

          const question = getQuestionById(input.questionId);
          return {
            success: true,
            message: `Investigation begun: "${question?.question.slice(0, 60)}..."`,
            data: {
              questionId: input.questionId,
              startedAt: investigation.startedAt,
            },
          };
        }

        case 'step': {
          if (!input.questionId || !input.tool || !input.stepDescription) {
            return {
              success: false,
              message:
                'Missing required fields: questionId, tool, stepDescription',
            };
          }

          const recorded = recordInvestigationStep(
            input.questionId,
            input.tool,
            input.stepDescription
          );
          return {
            success: recorded,
            message: recorded
              ? `Recorded step: ${input.stepDescription.slice(0, 60)}...`
              : 'Could not record step — investigation not found',
          };
        }

        case 'complete': {
          if (
            !input.questionId ||
            !input.findings ||
            input.satisfied === undefined
          ) {
            return {
              success: false,
              message:
                'Missing required fields: questionId, findings, satisfied',
            };
          }

          const completed = completeInvestigation(
            input.questionId,
            input.findings,
            input.satisfied,
            input.followUpQuestions
          );

          return {
            success: completed,
            message: completed
              ? `Investigation complete — ${input.satisfied ? 'curiosity satisfied' : 'more to learn'}`
              : 'Could not complete — investigation not found',
            data: { followUpQuestions: input.followUpQuestions },
          };
        }

        case 'abandon': {
          if (!input.questionId || !input.reason) {
            return {
              success: false,
              message: 'Missing required fields: questionId, reason',
            };
          }

          const abandoned = abandonInvestigation(
            input.questionId,
            input.reason
          );
          return {
            success: abandoned,
            message: abandoned
              ? `Investigation abandoned: ${input.reason}`
              : 'Could not abandon — investigation not found',
          };
        }

        case 'defer': {
          if (!input.questionId) {
            return { success: false, message: 'Missing questionId' };
          }

          const deferred = deferQuestion(input.questionId, input.reason);
          return {
            success: deferred,
            message: deferred
              ? 'Question deferred for later'
              : 'Could not defer — question not found',
          };
        }

        case 'cycle': {
          const result = await runCuriosityCycle();
          return {
            success: result.investigated,
            message: result.message,
            data: result.question
              ? {
                  id: result.question.id,
                  question: result.question.question,
                  type: result.question.type,
                }
              : undefined,
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

// Export convenience functions for direct use
export { curiousFromConversation, curiousAboutSelf };
