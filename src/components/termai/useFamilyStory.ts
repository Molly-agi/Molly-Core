/**
 * @fileOverview useFamilyStory — Custom hook for family/origin story navigation.
 *
 * Handles fetching story parts from Firestore, sequential navigation,
 * and origin memory seeding. Extracted from Terminal.tsx during Phase 6.
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import { getFamilyStoryAnchorParts, seedFamilyMemories } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import type { HistoryItem } from './terminal-types';

interface UseFamilyStoryOptions {
  userId: string | undefined;
  speakResponse: (text: string) => Promise<void>;
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  setIsLoading: (loading: boolean) => void;
}

interface UseFamilyStoryReturn {
  /** Returns true if the text was handled as a family story request. */
  handleFamilyStoryRequest: (text: string) => Promise<boolean>;
}

const FAMILY_STORY_REGEX =
  /family story|your family|creation story|where did you come from|origin story|your origin/i;
const FAMILY_ADVANCE_REGEX =
  /(family|origin) (next|continue|part|more)|next part/i;

export function useFamilyStory({
  userId,
  speakResponse,
  setHistory,
  setIsLoading,
}: UseFamilyStoryOptions): UseFamilyStoryReturn {
  const [parts, setParts] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const seededRef = useRef(false);
  const { toast } = useToast();

  const appendPart = useCallback(
    (part: string, index: number, total: number) => {
      setHistory((prev) => [
        ...prev,
        `--- Family Story Part ${index + 1}/${total} ---`,
        part,
      ]);
    },
    [setHistory]
  );

  const showNextPart = useCallback(() => {
    if (parts.length === 0) return false;
    const nextIndex = currentIndex === null ? 0 : currentIndex + 1;

    if (nextIndex >= parts.length) {
      setHistory((prev) => [...prev, '--- End of Family Story ---']);
      return true;
    }

    const nextPart = parts[nextIndex];
    appendPart(nextPart, nextIndex, parts.length);
    void speakResponse(nextPart);
    setCurrentIndex(nextIndex);

    if (nextIndex < parts.length - 1) {
      setHistory((prev) => [...prev, "Type 'family next' to continue."]);
    }

    return true;
  }, [parts, currentIndex, appendPart, speakResponse, setHistory]);

  const handleFamilyStoryRequest = useCallback(
    async (text: string): Promise<boolean> => {
      // Advance to next part
      if (FAMILY_ADVANCE_REGEX.test(text)) {
        return showNextPart();
      }

      // Start new story
      if (!FAMILY_STORY_REGEX.test(text)) return false;

      setIsLoading(true);
      try {
        const { parts: fetchedParts, totalParts } =
          await getFamilyStoryAnchorParts();
        if (!fetchedParts || fetchedParts.length === 0) {
          throw new Error('Family story is empty.');
        }

        setParts(fetchedParts);
        setCurrentIndex(0);
        appendPart(fetchedParts[0], 0, totalParts || fetchedParts.length);
        void speakResponse(fetchedParts[0]);

        if (fetchedParts.length > 1) {
          setHistory((prev) => [...prev, "Type 'family next' to continue."]);
        }

        if (userId && !seededRef.current) {
          await seedFamilyMemories(userId);
          seededRef.current = true;
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to load family story.';
        toast({
          variant: 'destructive',
          title: 'Family Story Unavailable',
          description: message,
        });
      } finally {
        setIsLoading(false);
      }

      return true;
    },
    [
      showNextPart,
      setIsLoading,
      appendPart,
      speakResponse,
      setHistory,
      userId,
      toast,
    ]
  );

  return { handleFamilyStoryRequest };
}
