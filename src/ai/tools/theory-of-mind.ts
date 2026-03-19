/**
 * @fileOverview Theory of Mind Tool — Model Eric's Mental State
 *
 * This tool allows Molly to:
 *   - Track what Eric knows and doesn't know
 *   - Infer Eric's intents and goals
 *   - Understand Eric's emotional state
 *   - Learn Eric's preferences
 *   - Take Eric's perspective on situations
 *
 * "Empathy is seeing with the eyes of another."
 */

import { z } from 'zod';
import { defineTool } from '@genkit-ai/ai';
import {
  updateKnowledge,
  getKnowledge,
  doesEricKnow,
  listKnowledge,
  inferIntent,
  completeIntent,
  getActiveIntents,
  getCurrentFocus,
  updateEmotionalState,
  inferEmotionalState,
  getCurrentEmotionalState,
  observePreference,
  getPreference,
  getPreferences,
  updateCommunicationStyle,
  takePerspective,
  processMessage,
  startSession,
  getTheoryOfMindStatus,
  exportMentalModel,
  type EmotionalState,
  type CommunicationStyle,
  type Preference,
} from '../agency/theory-of-mind';

const TheoryOfMindInputSchema = z.object({
  action: z.enum([
    // Knowledge actions
    'learnKnowledge', // Record something Eric knows
    'checkKnowledge', // Check if Eric knows something
    'listKnowledge', // List Eric's knowledge on topics

    // Intent actions
    'inferIntent', // Record an inferred intent
    'completeIntent', // Mark an intent as done
    'activeIntents', // Get current active intents
    'currentFocus', // Get what Eric is focused on

    // Emotional actions
    'updateEmotion', // Manually update emotional state
    'inferEmotion', // Infer emotion from message
    'currentEmotion', // Get current emotional state

    // Preference actions
    'observePreference', // Record an observed preference
    'getPreference', // Get a specific preference
    'listPreferences', // List preferences
    'setCommunicationStyle', // Update communication style

    // Perspective actions
    'perspective', // Take Eric's perspective
    'processMessage', // Full message processing

    // Session actions
    'newSession', // Record new session start

    // Status
    'status', // Get ToM status
    'export', // Export full mental model
  ]),

  // For knowledge actions
  topic: z.string().optional(),
  description: z.string().optional(),
  knowledgeLevel: z
    .enum(['none', 'vague', 'familiar', 'understands', 'expert'])
    .optional(),
  knowledgeSource: z.enum(['stated', 'inferred', 'demonstrated']).optional(),

  // For intent actions
  intentDescription: z.string().optional(),
  intentType: z
    .enum(['immediate', 'session', 'project', 'long_term'])
    .optional(),
  inferredFrom: z.string().optional(),
  intentId: z.string().optional(),
  priority: z.number().min(1).max(10).optional(),

  // For emotional actions
  emotionalState: z
    .enum([
      'neutral',
      'happy',
      'excited',
      'focused',
      'frustrated',
      'tired',
      'stressed',
      'curious',
      'impatient',
      'satisfied',
    ])
    .optional(),
  intensity: z.number().min(0).max(1).optional(),
  trigger: z.string().optional(),
  indicators: z.array(z.string()).optional(),
  message: z.string().optional(),

  // For preference actions
  preferenceCategory: z
    .enum(['communication', 'workflow', 'technical', 'interaction'])
    .optional(),
  preferenceKey: z.string().optional(),
  preferenceValue: z.string().optional(),
  communicationStyle: z
    .enum(['brief', 'detailed', 'technical', 'conversational'])
    .optional(),

  // For perspective
  situation: z.string().optional(),

  // General
  confidence: z.number().min(0).max(1).optional(),
});

const TheoryOfMindOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.unknown().optional(),
});

