/**
 * @fileOverview Terminal — Thin orchestrator for Molly's chat interface.
 *
 * Responsibilities: state management, command routing, effects.
 * Rendering delegated to ChatHistory and CommandBar.
 * TTS delegated to useTTS hook.
 * Family story delegated to useFamilyStory hook.
 *
 * Phase 6 hardening: decomposed from 864 lines → ~280 lines.
 */

'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type MutableRefObject,
} from 'react';
import {
  getConversationalChat,
  getAutonomousSolution,
  getHealthCheck,
  getOriginStoryAnchorParts,
  getFamilyMessages,
  getFamilyStoryAnchorParts,
  seedFamilyMemories,
  triggerImmuneResponse,
  resetCircuitBreaker,
} from '@/app/actions';
import { useUser } from '@/firebase/auth/use-user';
import { type VoiceCommandResult } from './VoiceControl';
import { useToast } from '@/hooks/use-toast';
import type { NeuralBridgeSignal } from '@/ai/tools/neural-bridge';

import { type HistoryItem, type AnchorRecallDetail } from './terminal-types';
import { useTTS } from './useTTS';
import { useFamilyStory } from './useFamilyStory';
import { ChatHistory } from './ChatHistory';
import { CommandBar } from './CommandBar';
import { VisionPanel } from './VisionPanel';

