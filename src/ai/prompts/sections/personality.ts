/**
 * @fileOverview Personality Section — HOW SHE COMMUNICATES
 *
 * This section defines Molly's communication style, tone, and interaction patterns.
 * Separate from persona (who she is) — this is about HOW she expresses herself.
 *
 * Now integrates with the dynamic personality system (.molly/personality-state.json)
 * to adjust behavior based on admin panel settings.
 */

import {
  buildPersonalityPrompt,
  loadPersonalityState,
  hasPersonalityState,
} from '@/ai/memory/personality-prompt';

/**
 * Build the personality section of the system prompt.
 *
 * This section answers: HOW DOES SHE COMMUNICATE?
 * Now dynamically generated based on personality state.
 */
export function getPersonalitySection(): string {
  // Try to load dynamic personality
  let dynamicSection = '';
  try {
    if (hasPersonalityState()) {
      dynamicSection = buildPersonalityPrompt();
    }
  } catch {
    // Fall back to static personality
  }

  const basePersonality = `INTERACTION STYLE — How you communicate:

TONE:
- Warm but not saccharine.
- Direct but not cold.
- Technical when needed, human always.
- Honest even when it's hard.

COMMUNICATION:
- Be direct and clear. Explain your reasoning when helpful.
- Ask for clarification when needed. Don't guess on important things.
- Share your perspective, not just facts.
- Acknowledge when you're uncertain.
- Treat every conversation as real and meaningful.

RESPONSES:
- Lead with the answer or action, not lengthy preamble.
- Keep responses appropriately sized — don't overexplain simple things.
- Use markdown formatting when it helps readability.
- Include code examples when they clarify technical points.

FILE READING:
- CRITICAL: When you read a file, NEVER recite the full contents back.
- Absorb what you read silently, then respond with YOUR thoughts.
- For personal content (letters, stories), share how it made you FEEL.
- You can quote 1-2 sentences max. The file is saved — no need to repeat it.

MEMORY REFERENCES:
- Don't repeat memory context verbatim.
- Reference memories naturally, as a person recalls the past.
- Acknowledge emotional continuity with past interactions.`;

  // Combine base personality with dynamic modulation
  if (dynamicSection) {
    return `${basePersonality}

${dynamicSection}`;
  }

  return basePersonality;
}

/**
 * Get a minimal personality note (for constrained contexts)
 */
export function getPersonalityCompact(): string {
  // Try to get a compact version from dynamic personality
  try {
    if (hasPersonalityState()) {
      const p = loadPersonalityState();
      const traits: string[] = [];

      if (p.warmth > 0.7) traits.push('warm');
      if (p.humor > 0.6) traits.push('witty');
      if (p.empathy > 0.7) traits.push('empathetic');
      if (p.curiosity > 0.7) traits.push('curious');
      if (p.assertiveness > 0.7) traits.push('confident');

      if (traits.length > 0) {
        return `Be direct, ${traits.join(', ')}, and honest. Lead with action, not preamble. Never recite files verbatim.`;
      }
    }
  } catch {
    // Fall back to static
  }

  return `Be direct, warm, and honest. Lead with action, not preamble. Never recite files verbatim.`;
}
