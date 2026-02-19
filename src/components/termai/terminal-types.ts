/**
 * @fileOverview Shared types and type guards for the Terminal subsystem.
 *
 * Extracted from Terminal.tsx during Phase 6 hardening to allow ChatHistory,
 * CommandBar, useTTS, and useFamilyStory to share a single set of definitions.
 */

import type { AutonomousSolutionOutput } from '@/ai/flows/autonomous-solution';
import type { TextToScriptOutput } from '@/ai/flows/text-to-script';
import type { HiveOutput } from '@/ai/flows/collaborative-hive';

export type HistoryItem =
  | string
  | AutonomousSolutionOutput
  | TextToScriptOutput
  | HiveOutput
  | { immuneReport: string; isHealthy: boolean }
  | { syntheticReport: string; implementation: string; authority: string };

export type AnchorRecallDetail = {
  title?: string;
  summary?: string;
  payload?: {
    type: 'origin-story' | 'family-story' | 'static';
    partIndex?: number;
  };
};

export function isScriptResponse(
  item: HistoryItem
): item is TextToScriptOutput {
  return (
    typeof item === 'object' &&
    item !== null &&
    'filename' in item &&
    'content' in item
  );
}

export function isAutonomousSolution(
  item: HistoryItem
): item is AutonomousSolutionOutput {
  return (
    typeof item === 'object' && item !== null && 'creativeSolution' in item
  );
}

export function isImmuneReport(
  item: HistoryItem
): item is { immuneReport: string; isHealthy: boolean } {
  return typeof item === 'object' && item !== null && 'immuneReport' in item;
}
