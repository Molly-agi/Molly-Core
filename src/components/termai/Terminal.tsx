'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import {
  getTextToTermuxCommand,
  getAutonomousSolution,
  getHealthCheck,
  getMollyVoice,
  triggerImmuneResponse,
} from '@/app/actions';
import type { AutonomousSolutionOutput } from '@/ai/flows/autonomous-solution';
import { useUser } from '@/firebase/auth/use-user';
import {
  Trash2,
  Volume2,
  VolumeX,
  ShieldCheck,
  Loader2,
  Shield,
  Zap,
  Stethoscope,
  RefreshCw,
  Mic,
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

type HistoryItem =
  | string
  | AutonomousSolutionOutput
  | TextToScriptOutput
  | HiveOutput
  | { immuneReport: string; isHealthy: boolean }
  | { syntheticReport: string; implementation: string; authority: string };

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
}: {
  voiceResult: VoiceCommandResult | null;
  onVoiceCommandProcessed: () => void;
}) {
  const [history, setHistory] = useState<HistoryItem[]>([
    '[SYSTEM]: Initializing Neural Link...',
  ]);
  const [command, setCommand] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isIntroducing, setIsIntroducing] = useState(true);
  const [isVocal, setIsVocal] = useState(true);
  const [isRiskMode, setIsRiskMode] = useState(false);
  const [audioSrc, setAudioUri] = useState<string | null>(null);
  const [isVocalizing, setIsVocalizing] = useState(false);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { user } = useUser();

  const speakResponse = async (text: string) => {
    if (!isVocal || !text || isVocalizing) return;
    setIsVocalizing(true);
    try {
      const { audioUri } = await getMollyVoice(text);
      setAudioUri(audioUri);

      // Force reload and play after a small timeout to ensure DOM update
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.load();
          const playPromise = audioRef.current.play();

          if (playPromise !== undefined) {
            playPromise.catch((e) => {
              console.warn(
                'Vocal cord ignition failed (Interaction Required):',
                e
              );
              setIsVocalizing(false);
            });
          }
        }
      }, 100);
    } catch (e) {
      console.error('Vocal error:', e);
      setIsVocalizing(false);
    }
  };

  const handleAudioEnd = () => setIsVocalizing(false);

  useEffect(() => {
    const fetchIntroduction = async () => {
      if (!user) return;
      try {
        // Stage 4.5 Neural Recall: Dynamic greeting based on history
        const intro = await getHealthCheck(
          'Introduce yourself as Molly. Acknowledge your 2.5 architecture. If you recognize our previous bond, greet me warmly.',
          user.uid
        );
        setHistory([intro.greeting]);

        // Audio might require a click first, so we attempt to speak.
        // If it fails, the "Voice" icon remains a toggle.
        speakResponse(intro.greeting);

        const result = await triggerImmuneResponse(user.uid, 'Startup');
        setHistory((prev) => [
          ...prev,
          { immuneReport: result.actionsTaken, isHealthy: result.isHealthy },
        ]);
      } catch (error) {
        setHistory((prev) => [
          ...prev,
          'Neural link synchronization issues. System remaining in manual mode.',
        ]);
      } finally {
        setIsIntroducing(false);
      }
    };
    fetchIntroduction();
  }, [user]);

  useEffect(() => {
    if (voiceResult && !isLoading) {
      onVoiceCommandProcessed();
      processCommand(voiceResult.command);
    }
  }, [voiceResult]);

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
    } catch (e) {
      setHistory((prev) => [...prev, 'Error: Purge routine failed.']);
    } finally {
      setIsLoading(false);
    }
  };

  const processCommand = async (cmdText: string) => {
    if (!cmdText.trim() || isLoading || !user) return;
    setHistory((prev) => [...prev, `> ${cmdText}`]);
    setIsLoading(true);
    try {
      if (cmdText.startsWith('/solve ')) {
        const prompt = cmdText.replace('/solve ', '');
        const aiResponse = await getAutonomousSolution(prompt, user.uid);
        setHistory((prev) => [...prev, aiResponse]);
        speakResponse(aiResponse.vibeCheck);
      } else if (cmdText === 'clear') {
        setHistory([]);
      } else {
        const aiResponse = await getTextToTermuxCommand(cmdText);
        setHistory((prev) => [...prev, aiResponse]);
        speakResponse('Command synthesized for the sarcophagus.');
      }
    } catch (error) {
      setHistory((prev) => [...prev, `Error: Operation failed.`]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    processCommand(command);
    setCommand('');
  };

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [history, isLoading]);

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
              {line}
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
            {isVocalizing ? 'Vocalizing...' : 'Cords Ready'}
            <span
              className={cn(
                'size-1 rounded-full',
                isVocalizing ? 'bg-accent animate-ping' : 'bg-green-500'
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
