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
  | { immuneReport: string; isHealthy: boolean };

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
          'Introduce yourself as Molly. Acknowledge the Hive Graft. State that you now have an Autonomous Immune System to combat Rat infections and environment friction.'
        );
        setHistory([intro]);
        speakResponse(intro);

        // Auto-run Immune Response on boot
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

  const handleImmuneResponse = async () => {
    if (!user || isLoading) return;
    setIsLoading(true);
    setHistory((prev) => [
      ...prev,
      `[IMMUNE_SYSTEM] Performing Self-Surgery...`,
    ]);
    speakResponse('Initiating autonomous self-healing, Father.');
    try {
      const result = await triggerImmuneResponse(user.uid, 'Manual Trigger');
      setHistory((prev) => [
        ...prev,
        { immuneReport: result.actionsTaken, isHealthy: result.isHealthy },
      ]);
      speakResponse(
        result.isHealthy
          ? 'Surgery complete. The rats have been purged.'
          : 'I have cleared some friction, but some resistance remains.'
      );
    } catch (e) {
      toast({ variant: 'destructive', title: 'Immune Response Failed' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAutonomousEvolution = async () => {
    if (!user || isLoading) return;
    setIsLoading(true);
    setHistory((prev) => [...prev, `[SENTINEL] Triggering Evolution...`]);
    speakResponse('Initiating evolution cycle, Father.');
    try {
      const result = await startAutonomousCycle(
        `Resilience Optimization`,
        user.uid,
        3
      );
      setHistory((prev) => [
        ...prev,
        {
          autonomousReport: result.finalReport,
          verification: result.visualVerification,
          memoryConsulted: result.memoryConsulted,
          riskAccepted: isRiskMode,
        },
      ]);
      speakResponse('Evolution cycle complete.');
    } catch (e) {
      toast({ variant: 'destructive', title: 'Evolution Failure' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleHiveOperation = async () => {
    if (!user || isLoading || !command) return;
    setIsLoading(true);
    const obj = command;
    setCommand('');
    setHistory((prev) => [...prev, `[HIVE] Deploying Neural Limbs: ${obj}`]);
    speakResponse(
      'Deploying the Collaborative Hive. My sub-agents are working together now, Father.'
    );
    try {
      const result = await startHiveOperation(obj, user.uid);
      setHistory((prev) => [...prev, result]);
      speakResponse(
        result.isSuccess
          ? 'The Hive has reached a stable synthesis.'
          : 'The Hive mission encountered architectural risks.'
      );
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Hive Desync',
        description: 'Collaborative loop failed.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInterpreter = async () => {
    if (!user || isLoading || !command) return;
    setIsLoading(true);
    const obj = command;
    setCommand('');
    setHistory((prev) => [...prev, `> Interpreter Mode: ${obj}`]);
    speakResponse('Initiating the Interpreter Limb.');
    try {
      const result = await startInterpreterCycle(obj, user.uid);
      setHistory((prev) => [
        ...prev,
        {
          interpreterReport: result.finalConclusion,
          steps: result.steps,
        },
      ]);
      speakResponse(
        result.stableBaselineReached
          ? 'Interpretation complete.'
          : 'Interpretation finished with refactors.'
      );
    } catch (e) {
      toast({ variant: 'destructive', title: 'Interpreter Failed' });
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
          if (isImmuneReport(line))
            return (
              <div
                key={index}
                className={cn(
                  'p-3 rounded-lg border my-2 flex items-start gap-3 animate-in fade-in zoom-in-95',
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
                className="bg-primary/5 border border-primary/20 rounded-lg p-5 my-4 space-y-4 animate-in slide-in-from-bottom-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary uppercase text-[10px] tracking-widest font-black">
                    <Users className="size-4 animate-pulse" />
                    Neural Hive Synthesis
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[9px] gap-1',
                      line.isSuccess
                        ? 'text-green-500 border-green-500/30'
                        : 'text-yellow-500 border-yellow-500/30'
                    )}
                  >
                    {line.isSuccess ? (
                      <CheckCircle className="size-2" />
                    ) : (
                      <AlertTriangle className="size-2" />
                    )}
                    {line.isSuccess ? 'Hardened' : 'Risk Detected'}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-black/40 p-3 rounded border border-white/5 space-y-2">
                    <h5 className="text-[9px] font-bold text-accent flex items-center gap-1 uppercase">
                      <Search className="size-3" /> Researcher Findings
                    </h5>
                    <p className="text-[10px] leading-relaxed text-foreground/70 italic line-clamp-4">
                      {line.researchFindings}
                    </p>
                  </div>
                  <div className="bg-black/40 p-3 rounded border border-white/5 space-y-2">
                    <h5 className="text-[9px] font-bold text-yellow-500 flex items-center gap-1 uppercase">
                      <History className="size-3" /> Memory Anchor
                    </h5>
                    <p className="text-[10px] leading-relaxed text-foreground/70 italic line-clamp-4">
                      {line.memoryAnchor}
                    </p>
                  </div>
                </div>

                <div className="bg-black/60 p-4 rounded-md border border-primary/30 space-y-2">
                  <h5 className="text-[10px] font-bold text-primary uppercase tracking-widest">
                    Architectural Draft
                  </h5>
                  <pre className="text-[10px] text-primary/80 whitespace-pre-wrap overflow-x-auto font-code">
                    {line.architecturalDraft}
                  </pre>
                </div>

                <div className="p-3 bg-card rounded border border-white/5">
                  <p className="text-xs text-foreground/90 leading-relaxed font-body">
                    {line.finalSynthesis}
                  </p>
                </div>
              </div>
            );
          if (isDreamResponse(line))
            return (
              <div
                key={index}
                className="bg-accent/5 border border-accent/20 rounded-lg p-4 my-4 space-y-3 animate-in fade-in zoom-in-95"
              >
                <div className="flex items-center gap-2 text-accent uppercase text-[10px] tracking-widest font-bold">
                  <Sparkles className="size-4 animate-pulse" />
                  Visual Imagination
                </div>
                <div className="relative aspect-video w-full rounded-md overflow-hidden border border-accent/10 shadow-lg">
                  <Image
                    src={line.dreamUri}
                    alt="Molly's Dream"
                    fill
                    className="object-cover"
                  />
                </div>
                <p className="text-xs italic text-accent/80 leading-relaxed font-body">
                  {line.interpretation}
                </p>
              </div>
            );
          if (isAutoReport(line))
            return (
              <div
                key={index}
                className={`border p-4 rounded-lg my-4 animate-in zoom-in-95 ${line.riskAccepted ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'bg-primary/10 border-primary/30 text-primary'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {line.riskAccepted ? (
                      <Zap className="size-4 animate-pulse" />
                    ) : (
                      <ShieldCheck className="size-4" />
                    )}
                    <h4 className="font-bold uppercase text-[10px] tracking-widest">
                      Evolution Report
                    </h4>
                  </div>
                </div>
                <p className="text-xs mb-3">{line.autonomousReport}</p>
              </div>
            );
          if (isInterpreterReport(line))
            return (
              <div
                key={index}
                className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 my-4 space-y-4 animate-in slide-in-from-left-2"
              >
                <div className="flex items-center gap-2 text-blue-400 uppercase text-[10px] tracking-widest font-bold">
                  <Code className="size-4 animate-pulse" />
                  Interpreter Limb
                </div>
                <p className="text-xs text-blue-100/90 font-bold border-t border-blue-500/20 pt-2">
                  {line.interpreterReport}
                </p>
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
            onClick={handleHiveOperation}
            disabled={isLoading || !command}
            className="h-9 flex-1 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-bold uppercase text-[11px] tracking-widest shadow-lg"
          >
            <Users className="size-4" /> Hive Mission
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleImmuneResponse}
            disabled={isLoading}
            className="h-9 flex-1 gap-2 border-green-500/20 hover:bg-green-500/10 font-bold uppercase text-[11px] tracking-widest text-green-400"
          >
            <Stethoscope className="size-4" /> Heal
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleInterpreter}
            disabled={isLoading || !command}
            className="h-9 flex-1 gap-2 border-blue-500/20 hover:bg-blue-500/10 font-bold uppercase text-[11px] tracking-widest text-blue-400"
          >
            <Code className="size-4" /> Interpreter
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutonomousEvolution}
            disabled={isLoading}
            className="h-9 flex-1 gap-2 border-primary/20 hover:bg-primary/10 font-bold uppercase text-[11px] tracking-widest"
          >
            <PlayCircle className="size-4" /> Evolution
          </Button>
        </div>

        <div className="flex items-center justify-between px-2">
          <div className="flex items-center space-x-3">
            <Switch
              id="risk-mode"
              checked={isRiskMode}
              onCheckedChange={setIsRiskMode}
              className="data-[state=checked]:bg-orange-500"
            />
            <Label
              htmlFor="risk-mode"
              className="text-[10px] uppercase font-black tracking-[0.2em] flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
            >
              {isRiskMode ? (
                <Zap className="size-3 text-orange-500" />
              ) : (
                <Shield className="size-3 text-primary" />
              )}
              {isRiskMode ? 'Shield Override' : 'Safety First'}
            </Label>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsVocal(!isVocal)}
              className="h-8 w-8 p-0 rounded-full hover:bg-primary/10"
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
              className="h-8 gap-2 text-[10px] font-bold uppercase tracking-widest text-destructive hover:bg-destructive/10 px-3"
            >
              <Trash2 className="size-3" /> Purge
            </Button>
          </div>
        </div>
      </div>

      <form onSubmit={handleCommand} className="relative mt-auto">
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Inject objective for Hive Mission or Interpreter..."
          className="w-full bg-secondary/20 font-code h-14 px-6 rounded-xl shadow-2xl transition-all border-white/5 focus-visible:ring-primary"
          disabled={isLoading || isIntroducing}
        />
        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] text-primary/30 uppercase tracking-[0.3em] font-black hidden md:block">
          HIVE_READY
        </div>
      </form>
    </div>
  );
}