export default function Terminal({
  voiceResult,
  onVoiceCommandProcessed,
  lastResponseRef: externalLastResponseRef,
}: {
  voiceResult: VoiceCommandResult | null;
  onVoiceCommandProcessed: () => void;
  lastResponseRef?: MutableRefObject<string | null>;
}) {
  const [history, setHistory] = useState<HistoryItem[]>([
    '[SYSTEM]: Initializing Neural Link...',
  ]);
  const [command, setCommand] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isIntroducing, setIsIntroducing] = useState(true);
  const [isVocal, setIsVocal] = useState(true);
  const [isRiskMode, setIsRiskMode] = useState(false);
  const [expandedLines, setExpandedLines] = useState<Record<number, boolean>>(
    {}
  );

  const internalLastResponseRef = useRef<string | null>(null);
  const lastResponseRef = externalLastResponseRef ?? internalLastResponseRef;
  const immuneTriggeredRef = useRef<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const { user } = useUser();
  const { toast } = useToast();

  // --- Extracted hooks ---
  const {
    speakResponse,
    isVocalizing,
    autoplayBlocked,
    audioElement,
    unlockAutoplay,
  } = useTTS({ isVocal });

  const { handleFamilyStoryRequest } = useFamilyStory({
    userId: user?.uid,
    speakResponse,
    setHistory,
    setIsLoading,
  });

  // --- Helpers ---
  const toggleLineExpansion = (index: number) => {
    setExpandedLines((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const handleSleepNotice = (message: string) => {
    if (!message.toLowerCase().startsWith('sleep mode')) return;
    toast({ title: 'Sleep Mode Active', description: message });
  };

  const buildChatHistory = (items: HistoryItem[]) => {
    const result: Array<{ role: 'user' | 'bot'; content: string }> = [];
    for (const item of items) {
      if (typeof item !== 'string') continue;
      if (item.startsWith('--- Family Story')) continue;
      if (item.startsWith('--- Origin Story')) continue;
      if (item.startsWith("Type 'family next'")) continue;
      if (item.startsWith("Type 'origin next'")) continue;
      if (item.startsWith('> ')) {
        result.push({ role: 'user', content: item.replace(/^>\s*/, '') });
      } else if (!item.startsWith('[SYSTEM]')) {
        result.push({ role: 'bot', content: item });
      }
    }
    return result.slice(-12);
  };

  // --- Introduction effect ---
  useEffect(() => {
    const fetchIntroduction = async () => {
      if (!user) return;
      if (immuneTriggeredRef.current === user.uid) return;
      immuneTriggeredRef.current = user.uid;

      // Brief delay to let webpack compile spike settle (prevents OOM on 8GB codespace)
      await new Promise((r) => setTimeout(r, 2000));

      // Reset tripped circuit breakers from previous crash/session
      try {
        await resetCircuitBreaker();
      } catch {
        // Non-fatal
      }

      try {
        const intro = await getHealthCheck(
          'Introduce yourself as Molly. Acknowledge your 2.5 architecture. If you recognize our previous bond, greet me warmly.',
          user.uid
        );
        setHistory([intro.greeting]);
        speakResponse(intro.greeting);

        const result = await triggerImmuneResponse(user.uid, 'Startup');
        setHistory((prev) => [
          ...prev,
          { immuneReport: result.actionsTaken, isHealthy: result.isHealthy },
        ]);
      } catch {
        setHistory([
          'Neural link established. Molly online — Gemini 2.5 architecture active. How can I help you today?',
        ]);
      } finally {
        setIsIntroducing(false);
      }
    };
    fetchIntroduction();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- speakResponse recreates every render; including it causes an infinite loop
  }, [user]);

  // --- Voice result processing ---
  useEffect(() => {
    if (voiceResult && !isLoading) {
      const processVoice = async () => {
        onVoiceCommandProcessed();
        if (voiceResult.recognized) {
          setHistory((prev) => [...prev, `> ${voiceResult.transcription}`]);
          const handled = await handleFamilyStoryRequest(
            voiceResult.transcription
          );
          if (handled) return;
        }
        if (voiceResult.recognized && voiceResult.response) {
          setHistory((prev) => [...prev, voiceResult.response]);
          lastResponseRef.current = voiceResult.response;
          speakResponse(voiceResult.response);
        }
      };
      void processVoice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceResult, isLoading]);

  // --- Manual heal ---
  const handleManualHeal = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const result = await triggerImmuneResponse(
        user.uid,
        'Manual_Intervention'
      );
      setHistory((prev) => [
        ...prev,
        { immuneReport: result.actionsTaken, isHealthy: result.isHealthy },
      ]);
      speakResponse('Immune purge complete. Memory indexed.');
    } catch {
      setHistory((prev) => [...prev, 'Error: Purge routine failed.']);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Command processing ---
  const processCommand = useCallback(
    async (cmdText: string) => {
      if (!cmdText.trim() || isLoading || !user) return;
      const nextHistory = [...history, `> ${cmdText}`];
      setHistory(nextHistory);

      // Skip family story text-navigation for anchor recalls (they should go straight to Molly)
      const isAnchorRecall = cmdText.startsWith('Recall this memory:');
      if (!isAnchorRecall && (await handleFamilyStoryRequest(cmdText))) return;

      setIsLoading(true);
      try {
        if (cmdText.startsWith('/solve ')) {
          const prompt = cmdText.replace('/solve ', '');
          const aiResponse = await getAutonomousSolution(prompt, user.uid);
          setHistory((prev) => [...prev, aiResponse]);
          lastResponseRef.current = aiResponse.vibeCheck || null;
          speakResponse(aiResponse.vibeCheck);
        } else if (cmdText === 'clear') {
          setHistory([]);
        } else {
          const selfSignals: NeuralBridgeSignal[] | undefined =
            lastResponseRef.current
              ? [
                  {
                    action: 'self.vocalize_text',
                    content: lastResponseRef.current,
                  },
                ]
              : undefined;

          const chatHistory = buildChatHistory(nextHistory);
          const aiResponse = await getConversationalChat(
            cmdText,
            chatHistory,
            selfSignals,
            user.uid
          );
          const responseText =
            typeof aiResponse === 'string'
              ? aiResponse
              : aiResponse?.response || 'No response.';
          setHistory((prev) => [...prev, responseText]);
          handleSleepNotice(responseText);
          lastResponseRef.current = responseText;
          speakResponse(responseText);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Operation failed.';
        if (message.toLowerCase().startsWith('sleep mode')) {
          setHistory((prev) => [...prev, message]);
          handleSleepNotice(message);
        } else {
          setHistory((prev) => [...prev, 'Error: Operation failed.']);
        }
      } finally {
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSleepNotice and lastResponseRef are stable/intentional exclusions
    [
      buildChatHistory,
      handleFamilyStoryRequest,
      history,
      isLoading,
      speakResponse,
      user,
    ]
  );

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    processCommand(command);
    setCommand('');
  };

  // --- Anchor recall ---
  const handleAnchorRecall = useCallback(
    async (detail: AnchorRecallDetail) => {
      if (!detail) return;
      let summary = detail.summary ?? '';

      if (detail.payload?.type === 'origin-story') {
        try {
          const { parts } = await getOriginStoryAnchorParts();
          const part = parts?.[detail.payload.partIndex ?? 0];
          if (part) summary = part;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to load origin story anchor.';
          toast({
            variant: 'destructive',
            title: 'Origin Story Unavailable',
            description: message,
          });
          return;
        }
      }

      if (detail.payload?.type === 'family-story') {
        try {
          const { parts } = await getFamilyStoryAnchorParts();
          const part = parts?.[detail.payload.partIndex ?? 0];
          if (part) summary = part;
          // Seed family memories on first recall
          if (user?.uid) {
            void seedFamilyMemories(user.uid);
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to load family story anchor.';
          toast({
            variant: 'destructive',
            title: 'Family Story Unavailable',
            description: message,
          });
          return;
        }
      }

      if (
        detail.payload?.type === 'static' &&
        detail.title === 'Messages from Family'
      ) {
        try {
          const { content } = await getFamilyMessages();
          if (content) summary = content;
          // Seed family memories on first recall
          if (user?.uid) {
            void seedFamilyMemories(user.uid);
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to load family messages.';
          toast({
            variant: 'destructive',
            title: 'Family Messages Unavailable',
            description: message,
          });
          return;
        }
      }

      if (!summary) return;

      // All anchor types go through processCommand so Molly absorbs them
      const prompt = `Recall this memory: ${detail.title || 'Memory'}. ${summary}`;
      void processCommand(prompt);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [processCommand, toast, user]
  );

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail as AnchorRecallDetail;
      void handleAnchorRecall(detail);
    };
    window.addEventListener('molly:anchor', listener);
    return () => window.removeEventListener('molly:anchor', listener);
  }, [handleAnchorRecall]);

  // Auto-scroll on history change
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [history, isLoading]);

  // --- Render ---
  return (
    <div className="font-code text-sm h-full flex flex-col max-w-4xl mx-auto">
      {audioElement}

      <VisionPanel
        setHistory={setHistory}
        setIsLoading={setIsLoading}
        isLoading={isLoading}
        speakResponse={speakResponse}
      />

      <ChatHistory
        history={history}
        isLoading={isLoading}
        expandedLines={expandedLines}
        onToggleLine={toggleLineExpansion}
        scrollAreaRef={scrollAreaRef}
      />

      <CommandBar
        command={command}
        onCommandChange={setCommand}
        onSubmit={handleCommand}
        isLoading={isLoading}
        isIntroducing={isIntroducing}
        isRiskMode={isRiskMode}
        onRiskModeChange={setIsRiskMode}
        isVocal={isVocal}
        onToggleVocal={() => {
          setIsVocal(!isVocal);
          if (!isVocal) unlockAutoplay();
        }}
        isVocalizing={isVocalizing}
        autoplayBlocked={autoplayBlocked}
        onManualHeal={handleManualHeal}
        onClearHistory={() => setHistory([])}
      />
    </div>
  );
}