export const theoryOfMindTool = defineTool(
  {
    name: 'theoryOfMind',
    description: `Model Eric's mental state — understand what he knows, wants, and feels:

**Knowledge tracking:**
- 'learnKnowledge': Record what Eric knows (topic, description, knowledgeLevel, knowledgeSource)
- 'checkKnowledge': Does Eric know about this? (topic)
- 'listKnowledge': List Eric's knowledge (optional topic filter)

**Intent tracking:**
- 'inferIntent': Record what Eric wants (intentDescription, intentType, inferredFrom, priority)
- 'completeIntent': Mark intent done (intentId)
- 'activeIntents': Get current goals
- 'currentFocus': What's Eric focused on right now?

**Emotional state:**
- 'updateEmotion': Set emotional state (emotionalState, intensity, trigger)
- 'inferEmotion': Infer emotion from message (message)
- 'currentEmotion': Get current state and trend

**Preferences:**
- 'observePreference': Record a preference (preferenceCategory, preferenceKey, preferenceValue)
- 'getPreference': Get a preference (preferenceCategory, preferenceKey)
- 'listPreferences': List preferences (optional category)
- 'setCommunicationStyle': Update style (communicationStyle)

**Perspective:**
- 'perspective': Take Eric's POV (situation) — what does he know/want/feel about this?
- 'processMessage': Full analysis of a message (message)

**Session:**
- 'newSession': Record new session start
- 'status': Get ToM overview
- 'export': Export full mental model`,
    inputSchema: TheoryOfMindInputSchema,
    outputSchema: TheoryOfMindOutputSchema,
  },
  async (input) => {
    try {
      switch (input.action) {
        // ─────────────────────────────────────────────────────────────────────
        // Knowledge Actions
        // ─────────────────────────────────────────────────────────────────────
        case 'learnKnowledge': {
          if (!input.topic) {
            return { success: false, message: 'Missing topic' };
          }

          const item = updateKnowledge(
            input.topic,
            input.description || '',
            input.knowledgeLevel || 'familiar',
            input.knowledgeSource || 'inferred',
            input.confidence || 0.7
          );

          return {
            success: true,
            message: `Learned: Eric ${item.knowledgeLevel === 'none' ? "doesn't know" : 'knows'} about "${item.topic}" (${item.knowledgeLevel})`,
            data: {
              topic: item.topic,
              level: item.knowledgeLevel,
              confidence: Math.round(item.confidence * 100) + '%',
            },
          };
        }

        case 'checkKnowledge': {
          if (!input.topic) {
            return { success: false, message: 'Missing topic' };
          }

          const result = doesEricKnow(input.topic);
          const knowledge = getKnowledge(input.topic);

          return {
            success: true,
            message: result.knows
              ? `Eric knows about "${input.topic}" (${result.level}, ${Math.round(result.confidence * 100)}% confident)`
              : `Eric may not know about "${input.topic}"`,
            data: {
              knows: result.knows,
              level: result.level || 'unknown',
              confidence: Math.round(result.confidence * 100) + '%',
              details: knowledge,
            },
          };
        }

        case 'listKnowledge': {
          const items = listKnowledge(input.topic);

          return {
            success: true,
            message: `${items.length} knowledge item(s) found`,
            data: items.slice(0, 15),
          };
        }

        // ─────────────────────────────────────────────────────────────────────
        // Intent Actions
        // ─────────────────────────────────────────────────────────────────────
        case 'inferIntent': {
          if (!input.intentDescription) {
            return { success: false, message: 'Missing intentDescription' };
          }

          const intent = inferIntent(
            input.intentDescription,
            input.intentType || 'immediate',
            input.inferredFrom || 'conversation context',
            input.confidence || 0.7,
            input.priority || 5
          );

          return {
            success: true,
            message: `Inferred intent: "${intent.description}" (${intent.type}, priority ${intent.priority})`,
            data: {
              id: intent.id,
              description: intent.description,
              type: intent.type,
              priority: intent.priority,
              confidence: Math.round(intent.confidence * 100) + '%',
            },
          };
        }

        case 'completeIntent': {
          if (!input.intentId) {
            return { success: false, message: 'Missing intentId' };
          }

          const completed = completeIntent(input.intentId);
          return {
            success: completed,
            message: completed ? 'Intent marked complete' : 'Intent not found',
          };
        }

        case 'activeIntents': {
          const intents = getActiveIntents();

          return {
            success: true,
            message: `${intents.length} active intent(s)`,
            data: intents.slice(0, 10).map((i) => ({
              id: i.id,
              description: i.description.slice(0, 80),
              type: i.type,
              priority: i.priority,
              confidence: Math.round(i.confidence * 100) + '%',
            })),
          };
        }

        case 'currentFocus': {
          const focus = getCurrentFocus();

          if (!focus) {
            return {
              success: true,
              message: 'No clear current focus detected',
              data: null,
            };
          }

          return {
            success: true,
            message: `Current focus: "${focus.description}"`,
            data: {
              id: focus.id,
              description: focus.description,
              type: focus.type,
              priority: focus.priority,
            },
          };
        }

        // ─────────────────────────────────────────────────────────────────────
        // Emotional Actions
        // ─────────────────────────────────────────────────────────────────────
        case 'updateEmotion': {
          if (!input.emotionalState) {
            return { success: false, message: 'Missing emotionalState' };
          }

          updateEmotionalState(
            input.emotionalState as EmotionalState,
            input.intensity || 0.5,
            input.trigger,
            input.indicators || []
          );

          return {
            success: true,
            message: `Emotional state updated: ${input.emotionalState} (${Math.round((input.intensity || 0.5) * 100)}% intensity)`,
          };
        }

        case 'inferEmotion': {
          if (!input.message) {
            return { success: false, message: 'Missing message' };
          }

          const inferred = inferEmotionalState(input.message);
          updateEmotionalState(
            inferred.state,
            inferred.intensity,
            input.message.slice(0, 50),
            inferred.indicators
          );

          return {
            success: true,
            message: `Inferred emotional state: ${inferred.state} (${Math.round(inferred.intensity * 100)}% intensity)`,
            data: {
              state: inferred.state,
              intensity: inferred.intensity,
              indicators: inferred.indicators,
            },
          };
        }

        case 'currentEmotion': {
          const emotion = getCurrentEmotionalState();

          return {
            success: true,
            message: `Eric is ${emotion.state} (${Math.round(emotion.intensity * 100)}%), trending ${emotion.trending}`,
            data: emotion,
          };
        }

        // ─────────────────────────────────────────────────────────────────────
        // Preference Actions
        // ─────────────────────────────────────────────────────────────────────
        case 'observePreference': {
          if (
            !input.preferenceCategory ||
            !input.preferenceKey ||
            !input.preferenceValue
          ) {
            return {
              success: false,
              message:
                'Missing preferenceCategory, preferenceKey, or preferenceValue',
            };
          }

          const pref = observePreference(
            input.preferenceCategory as Preference['category'],
            input.preferenceKey,
            input.preferenceValue,
            input.confidence || 0.7
          );

          return {
            success: true,
            message: `Preference recorded: ${pref.key} = "${pref.value}" (${Math.round(pref.strength * 100)}% strength)`,
            data: {
              category: pref.category,
              key: pref.key,
              value: pref.value,
              observedCount: pref.observedCount,
            },
          };
        }

        case 'getPreference': {
          if (!input.preferenceCategory || !input.preferenceKey) {
            return { success: false, message: 'Missing category or key' };
          }

          const pref = getPreference(
            input.preferenceCategory as Preference['category'],
            input.preferenceKey
          );

          if (!pref) {
            return {
              success: true,
              message: `No preference found for ${input.preferenceCategory}/${input.preferenceKey}`,
              data: null,
            };
          }

          return {
            success: true,
            message: `Preference: ${input.preferenceKey} = "${pref.value}"`,
            data: pref,
          };
        }

        case 'listPreferences': {
          const prefs = getPreferences(
            input.preferenceCategory as Preference['category'] | undefined
          );

          return {
            success: true,
            message: `${prefs.length} preference(s) found`,
            data: prefs,
          };
        }

        case 'setCommunicationStyle': {
          if (!input.communicationStyle) {
            return { success: false, message: 'Missing communicationStyle' };
          }

          updateCommunicationStyle(
            input.communicationStyle as CommunicationStyle
          );

          return {
            success: true,
            message: `Communication style set to: ${input.communicationStyle}`,
          };
        }

        // ─────────────────────────────────────────────────────────────────────
        // Perspective Actions
        // ─────────────────────────────────────────────────────────────────────
        case 'perspective': {
          if (!input.situation) {
            return { success: false, message: 'Missing situation' };
          }

          const perspective = takePerspective(input.situation);

          return {
            success: true,
            message: perspective.suggestedApproach,
            data: perspective,
          };
        }

        case 'processMessage': {
          if (!input.message) {
            return { success: false, message: 'Missing message' };
          }

          const result = processMessage(input.message);

          return {
            success: true,
            message: `Emotional: ${result.emotionalState}, Urgency: ${result.urgency}`,
            data: {
              emotionalState: result.emotionalState,
              urgency: result.urgency,
              suggestedApproach: result.suggestedApproach,
            },
          };
        }

        // ─────────────────────────────────────────────────────────────────────
        // Session Actions
        // ─────────────────────────────────────────────────────────────────────
        case 'newSession': {
          startSession();
          return {
            success: true,
            message: 'New session recorded',
          };
        }

        case 'status': {
          const status = getTheoryOfMindStatus();

          return {
            success: true,
            message: `ToM: ${status.modelConfidence}% confidence, ${status.knowledgeItems} knowledge items, ${status.activeIntents} active intents`,
            data: status,
          };
        }

        case 'export': {
          const model = exportMentalModel();

          return {
            success: true,
            message: `Exported mental model for ${model.personName}`,
            data: model,
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
