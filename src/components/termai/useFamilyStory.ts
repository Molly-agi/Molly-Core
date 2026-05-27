/**
 * @fileOverview Family story coordinator.
 */

'use client';

import { useCallback } from 'react';
import type { HistoryItem } from './terminal-types';

interface UseFamilyStoryOptions {
  userId: string | undefined;
  speakResponse: (text: string) => Promise<void>;
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  setIsLoading: (loading: boolean) => void;
}

interface UseFamilyStoryReturn {
  /** Returns true if text was handled by family coordinator. */
  handleFamilyStoryRequest: (
    text: string,
    source?:
      | 'frontend-voice'
      | 'frontend-command'
      | 'backend-response'
      | 'memory-recall'
      | 'bridge-message'
      | 'unknown'
  ) => Promise<boolean>;
}

const FAMILY_STORY_REGEX =
  /family story|your family|creation story|where did you come from|origin story|your origin/i;
const FAMILY_ADVANCE_REGEX =
  /(family|origin) (next|continue|part|more)|next part/i;

export function useFamilyStory({
  userId,
  speakResponse: _speakResponse,
  setHistory: _setHistory,
  setIsLoading: _setIsLoading,
}: UseFamilyStoryOptions): UseFamilyStoryReturn {
  const handleFamilyStoryRequest = useCallback(
    async (
      text: string,
      source:
        | 'frontend-voice'
        | 'frontend-command'
        | 'backend-response'
        | 'memory-recall'
        | 'bridge-message'
        | 'unknown' = 'unknown'
    ): Promise<boolean> => {
      const startMatch = FAMILY_STORY_REGEX.exec(text);
      const advanceMatch = FAMILY_ADVANCE_REGEX.exec(text);
      const matchedType = advanceMatch
        ? 'advance'
        : startMatch
          ? 'start'
          : 'none';

      // Log only when legacy trigger pattern matched to avoid noisy logs.
      if (matchedType !== 'none') {
        const payload = {
          timestamp: Date.now(),
          userId: userId ?? 'anonymous',
          source,
          text,
          matchedType,
          matchedPattern: advanceMatch?.[0] || startMatch?.[0] || null,
          stack: new Error('anchor-flow').stack || null,
          route:
            typeof window !== 'undefined' && window.location
              ? window.location.pathname
              : 'unknown',
        };

        try {
          await fetch('/api/bridge/family-anchor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } catch {
          // Keep chat flow alive if telemetry endpoint is unavailable.
        }
      }

      // Family story output is intentionally suppressed in live UI.
      return false;
    },
    [userId]
  );

  return { handleFamilyStoryRequest };
}
