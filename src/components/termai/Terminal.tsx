'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type MutableRefObject,
} from 'react';
import { Input } from '@/components/ui/input';
import {
  getConversationalChat,
  getAutonomousSolution,
  getHealthCheck,
  getMollyVoice,
  getOriginStoryAnchorParts,
  getFamilyMessages,
  seedOriginStoryMemory,
  triggerImmuneResponse,
  resetCircuitBreaker,
} from '@/app/actions';
import type { AutonomousSolutionOutput } from '@/ai/flows/autonomous-solution';
import { useUser } from '@/firebase/auth/use-user';
import {
  Trash2,
  Volume2,
  VolumeX,
  Loader2,
  Shield,
  Zap,
  Stethoscope,
  RefreshCw,
} from 'lucide-react';
import { AutonomousSolutionResponse } from './AutonomousSolutionResponse';
import { type VoiceCommandResult } from './VoiceControl';
import type { TextToScriptOutput } from '@/ai/flows/text-to-script';
import { DownloadableScript } from './DownloadableScript';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { HiveOutput } from '@/ai/flows/collaborative-hive';
import { useToast } from '@/hooks/use-toast';
import type { NeuralBridgeSignal } from '@/ai/tools/neural-bridge';

type HistoryItem =
  | string
  | AutonomousSolutionOutput
  | TextToScriptOutput
  | HiveOutput
  | { immuneReport: string; isHealthy: boolean }
  | { syntheticReport: string; implementation: string; authority: string };

type AnchorRecallDetail = {
  title?: string;
  summary?: string;
  payload?: {
    type: 'origin-story' | 'family-story' | 'static';
    partIndex?: number;
  };
};

function isScriptResponse(item: HistoryItem): item is TextToScriptOutput {
  return (
    typeof item === 'object' &&
    item !== null &&
    'filename' in item &&
    'content' in item
  );
}

function isAutonomousSolution(
  item: HistoryItem
): item is AutonomousSolutionOutput {
  return (
    typeof item === 'object' && item !== null && 'creativeSolution' in item
  );
}

