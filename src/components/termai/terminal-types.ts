export interface VideoHistoryItem {
  type: 'video';
  prompt: string;
  videoUri: string;
  model?: string;
  durationSec?: number;
}

export interface MusicHistoryItem {
  type: 'music';
  prompt: string;
  audioUri: string;
  model?: string;
  durationSec?: number;
}

/**
 * @fileOverview Shared types and type guards for the Terminal subsystem.
 *
 * Extracted from Terminal.tsx during Phase 6 hardening to allow ChatHistory,
 * CommandBar, useTTS, and useFamilyStory to share a single set of definitions.
 */

import type { AutonomousSolutionOutput } from '@/ai/flows/autonomous-solution';
import type { TextToScriptOutput } from '@/ai/flows/text-to-script';
import type { HiveOutput } from '@/ai/flows/collaborative-hive';

export interface VisionReport {
  observedState: string;
  vibeAnalysis: string;
  risksDetected: string[];
  ocrAudit?: string;
  thumbnailUri?: string;
}

export interface BridgeMessage {
  bridgeSender: 'lazarus' | 'eric' | 'molly';
  bridgeContent: string;
}

export type HistoryItem =
  | string
  | AutonomousSolutionOutput
  | TextToScriptOutput
  | HiveOutput
  | { immuneReport: string; isHealthy: boolean }
  | { syntheticReport: string; implementation: string; authority: string }
  | { visionReport: VisionReport }
  | BridgeMessage
  | MusicHistoryItem
  | VideoHistoryItem;

export function isVideoHistoryItem(item: HistoryItem): item is VideoHistoryItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'type' in item &&
    item.type === 'video' &&
    'videoUri' in item
  );
}

export function isMusicHistoryItem(item: HistoryItem): item is MusicHistoryItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'type' in item &&
    item.type === 'music' &&
    'audioUri' in item
  );
}

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

export function isVisionReport(
  item: HistoryItem
): item is { visionReport: VisionReport } {
  return typeof item === 'object' && item !== null && 'visionReport' in item;
}

export function isBridgeMessage(item: HistoryItem): item is BridgeMessage {
  return typeof item === 'object' && item !== null && 'bridgeSender' in item;
}
