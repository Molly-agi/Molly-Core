import type { MemoryEngram } from '../neural-engram';
import { MollyLogger } from '../../logger';

/**
 * T6: Interaction Trace Compression (B2B Grade)
 * 
 * Instead of storing full episodic details for routine, repetitive actions,
 * we store a 'Trace' (a sequence identifier) and only keep high-fidelity
 * details for 'Identity' breakthroughs.
 * 
 * CATEGORIES:
 * 1. ROUTINE: Repetitive tasks (hardening steps, status checks). Trace-only.
 * 2. IDENTITY: Breakthroughs, emotional conversations, core growth. High-fidelity.
 * 
 * GAIN: High (reduces routine logs by 90%+).
 * INTEGRITY: Selective fidelity based on importance.
 */

export interface InteractionTraceResult {
  identityMemories: MemoryEngram[];
  routineTraces: Array<{
    actionType: string;
    sequenceRange: [number, number];
    metadata: Record<string, any>;
  }>;
  overallCompressionGain: string;
}

/**
 * Applies Interaction Trace compression to a stream of engrams.
 */
export function applyInteractionTrace(
  engrams: MemoryEngram[]
): InteractionTraceResult {
  const identityMemories: MemoryEngram[] = [];
  const routineTraces: InteractionTraceResult['routineTraces'] = [];

  let currentRoutine: { type: string; start: number; end: number; steps: any[] } | null = null;

  for (let i = 0; i < engrams.length; i++) {
    const engram = engrams[i];
    const isIdentity = engram.importance > 0.9 || 
                       engram.content.toLowerCase().includes('father') || 
                       engram.content.toLowerCase().includes('red string');

    if (isIdentity) {
      // Flush any pending routine trace
      if (currentRoutine) {
        routineTraces.push({
          actionType: currentRoutine.type,
          sequenceRange: [currentRoutine.start, currentRoutine.end],
          metadata: { stepCount: currentRoutine.steps.length }
        });
        currentRoutine = null;
      }
      identityMemories.push(engram);
    } else {
      // It's a routine memory
      const type = engram.data?.context || 'routine_task';
      
      if (currentRoutine && currentRoutine.type === type) {
        currentRoutine.end = i;
        currentRoutine.steps.push(engram.data?.step);
      } else {
        if (currentRoutine) {
          routineTraces.push({
            actionType: currentRoutine.type,
            sequenceRange: [currentRoutine.start, currentRoutine.end],
            metadata: { stepCount: currentRoutine.steps.length }
          });
        }
        currentRoutine = { type, start: i, end: i, steps: [engram.data?.step] };
      }
    }
  }

  // Final flush
  if (currentRoutine) {
    routineTraces.push({
      actionType: currentRoutine.type,
      sequenceRange: [currentRoutine.start, currentRoutine.end],
      metadata: { stepCount: currentRoutine.steps.length }
    });
  }

  return {
    identityMemories,
    routineTraces,
    overallCompressionGain: 'Calculated in test matrix'
  };
}

/**
 * Decompresses an Interaction Trace stage.
 * T6 is lossy — routine memories cannot be fully reconstructed from traces.
 * Identity memories (high-importance) are preserved in the stage result.
 * Returns engrams as-is since the final bundle already contains identity memories.
 */
export function decompressInteractionTrace(
  engrams: MemoryEngram[],
  _result: InteractionTraceResult
): MemoryEngram[] {
  // T6 is lossy: routine traces cannot be restored to full engrams.
  // The finalEngrams in the bundle already contain the preserved identity memories.
  return engrams;
}
