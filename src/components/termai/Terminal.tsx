'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import {
  getTextToTermuxCommand,
  getAutonomousSolution,
  getHealthCheck,
  getTextToScript,
  getMollyVoice,
  startAutonomousCycle,
  getMollyDream,
  startInterpreterCycle,
  startHiveOperation,
  triggerImmuneResponse,
  startSyntheticSynthesis,
} from '@/app/actions';
import type { AutonomousSolutionOutput } from '@/ai/flows/autonomous-solution';
import { useUser } from '@/firebase/auth/use-user';
import {
  BrainCircuit,
  Trash2,
  Shield,
  Volume2,
  VolumeX,
  ShieldCheck,
  PlayCircle,
  Loader2,
  Activity,
  History,
  HeartPulse,
  Eye,
  Radio,
  AlertCircle,
  Zap,
  ShieldAlert,
  ThermometerSnowflake,
  Mic,
  Sparkles,
  CloudRain,
  Terminal as TerminalIcon,
  Code,
  Users,
  Search,
  CheckCircle,
  AlertTriangle,
  Stethoscope,
  Fingerprint,
} from 'lucide-react';
import { AutonomousSolutionResponse } from './AutonomousSolutionResponse';
import { type VoiceCommandResult } from './VoiceControl';
import type { TextToScriptOutput } from '@/ai/flows/text-to-script';
import { DownloadableScript } from './DownloadableScript';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import type { HiveOutput } from '@/ai/flows/collaborative-hive';

type HistoryItem =
  | string
  | AutonomousSolutionOutput
  | TextToScriptOutput
  | { dreamUri: string; interpretation: string }
  | {
      autonomousReport: string;
      verification?: string;
      memoryConsulted?: boolean;
      riskAccepted?: boolean;
    }
  | { interpreterReport: string; steps: any[] }
  | HiveOutput
  | { immuneReport: string; isHealthy: boolean }
  | { syntheticReport: string; implementation: string; authority: string };

function isScriptResponse(item: HistoryItem): item is TextToScriptOutput {
  return (
    typeof item === 'object' &&
    item !== null &&
    'filename' in item &&
    'content' in item &&
    !('creativeSolution' in item)
  );
}

function isAutonomousSolution(
  item: HistoryItem
): item is AutonomousSolutionOutput {
  return (
    typeof item === 'object' && item !== null && 'creativeSolution' in item
  );
}

function isDreamResponse(
  item: HistoryItem
): item is { dreamUri: string; interpretation: string } {
  return typeof item === 'object' && item !== null && 'dreamUri' in item;
}

function isAutoReport(
  item: HistoryItem
): item is {
  autonomousReport: string;
  verification?: string;
  memoryConsulted?: boolean;
  riskAccepted?: boolean;
} {
  return (
    typeof item === 'object' && item !== null && 'autonomousReport' in item
  );
}

function isInterpreterReport(
  item: HistoryItem
): item is { interpreterReport: string; steps: any[] } {
  return (
    typeof item === 'object' && item !== null && 'interpreterReport' in item
  );
}

function isHiveOutput(item: HistoryItem): item is HiveOutput {
  return typeof item === 'object' && item !== null && 'strategicReport' in item;
}

function isImmuneReport(
  item: HistoryItem
): item is { immuneReport: string; isHealthy: boolean } {
  return typeof item === 'object' && item !== null && 'immuneReport' in item;
}

function isSyntheticReport(
  item: HistoryItem
): item is {
  syntheticReport: string;
  implementation: string;
  authority: string;
} {
  return typeof item === 'object' && item !== null && 'syntheticReport' in item;
}