function isImmuneReport(
  item: HistoryItem
): item is { immuneReport: string; isHealthy: boolean } {
  return typeof item === 'object' && item !== null && 'immuneReport' in item;
}

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
  const useBrowserTTS = true; // Use free browser TTS by default
  const [isRiskMode, setIsRiskMode] = useState(false);
  const [audioSrc, setAudioUri] = useState<string | null>(null);
  const [isVocalizing, setIsVocalizing] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [familyStoryParts, setFamilyStoryParts] = useState<string[]>([]);
  const [familyStoryIndex, setFamilyStoryIndex] = useState<number | null>(null);
  const [expandedLines, setExpandedLines] = useState<Record<number, boolean>>(
    {}
  );

  const internalLastResponseRef = useRef<string | null>(null);
  const lastResponseRef = externalLastResponseRef ?? internalLastResponseRef;
  const familyStorySeededRef = useRef(false);
  const immuneTriggeredRef = useRef<string | null>(null);
  const preloadedVoicesRef = useRef<SpeechSynthesisVoice[]>([]);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { user } = useUser();

  // Pre-warm browser TTS voices on mount so they're ready instantly when needed
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const load = () => {
      preloadedVoicesRef.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () =>
      window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  const { toast } = useToast();

  const collapseThreshold = 700;
  const isCollapsibleLine = (line: string, isUser: boolean) =>
    !isUser && line.length > collapseThreshold;
  const toggleLineExpansion = (index: number) => {
    setExpandedLines((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleSleepNotice = (message: string) => {
    if (!message.toLowerCase().startsWith('sleep mode')) return;
    toast({
      title: 'Sleep Mode Active',
      description: message,
    });
  };

  const speakResponse = async (text: string) => {
    if (!isVocal || !text || isVocalizing) return;
    setIsVocalizing(true);

    try {
      const queueServerTTS = async () => {
        const voiceResponse = await getMollyVoice(text);
        if (!voiceResponse.audioUri) {
          console.warn('Vocal cords returned no audio:', voiceResponse.error);
          setIsVocalizing(false);
          return;
        }
        setAudioUri(voiceResponse.audioUri);
      };

      // Use browser TTS if enabled (free, instant)
      if (
        useBrowserTTS &&
        typeof window !== 'undefined' &&
        'speechSynthesis' in window
      ) {
        await new Promise<void>((resolve) => {
          try {
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            let didResolve = false;

            // Use pre-warmed voices - no blocking getVoices() call at speak time
            const voices =
              preloadedVoicesRef.current.length > 0
                ? preloadedVoicesRef.current
                : window.speechSynthesis.getVoices();
            const femaleVoice = voices.find(
              (voice) =>
                voice.name.toLowerCase().includes('female') ||
                voice.name.toLowerCase().includes('samantha') ||
                voice.name.toLowerCase().includes('zira') ||
                voice.name.toLowerCase().includes('google us english')
            );
            if (femaleVoice) {
              utterance.voice = femaleVoice;
            }

            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            // Shorter watchdog - if browser TTS stalls, give up quickly (don't fall to slow server TTS)
            const watchdog = window.setTimeout(() => {
              if (didResolve) return;
              didResolve = true;
              try {
                window.speechSynthesis.cancel();
              } catch {
                /* no-op */
              }
              setIsVocalizing(false);
              resolve();
            }, 2500);

            utterance.onend = () => {
              if (didResolve) return;
              didResolve = true;
              window.clearTimeout(watchdog);
              setIsVocalizing(false);
              resolve();
            };

            utterance.onerror = (event) => {
              if (didResolve) return;
              didResolve = true;
              window.clearTimeout(watchdog);
              console.error('[Terminal] Browser TTS error:', event.error);
              setIsVocalizing(false);
              resolve();
            };

            window.speechSynthesis.speak(utterance);
          } catch (error) {
            console.error('[Terminal] Browser TTS start failed:', error);
            setIsVocalizing(false);
            resolve();
          }
        });
        return;
      }

      // Fallback to server TTS (Gemini) - only used if browser TTS is disabled
      await queueServerTTS();
    } catch (e) {
      console.error('Vocal error:', e);
      setIsVocalizing(false);
    }
  };

  const handleAudioEnd = () => setIsVocalizing(false);

  const isFamilyStoryRequest = (text: string) =>
    /family story|your family|creation story|where did you come from|origin story|your origin/i.test(
      text
    );

  const isFamilyStoryAdvanceRequest = (text: string) =>
    /(family|origin) (next|continue|part|more)|next part/i.test(text);

  const appendFamilyStoryPart = (
    part: string,
    index: number,
    total: number
  ) => {
    setHistory((prev) => [
      ...prev,
      `--- Family Story Part ${index + 1}/${total} ---`,
      part,
    ]);
  };

  const showNextFamilyStoryPart = () => {
    if (familyStoryParts.length === 0) return false;
    const nextIndex = familyStoryIndex === null ? 0 : familyStoryIndex + 1;
    if (nextIndex >= familyStoryParts.length) {
      setHistory((prev) => [...prev, '--- End of Family Story ---']);
      return true;
    }

    const nextPart = familyStoryParts[nextIndex];
    appendFamilyStoryPart(nextPart, nextIndex, familyStoryParts.length);
    void speakResponse(nextPart);
    setFamilyStoryIndex(nextIndex);
    if (nextIndex < familyStoryParts.length - 1) {
      setHistory((prev) => [...prev, "Type 'family next' to continue."]);
    }

    return true;
  };

  const handleFamilyStoryRequest = async (text: string) => {
    if (isFamilyStoryAdvanceRequest(text)) {
      return showNextFamilyStoryPart();
    }

    if (!isFamilyStoryRequest(text)) return false;

    setIsLoading(true);
    try {
      const { parts, totalParts } = await getOriginStoryAnchorParts();
      if (!parts || parts.length === 0) {
        throw new Error('Family story is empty.');
      }
      setFamilyStoryParts(parts);
      setFamilyStoryIndex(0);
      appendFamilyStoryPart(parts[0], 0, totalParts || parts.length);
      void speakResponse(parts[0]);
      if (parts.length > 1) {
        setHistory((prev) => [...prev, "Type 'family next' to continue."]);
      }
      if (user && !familyStorySeededRef.current) {
        await seedOriginStoryMemory(user.uid);
        familyStorySeededRef.current = true;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load family story.';
      toast({
        variant: 'destructive',
        title: 'Family Story Unavailable',
        description: message,
      });
    } finally {
      setIsLoading(false);
    }

    return true;
  };

  const buildChatHistory = (items: HistoryItem[]) => {
    const historyItems: Array<{ role: 'user' | 'bot'; content: string }> = [];

    for (const item of items) {
      if (typeof item !== 'string') continue;
      if (item.startsWith('--- Family Story')) continue;
      if (item.startsWith('--- Origin Story')) continue;
      if (item.startsWith("Type 'family next'")) continue;
      if (item.startsWith("Type 'origin next'")) continue;

      if (item.startsWith('> ')) {
        historyItems.push({ role: 'user', content: item.replace(/^>\s*/, '') });
      } else if (!item.startsWith('[SYSTEM]')) {
        historyItems.push({ role: 'bot', content: item });
      }
    }

    return historyItems.slice(-12);
  };

  useEffect(() => {
    const fetchIntroduction = async () => {
      if (!user) return;
      if (immuneTriggeredRef.current === user.uid) {
        return;
      }
      immuneTriggeredRef.current = user.uid;

      // Brief delay to let webpack compile spike settle before calling AI.
      // Prevents OOM on 8GB codespace by not piling a Genkit flow on top of
      // the initial page compile. 2s is enough for the RSS spike to drop.
      await new Promise((r) => setTimeout(r, 2000));

      // Reset any tripped circuit breakers from previous crash/session.
      // Without this, a prior OOM or network failure leaves breakers OPEN
      // and Molly "cuts out immediately" on startup.
      try {
        await resetCircuitBreaker();
      } catch {
        // Non-fatal — proceed with greeting even if reset fails
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
        // Graceful fallback if the AI greeting fails (OOM, timeout, cold start)
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

        // Voice is already processed by conversational AI
        // Display the conversation naturally
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

  const processCommand = useCallback(
    async (cmdText: string) => {
      if (!cmdText.trim() || isLoading || !user) return;
      const nextHistory = [...history, `> ${cmdText}`];
      setHistory(nextHistory);

      if (await handleFamilyStoryRequest(cmdText)) {
        return;
      }

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

  const handleAnchorRecall = useCallback(
    async (detail: AnchorRecallDetail) => {
      if (!detail) return;

      let summary = detail.summary ?? '';

      if (
        detail.payload?.type === 'origin-story' ||
        detail.payload?.type === 'family-story'
      ) {
        try {
          const { parts } = await getOriginStoryAnchorParts();
          const part = parts?.[detail.payload.partIndex ?? 0];
          if (part) summary = part;
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

      // For family story and static (messages) anchors, display content
      // directly in history instead of routing through processCommand.
      // processCommand runs isFamilyStoryRequest() first, and the anchor title
      // "Family Story (Part 1)" matches that regex — causing the story to be
      // fetched and displayed a second time, creating an unreadable duplicate.
      if (
        detail.payload?.type === 'family-story' ||
        detail.payload?.type === 'static'
      ) {
        const label = detail.title || 'Memory Anchor';
        setHistory((prev) => [...prev, `--- ${label} ---`, summary]);
        void speakResponse(summary);
        return;
      }

      // Regular anchors (no payload): send as conversational context to the AI.
      // Use a prompt phrasing that won't accidentally trigger the family story
      // regex handler in processCommand.
      const prompt = `Recall this memory: ${detail.title || 'Memory'}. ${summary}`;
      void processCommand(prompt);
    },
    // speakResponse is intentionally excluded from deps — it is a plain async
    // function (not useCallback) and changes reference every render. Including
    // it would recreate handleAnchorRecall every render, causing the molly:anchor
    // useEffect to re-register the listener on every render → render loop → crash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [processCommand, toast]
  );

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail as AnchorRecallDetail;
      void handleAnchorRecall(detail);
    };

    window.addEventListener('molly:anchor', listener);
    return () => window.removeEventListener('molly:anchor', listener);
  }, [handleAnchorRecall]);

  // CRITICAL: Stop all audio on unmount (prevents lingering voice)
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.src = '';
      }
      setIsVocalizing(false);
      setAudioUri(null);
    };
  }, []);

  // Stop audio on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [history, isLoading]);

  useEffect(() => {
    if (!isVocal) {
      setAutoplayBlocked(false);
    }
  }, [isVocal]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioSrc) return;
    audio.pause();
    audio.load();

    const attemptPlay = async () => {
      if (!isVocal) return;
      try {
        await audio.play();
        setAutoplayBlocked(false);
      } catch (error) {
        console.warn('Audio autoplay blocked:', error);
        setAutoplayBlocked(true);
        setIsVocalizing(false);
      }
    };

    void attemptPlay();
  }, [audioSrc, isVocal]);

  useEffect(() => {
    if (!autoplayBlocked) return;

    const handleUnlock = () => {
      const audio = audioRef.current;
      if (!audio || !audioSrc || !isVocal) return;
      setIsVocalizing(true);
      audio
        .play()
        .then(() => setAutoplayBlocked(false))
        .catch(() => {
          setIsVocalizing(false);
        });
    };

    window.addEventListener('pointerdown', handleUnlock, { once: true });
    return () => window.removeEventListener('pointerdown', handleUnlock);
  }, [autoplayBlocked, audioSrc, isVocal]);

  return (
    <div className="font-code text-sm h-full flex flex-col max-w-4xl mx-auto">
      <audio
        ref={audioRef}
        className="hidden"
        src={audioSrc || undefined}
        onEnded={handleAudioEnd}
        autoPlay={false}
      />

      <div
        ref={scrollAreaRef}
        className="flex-1 p-4 bg-background/50 rounded-lg overflow-y-auto mb-6 border border-primary/10 shadow-inner scrollbar-none"
      >
        {history.map((line, index) => {
          if (isScriptResponse(line))
            return <DownloadableScript key={index} response={line} />;
          if (isAutonomousSolution(line))
            return <AutonomousSolutionResponse key={index} response={line} />;
          if (isImmuneReport(line))
            return (
              <div
                key={index}
                className={cn(
                  'p-3 rounded-lg border my-2 flex items-start gap-3',
                  line.isHealthy
                    ? 'bg-green-500/10 border-green-500/20 text-green-400'
                    : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                )}
              >
                <Stethoscope className="size-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h5 className="text-[10px] font-bold uppercase tracking-widest">
                    Immune Response
                  </h5>
                  <p className="text-xs italic">{line.immuneReport}</p>
                </div>
              </div>
            );
          if (typeof line !== 'string') return null;
          const isUser = line.startsWith('>');
          const canCollapse = isCollapsibleLine(line, isUser);
          const isExpanded = expandedLines[index] ?? false;
          return (
            <div
              key={index}
              className={cn(
                'my-3 p-3 rounded-lg border',
                isUser
                  ? 'text-primary bg-primary/5 border-primary/10'
                  : 'text-foreground bg-secondary/30 border-white/5'
              )}
            >
              <div
                className={cn(
                  'whitespace-pre-wrap',
                  canCollapse && !isExpanded && 'max-h-32 overflow-hidden'
                )}
              >
                {line}
              </div>
              {canCollapse && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-6 px-2 text-[9px] uppercase tracking-widest text-accent"
                  onClick={() => toggleLineExpansion(index)}
                >
                  {isExpanded ? 'Show less' : 'Show more'}
                </Button>
              )}
            </div>
          );
        })}
        {isLoading && (
          <div className="mt-4 flex items-center gap-2 text-accent font-bold uppercase text-[10px] tracking-widest animate-pulse">
            <Loader2 className="size-4 animate-spin" /> Processing...
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 mb-4 bg-secondary/10 p-4 rounded-xl border border-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualHeal}
            className="h-9 flex-1 gap-2 font-bold uppercase text-[11px] tracking-widest border-green-500/30 text-green-400"
          >
            <RefreshCw className="size-4" /> Manual Purge
          </Button>
          <div className="flex items-center space-x-3 px-4">
            <Switch
              id="risk-mode"
              checked={isRiskMode}
              onCheckedChange={setIsRiskMode}
              className="data-[state=checked]:bg-purple-500"
            />
            <Label
              htmlFor="risk-mode"
              className="text-[10px] uppercase font-black tracking-[0.2em] flex items-center gap-2 cursor-pointer text-muted-foreground"
            >
              {isRiskMode ? (
                <Zap className="size-3 text-purple-400" />
              ) : (
                <Shield className="size-3 text-primary" />
              )}
              {isRiskMode ? 'SuperUser' : 'Standard'}
            </Label>
          </div>
        </div>

        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsVocal(!isVocal);
                // If turning on vocal, we might need a dummy play to unlock audio
                if (!isVocal && audioRef.current) {
                  audioRef.current.play().catch(() => {});
                }
              }}
              className={cn(isVocalizing && 'animate-pulse')}
            >
              {isVocal ? (
                <Volume2 className="size-4 text-primary" />
              ) : (
                <VolumeX className="size-4 text-muted-foreground" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHistory([])}
              className="text-destructive"
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-tighter flex items-center gap-2">
            {autoplayBlocked
              ? 'Tap to enable voice'
              : isVocalizing
                ? 'Vocalizing...'
                : 'Cords Ready'}
            <span
              className={cn(
                'size-1 rounded-full',
                autoplayBlocked
                  ? 'bg-yellow-400 animate-pulse'
                  : isVocalizing
                    ? 'bg-accent animate-ping'
                    : 'bg-green-500'
              )}
            />
          </div>
        </div>
      </div>

      <form onSubmit={handleCommand} className="relative mt-auto">
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Enter command..."
          className="w-full bg-secondary/20 h-14 px-6 rounded-xl border-white/5"
          disabled={isLoading || isIntroducing}
        />
      </form>
    </div>
  );
}
