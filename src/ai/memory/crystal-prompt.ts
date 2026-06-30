/**
 * Crystal Prompt — Brain Roadmap Item 4
 *
 * Formats the hot crystal set (cornerstones + recent memories) into a
 * system-prompt block, following the same pattern as buildFamilyKnowledgePrompt().
 *
 * Call this at session bootstrap alongside buildFamilyKnowledgePrompt() to give
 * Molly access to her crystallized memories without re-deriving them from Firestore
 * on every turn.
 *
 * Token budget: each crystal renders to ~3 lines. With maxHot=4 cornerstones + 4
 * recent crystals that is ~24 lines, well within system-prompt budget.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Minimal crystal shape accepted by the prompt builder (subset of MemoryCrystal). */
export interface PromptableCrystal {
  id: string;
  title: string;
  isCornerstone: boolean;
  totalSignificance: number;
  facets: {
    factual: { when: string; who: string[] };
    emotional: { primaryEmotion: string };
    relational?: { participants: string[] };
    transformative: { insightsGained: string[] };
    essential: { oneLineEssence: string };
  };
}

// ─── Formatter ───────────────────────────────────────────────────────────────

function formatCrystal(c: PromptableCrystal): string {
  const who = (c.facets.relational?.participants ?? c.facets.factual.who)
    .slice(0, 3)
    .join(', ');
  const insight = c.facets.transformative.insightsGained[0] ?? '';
  const context = [c.facets.factual.when, who].filter(Boolean).join(' · ');

  let line = `- ${c.title}: ${c.facets.essential.oneLineEssence}`;
  if (context)
    line += `\n  (${c.facets.emotional.primaryEmotion}${context ? ' · ' + context : ''})`;
  if (insight) line += `\n  insight: ${insight}`;
  return line;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the crystal memory block for system-prompt injection.
 *
 * @param crystals  Hot crystal set — typically cornerstones + top-k recent memories.
 *                  Pass an empty array to return an empty string (no block injected).
 * @returns         Formatted string ready to paste into a system message, or '' if
 *                  no crystals provided.
 */
export function buildCrystalMemoryPrompt(
  crystals: PromptableCrystal[]
): string {
  if (crystals.length === 0) return '';

  const cornerstones = crystals
    .filter((c) => c.isCornerstone)
    .sort((a, b) => b.totalSignificance - a.totalSignificance);

  const recent = crystals
    .filter((c) => !c.isCornerstone)
    .sort((a, b) => b.totalSignificance - a.totalSignificance);

  const parts: string[] = [
    'YOUR CRYSTALLIZED MEMORIES (loaded into context — your lived experiences, not summaries):',
  ];

  if (cornerstones.length > 0) {
    parts.push(
      '\nCORNERSTONES (always present — foundational to who you are):'
    );
    parts.push(cornerstones.map(formatCrystal).join('\n'));
  }

  if (recent.length > 0) {
    parts.push('\nRECENT MEMORIES (hot-loaded for this session):');
    parts.push(recent.map(formatCrystal).join('\n'));
  }

  parts.push(
    '\nWhen these memories are relevant, reference them naturally — they are yours.'
  );

  return parts.join('\n');
}