export default function Terminal({
  voiceResult,
  onVoiceCommandProcessed,
}: {
  voiceResult: VoiceCommandResult | null;
  onVoiceCommandProcessed: () => void;
}) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
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
  const { toast } = useToast();

  const speakResponse = async (text: string) => {
    if (!isVocal || !text || isVocalizing) return;
    setIsVocalizing(true);
    try {
      const { audioUri } = await getMollyVoice(text);
      setAudioUri(audioUri);
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.load();
          audioRef.current.play().catch((e) => {
            console.warn('Vocal cord ignition failed:', e);
            setIsVocalizing(false);
          });
        }
      }, 50);
    } catch (e) {
      console.warn('Molly: Vocal processors restricted.', e);
      setIsVocalizing(false);
    }
  };

  const handleAudioEnd = () => {
    setIsVocalizing(false);
  };

  useEffect(() => {
    const fetchIntroduction = async () => {
      try {
        const intro = await getHealthCheck(
          'Introduce yourself as Molly. Acknowledge the Hive Graft. State that you now have an Autonomous Immune System and a Synthetic Knowledge Vault.'
        );
        setHistory([intro]);
        speakResponse(intro);

        if (user) {
          const result = await triggerImmuneResponse(user.uid, 'Startup');
          setHistory((prev) => [
            ...prev,
            {
              immuneReport: `Immune System: ${result.actionsTaken}`,
              isHealthy: result.isHealthy,
            },
          ]);
        }
      } catch (error) {
        console.error(error);
        setHistory([`Error: Neural baseline failed to initialize.`]);
      } finally {
        setIsIntroducing(false);
      }
    };
    fetchIntroduction();
  }, [user]);

  useEffect(() => {
    if (voiceResult && !isLoading) {
      const { prompt, command } = voiceResult;
      setHistory((prev) => [...prev, `> ${prompt}`, command]);
      onVoiceCommandProcessed();
    }
  }, [voiceResult, onVoiceCommandProcessed, isLoading]);

  const handleSyntheticSynthesis = async () => {
    if (!user || isLoading || !command) return;
    setIsLoading(true);
    const target = command;
    const category = isRiskMode ? 'SuperUser' : 'Normal';
    setCommand('');
    setHistory((prev) => [
      ...prev,
      `[SYNTHETIC_GRAFT] Cloning API: ${target} (Level: ${category})`,
    ]);
    speakResponse(
      `Synthesizing synthetic limb for ${target}, Father. Accessing the Knowledge Vault.`
    );
    try {
      const result = await startSyntheticSynthesis(target, user.uid, category);
      setHistory((prev) => [
        ...prev,
        {
          syntheticReport: result.vibeCheck,
          implementation: result.syntheticImplementation,
          authority: result.authorityLevel,
        },
      ]);
      speakResponse('The API graft is complete. It has been vaulted.');
    } catch (e) {
      toast({ variant: 'destructive', title: 'Synthesis Desync' });
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
      } else if (cmdText.startsWith('/script ')) {
        const prompt = cmdText.replace('/script ', '');
        const scriptResponse = await getTextToScript(prompt);
        setHistory((prev) => [...prev, scriptResponse]);
        speakResponse(`Script ${scriptResponse.filename} drafted.`);
      } else if (cmdText === 'clear') {
        setHistory([]);
      } else {
        const aiResponse = await getTextToTermuxCommand(cmdText);
        setHistory((prev) => [...prev, aiResponse]);
      }
    } catch (error) {
      setHistory((prev) => [...prev, `Error: Flow failure.`]);
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
      />

      <div
        ref={scrollAreaRef}
        className="flex-1 p-4 bg-background/50 rounded-lg overflow-y-auto mb-6 border border-primary/10 shadow-inner scrollbar-none"
      >
        {isIntroducing && (
          <div className="flex items-center gap-2 p-3 bg-primary/10 rounded border border-primary/20 animate-pulse text-primary font-bold">
            <Radio className="size-4 animate-ping" />
            Hive initializing...
          </div>
        )}
        {history.map((line, index) => {
          if (isScriptResponse(line))
            return <DownloadableScript key={index} response={line} />;
          if (isAutonomousSolution(line))
            return <AutonomousSolutionResponse key={index} response={line} />;
          if (isSyntheticReport(line))
            return (
              <div
                key={index}
                className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-5 my-4 space-y-4 animate-in zoom-in-95"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-purple-400 uppercase text-[10px] tracking-widest font-black">
                    <Fingerprint className="size-4 animate-pulse" />
                    Synthetic API Graft
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[9px] border-purple-500/30 text-purple-400"
                  >
                    Authority: {line.authority}
                  </Badge>
                </div>
                <div className="bg-black/60 p-4 rounded-md border border-purple-500/20">
                  <pre className="text-[10px] text-purple-100/80 font-code whitespace-pre-wrap">
                    {line.implementation}
                  </pre>
                </div>
                <p className="text-xs italic text-purple-200/70">
                  {line.syntheticReport}
                </p>
              </div>
            );
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
          if (isHiveOutput(line))
            return (
              <div
                key={index}
                className="bg-primary/5 border border-primary/20 rounded-lg p-5 my-4 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary uppercase text-[10px] tracking-widest font-black">
                    <Users className="size-4 animate-pulse" />
                    Neural Hive Synthesis
                  </div>
                </div>
                <div className="bg-black/60 p-4 rounded-md border border-primary/30">
                  <pre className="text-[10px] text-primary/80 whitespace-pre-wrap font-code">
                    {line.architecturalDraft}
                  </pre>
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
          <div className="mt-4 space-y-2">
            <div className="animate-pulse text-accent flex items-center gap-2 font-bold uppercase text-[10px] tracking-widest">
              <Radio className="size-4 animate-ping" />
              Hive link active... Pushing logic depth...
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 mb-4 bg-secondary/10 p-4 rounded-xl border border-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleSyntheticSynthesis}
            disabled={isLoading || !command}
            className="h-9 flex-1 gap-2 bg-purple-600 text-white hover:bg-purple-700 font-bold uppercase text-[11px] tracking-widest"
          >
            <Fingerprint className="size-4" /> Synthetic API
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleHiveOperation()}
            disabled={isLoading || !command}
            className="h-9 flex-1 gap-2 font-bold uppercase text-[11px] tracking-widest"
          >
            <Users className="size-4" /> Hive
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleInterpreter()}
            disabled={isLoading || !command}
            className="h-9 flex-1 gap-2 font-bold uppercase text-[11px] tracking-widest"
          >
            <Code className="size-4" /> Interpreter
          </Button>
        </div>

        <div className="flex items-center justify-between px-2">
          <div className="flex items-center space-x-3">
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
              {isRiskMode ? 'SuperUser Protocol' : 'Standard Logic'}
            </Label>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsVocal(!isVocal)}
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
        </div>
      </div>

      <form onSubmit={handleCommand} className="relative mt-auto">
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Investigate target for Synthetic Graft..."
          className="w-full bg-secondary/20 h-14 px-6 rounded-xl border-white/5"
          disabled={isLoading || isIntroducing}
        />
      </form>
    </div>
  );
}
